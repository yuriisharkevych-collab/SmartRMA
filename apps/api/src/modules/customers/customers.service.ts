import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditRepository } from '../audit/audit.repository';
import { CustomerCreatedPayload, CustomerUpdatedPayload } from '../../events/contracts/customer.events';
import { DomainEvent } from '../../events/domain-event.base';
import { EVENT_BUS, IEventBus } from '../../events/event-bus.interface';
import { EVENT_NAMES } from '../../events/event-names.const';
import { CustomersRepository } from './customers.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerEntity } from './entities/customer.entity';
import { CustomerMapper } from './mappers/customer.mapper';

/** Tylko pola faktycznie przesłane w `patch` (obecne jako własne klucze DTO po ValidationPipe) i różne od `before` — wzorzec z `CompaniesService`. */
function diffChangedFields(before: object, patch: object): string[] {
  const b = before as Record<string, unknown>;
  const p = patch as Record<string, unknown>;
  return Object.keys(p).filter((key) => p[key] !== undefined && p[key] !== b[key]);
}

function pick(obj: object, keys: readonly string[]): Prisma.InputJsonValue {
  const o = obj as Record<string, unknown>;
  return Object.fromEntries(keys.map((key) => [key, o[key] ?? null])) as Prisma.InputJsonValue;
}

/**
 * DATABASE.md §10 — brak unikalności `email`/`phone`; deduplikacja to
 * wyszukiwanie ręczne przed utworzeniem (`GET /customers?query=`, BR-011
 * dokumentu źródłowego), NIE automatyczne odrzucenie przy tworzeniu —
 * `create()` celowo nie sprawdza duplikatów (świadome uproszczenie
 * prototypu, opisane wprost w DATABASE.md, nie luka).
 *
 * `deactivateCustomer()` NIE istnieje: `Customer` nie ma pola `active`
 * (DATABASE.md §10 — brak takiego pola w ogóle) i RBAC.md §"Customers /
 * Products / Orders" zna wyłącznie `customers.view`/`create`/`edit`, bez
 * `customers.deactivate`. Dodanie tego wymagałoby zmiany schematu i RBAC —
 * poza zakresem tego zadania, patrz raport końcowy Zadania 13.
 *
 * Brak kodów CUSTOMER-* w ERROR_CODES.md — "nie znaleziono" rzuca gołym
 * `NotFoundException()`, dokładnie jak `CompaniesService`/`DocumentsService`
 * (ten sam, już zaakceptowany brak).
 */
@Injectable()
export class CustomersService {
  constructor(
    private readonly customersRepository: CustomersRepository,
    private readonly auditRepository: AuditRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async findById(id: string): Promise<CustomerEntity> {
    const customer = await this.findCustomerOrThrow(id);
    return CustomerMapper.toEntity(customer);
  }

  async listCustomers(companyId: string): Promise<CustomerEntity[]> {
    return CustomerMapper.toEntityList(await this.customersRepository.findAllByCompany(companyId));
  }

  async searchCustomers(companyId: string, query: string): Promise<CustomerEntity[]> {
    return CustomerMapper.toEntityList(await this.customersRepository.search(companyId, query));
  }

  async createCustomer(companyId: string, dto: CreateCustomerDto, actorUserId: string): Promise<CustomerEntity> {
    const customer = await this.customersRepository.create(companyId, dto);

    await this.auditRepository.create({
      companyId,
      userId: actorUserId,
      action: 'CUSTOMER_CREATED',
      entityType: 'Customer',
      entityId: customer.id,
    });

    await this.eventBus.publish(
      new DomainEvent<CustomerCreatedPayload>({
        eventName: EVENT_NAMES.CUSTOMER_CREATED,
        companyId,
        aggregateType: 'Customer',
        aggregateId: customer.id,
        actorUserId,
        correlationId: randomUUID(),
        payload: {},
      }),
    );

    return CustomerMapper.toEntity(customer);
  }

  async updateCustomer(id: string, dto: UpdateCustomerDto, actorUserId: string): Promise<CustomerEntity> {
    const before = await this.findCustomerOrThrow(id);
    const updated = await this.customersRepository.update(id, dto);
    const changedFields = diffChangedFields(before, dto);

    if (changedFields.length > 0) {
      await this.auditRepository.create({
        companyId: before.companyId,
        userId: actorUserId,
        action: 'CUSTOMER_UPDATED',
        entityType: 'Customer',
        entityId: id,
        previousValue: pick(before, changedFields),
        newValue: pick(updated, changedFields),
      });

      await this.eventBus.publish(
        new DomainEvent<CustomerUpdatedPayload>({
          eventName: EVENT_NAMES.CUSTOMER_UPDATED,
          companyId: before.companyId,
          aggregateType: 'Customer',
          aggregateId: id,
          actorUserId,
          correlationId: randomUUID(),
          payload: { changedFields },
        }),
      );
    }

    return CustomerMapper.toEntity(updated);
  }

  private async findCustomerOrThrow(id: string) {
    const customer = await this.customersRepository.findById(id);
    if (!customer) throw new NotFoundException();
    return customer;
  }
}
