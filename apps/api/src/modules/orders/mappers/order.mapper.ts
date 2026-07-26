import { Prisma } from '@prisma/client';
import { OrderEntity, OrderItemEntity } from '../entities/order.entity';

export type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

export class OrderMapper {
  static toEntity(order: OrderWithItems): OrderEntity {
    return {
      id: order.id,
      companyId: order.companyId,
      shopId: order.shopId,
      customerId: order.customerId,
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      totalAmount: order.totalAmount?.toString() ?? null,
      currency: order.currency,
      items: order.items.map(OrderMapper.itemToEntity),
    };
  }

  static itemToEntity(item: OrderWithItems['items'][number]): OrderItemEntity {
    return {
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice?.toString() ?? null,
      serialNumber: item.serialNumber,
      frameNumber: item.frameNumber,
      invoiceNumber: item.invoiceNumber,
    };
  }

  static toEntityList(orders: OrderWithItems[]): OrderEntity[] {
    return orders.map(OrderMapper.toEntity);
  }
}
