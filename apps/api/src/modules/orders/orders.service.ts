import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { AuditRepository } from '../audit/audit.repository';
import { CompaniesService } from '../companies/companies.service';
import { CustomersService } from '../customers/customers.service';
import { OrderCreatedPayload, OrderUpdatedPayload } from '../../events/contracts/order.events';
import { DomainEvent } from '../../events/domain-event.base';
import { EVENT_BUS, IEventBus } from '../../events/event-bus.interface';
import { EVENT_NAMES } from '../../events/event-names.const';
import { ProductsService } from '../products/products.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderEntity, OrderItemEntity } from './entities/order.entity';
import { OrderMapper, OrderWithItems } from './mappers/order.mapper';
import { OrdersRepository } from './orders.repository';

const ORDER_AUDIT_FIELDS = [
  'shopId',
  'customerId',
  'orderNumber',
  'orderDate',
  'totalAmount',
] as const;

/** `Prisma.Decimal`/`Date` nie porównują się poprawnie przez `!==` (referencje, nie wartości) — normalizacja do prymitywu przed porównaniem/zapisem do JSON. */
function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.getTime();
  if (value instanceof Prisma.Decimal) return value.toNumber();
  return value;
}

function toJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toNumber();
  return value ?? null;
}

/** Tylko pola faktycznie przesłane w `patch` i różne (po normalizacji Date/Decimal) od `before` — wzorzec z `CompaniesService`, rozszerzony o typy specyficzne dla `Order`. */
function diffChangedFields(before: object, patch: object): string[] {
  const b = before as Record<string, unknown>;
  const p = patch as Record<string, unknown>;
  return Object.keys(p).filter(
    (key) => p[key] !== undefined && normalize(p[key]) !== normalize(b[key]),
  );
}

function pick(obj: object, keys: readonly string[]): Prisma.InputJsonValue {
  const o = obj as Record<string, unknown>;
  return Object.fromEntries(keys.map((key) => [key, toJsonValue(o[key])])) as Prisma.InputJsonValue;
}

