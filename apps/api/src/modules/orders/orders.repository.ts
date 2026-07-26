import { Injectable } from '@nestjs/common';
import { OrderItem } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderWithItems } from './mappers/order.mapper';

const WITH_ITEMS = { items: true } as const;

/**
 * Czyste operacje na danych — bez sprawdzania referencji (Customer/Shop/
 * Product), bez zapisu AuditLog, bez publikacji zdarzeń. To wszystko żyje w
 * `OrdersService` (wzorzec z `CasesRepository`: "metody tutaj są celowo
 * głupie"). Typy pól `update()` zawężone do `Pick<Order, ...>` — nie
 * `Prisma.OrderUpdateInput` wprost (ten sam błąd naprawiony w Zadaniu 14 dla
 * `ProductsRepository`).
 */
@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByOrderNumber(companyId: string, orderNumber: string): Promise<OrderWithItems | null> {
    return this.prisma.order.findUnique({
      where: { companyId_orderNumber: { companyId, orderNumber } },
      include: WITH_ITEMS,
    });
  }

  findById(id: string): Promise<OrderWithItems | null> {
    return this.prisma.order.findUnique({ where: { id }, include: WITH_ITEMS });
  }

  findAllForCompany(companyId: string): Promise<OrderWithItems[]> {
    return this.prisma.order.findMany({ where: { companyId }, include: WITH_ITEMS, orderBy: { orderDate: 'desc' } });
  }

  /** BR/WORKFLOW.md §6 poz. 12 dotyczy wyłącznie dopasowania dokładnego (`findByOrderNumber`) — to jest szersze wyszukiwanie tekstowe dla `GET /orders?query=`, wzorzec z `ProductsRepository.search`. */
  search(companyId: string, query: string): Promise<OrderWithItems[]> {
    return this.prisma.order.findMany({
      where: { companyId, orderNumber: { contains: query, mode: 'insensitive' } },
      include: WITH_ITEMS,
      take: 50,
    });
  }

  findAllForCustomer(customerId: string): Promise<OrderWithItems[]> {
    return this.prisma.order.findMany({ where: { customerId }, include: WITH_ITEMS });
  }

  /** Zadanie 16 (Cases) — weryfikacja referencji `CaseItem.orderItemId` przed zapisem sprawy. */
  findOrderItemById(id: string): Promise<OrderItem | null> {
    return this.prisma.orderItem.findUnique({ where: { id } });
  }

  create(
    companyId: string,
    data: {
      shopId?: string;
      customerId: string;
      orderNumber: string;
      orderDate: Date;
      totalAmount?: number;
      items: Array<{
        productId: string;
        quantity?: number;
        unitPrice?: number;
        serialNumber?: string;
        frameNumber?: string;
        invoiceNumber?: string;
      }>;
    },
  ): Promise<OrderWithItems> {
    return this.prisma.order.create({
      data: {
        companyId,
        shopId: data.shopId,
        customerId: data.customerId,
        orderNumber: data.orderNumber,
        orderDate: data.orderDate,
        totalAmount: data.totalAmount,
        items: { create: data.items },
      },
      include: WITH_ITEMS,
    });
  }

  /** Typ jawny, nie `Pick<Order,...>` — `Order.totalAmount` w typie modelu to `Decimal | null`, a wejście z DTO to `number`; Prisma akceptuje `number` dla pól `Decimal` na wejściu, ale typ modelu (wyjściowy) tego nie wyraża. */
  update(
    id: string,
    data: { shopId?: string; customerId?: string; orderNumber?: string; orderDate?: Date; totalAmount?: number },
  ): Promise<OrderWithItems> {
    return this.prisma.order.update({ where: { id }, data, include: WITH_ITEMS });
  }
}