/**
 * DATABASE.md §17 — `@@unique([companyId, orderNumber])` → ORDER-002
 * (już istnieje w `ERROR_CODES.md`/`error-codes.const.ts`), weryfikowane
 * przez pre-check (`findByOrderNumber`), nie przez łapanie P2002 z Prisma
 * (ten sam wzorzec co `USER-001` w `UsersService`).
 *
 * "Walidacja referencji" (zadanie, sekcja dedykowana) — `customerId`,
 * `shopId` (opcjonalny), `OrderItem.productId` weryfikowane PRZED zapisem
 * przez reużycie istniejących serwisów (`CustomersService.findById`,
 * `CompaniesService.findShopById`, `ProductsService.findById` — wszystkie
 * rzucają gołym `NotFoundException()`), nigdy przez poleganie na wyjątku FK
 * z Prisma (P2003). `companyId` NIE jest osobno weryfikowany — pochodzi
 * wyłącznie z tokenu JWT (`user.companyId`), nigdy z ciała żądania, więc
 * odwołanie do nieistniejącej firmy nie jest możliwe tą drogą (BR-086).
 *
 * `OrderItem` traktowany jako część agregatu `Order` — bez własnego
 * `AuditLog`/zdarzenia (EVENTS.md nigdy nie definiował `orderItem.*`, patrz
 * `events/contracts/order.events.ts`). `updateOrder()` edytuje wyłącznie pola
 * `Order` — patrz `UpdateOrderDto` dla uzasadnienia braku edycji `items`.
 *
 * Brak kodu ORDER-* dla "nie znaleziono zamówienia po id" (ORDER-001 dotyczy
 * WYŁĄCZNIE wyszukiwania po numerze w kreatorze, HTTP 200 informacyjny, nie
 * 404) — `findOrderOrThrow` rzuca gołym `NotFoundException()`, tak jak
 * `CompaniesService`/`CustomersService`/`ProductsService`.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly auditRepository: AuditRepository,
    private readonly customersService: CustomersService,
    private readonly companiesService: CompaniesService,
    private readonly productsService: ProductsService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async findByOrderNumber(companyId: string, orderNumber: string): Promise<OrderEntity | null> {
    const order = await this.ordersRepository.findByOrderNumber(companyId, orderNumber);
    return order ? OrderMapper.toEntity(order) : null;
  }

  async findById(id: string, companyId: string): Promise<OrderEntity> {
    const order = await this.findOrderOrThrow(id, companyId);
    return OrderMapper.toEntity(order);
  }

  async listOrders(companyId: string): Promise<OrderEntity[]> {
    return OrderMapper.toEntityList(await this.ordersRepository.findAllForCompany(companyId));
  }

  async searchOrders(companyId: string, query: string): Promise<OrderEntity[]> {
    return OrderMapper.toEntityList(await this.ordersRepository.search(companyId, query));
  }

  /** Zadanie 16 (Cases) — weryfikacja referencji `CaseItem.orderItemId` przed zapisem sprawy, reużywając ten serwis zamiast duplikować existence-check. */
  async findOrderItemById(id: string, companyId: string): Promise<OrderItemEntity> {
    const item = await this.ordersRepository.findOrderItemById(id, companyId);
    if (!item) throw new NotFoundException();
    return OrderMapper.itemToEntity(item);
  }

  async findAllForCustomer(customerId: string, companyId: string): Promise<OrderEntity[]> {
    return OrderMapper.toEntityList(
      await this.ordersRepository.findAllForCustomer(customerId, companyId),
    );
  }

  async createOrder(
    companyId: string,
    dto: CreateOrderDto,
    actorUserId: string,
  ): Promise<OrderEntity> {
    await this.customersService.findById(dto.customerId, companyId);
    if (dto.shopId) await this.companiesService.findShopById(dto.shopId, companyId);
    for (const item of dto.items) {
      await this.productsService.findById(item.productId, companyId);
    }

    const existing = await this.ordersRepository.findByOrderNumber(companyId, dto.orderNumber);
    if (existing) {
      throw new AppException(
        ERROR_CODES.ORDER_002.code,
        ERROR_CODES.ORDER_002.message,
        ERROR_CODES.ORDER_002.status,
      );
    }

    const order = await this.ordersRepository.create(companyId, {
      ...dto,
      orderDate: new Date(dto.orderDate),
    });

    await this.auditRepository.create({
      companyId,
      userId: actorUserId,
      action: 'ORDER_CREATED',
      entityType: 'Order',
      entityId: order.id,
      newValue: pick(order, ORDER_AUDIT_FIELDS),
    });

    await this.eventBus.publish(
      new DomainEvent<OrderCreatedPayload>({
        eventName: EVENT_NAMES.ORDER_CREATED,
        companyId,
        aggregateType: 'Order',
        aggregateId: order.id,
        actorUserId,
        correlationId: randomUUID(),
        payload: { orderNumber: order.orderNumber, itemCount: order.items.length },
      }),
    );

    return OrderMapper.toEntity(order);
  }

  async updateOrder(
    id: string,
    companyId: string,
    dto: UpdateOrderDto,
    actorUserId: string,
  ): Promise<OrderEntity> {
    const before = await this.findOrderOrThrow(id, companyId);

    if (dto.customerId) await this.customersService.findById(dto.customerId, companyId);
    if (dto.shopId) await this.companiesService.findShopById(dto.shopId, companyId);
    if (dto.orderNumber && dto.orderNumber !== before.orderNumber) {
      const existing = await this.ordersRepository.findByOrderNumber(
        before.companyId,
        dto.orderNumber,
      );
      if (existing) {
        throw new AppException(
          ERROR_CODES.ORDER_002.code,
          ERROR_CODES.ORDER_002.message,
          ERROR_CODES.ORDER_002.status,
        );
      }
    }

    const patch = { ...dto, orderDate: dto.orderDate ? new Date(dto.orderDate) : undefined };
    const updated = await this.ordersRepository.update(id, patch);
    const changedFields = diffChangedFields(before, patch);

    if (changedFields.length > 0) {
      await this.auditRepository.create({
        companyId: before.companyId,
        userId: actorUserId,
        action: 'ORDER_UPDATED',
        entityType: 'Order',
        entityId: id,
        previousValue: pick(before, changedFields),
        newValue: pick(updated, changedFields),
      });

      await this.eventBus.publish(
        new DomainEvent<OrderUpdatedPayload>({
          eventName: EVENT_NAMES.ORDER_UPDATED,
          companyId: before.companyId,
          aggregateType: 'Order',
          aggregateId: id,
          actorUserId,
          correlationId: randomUUID(),
          payload: { changedFields },
        }),
      );
    }

    return OrderMapper.toEntity(updated);
  }

  private async findOrderOrThrow(id: string, companyId: string): Promise<OrderWithItems> {
    const order = await this.ordersRepository.findById(id, companyId);
    if (!order) throw new NotFoundException();
    return order;
  }
}
