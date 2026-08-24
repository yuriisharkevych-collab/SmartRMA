import { PrismaService } from '../../prisma/prisma.service';
import { OrdersRepository } from './orders.repository';

const WITH_ITEMS = { items: true };

describe('OrdersRepository', () => {
  let prisma: {
    order: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let repository: OrdersRepository;

  beforeEach(() => {
    prisma = {
      order: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    repository = new OrdersRepository(prisma as unknown as PrismaService);
  });

  it('findByOrderNumber() odpytuje po złożonym unikalnym kluczu companyId+orderNumber', async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    await repository.findByOrderNumber('company-1', 'ZAM/2026/001');
    expect(prisma.order.findUnique).toHaveBeenCalledWith({
      where: { companyId_orderNumber: { companyId: 'company-1', orderNumber: 'ZAM/2026/001' } },
      include: WITH_ITEMS,
    });
  });

  it('findById() filtruje po id i companyId, dołącza pozycje zamówienia (IDOR — patrz audyt bezpieczeństwa)', async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    await repository.findById('order-1', 'company-1');
    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: 'order-1', companyId: 'company-1' },
      include: WITH_ITEMS,
    });
  });

  it('findAllForCompany() filtruje po companyId i sortuje od najnowszej daty zamówienia', async () => {
    prisma.order.findMany.mockResolvedValue([]);
    await repository.findAllForCompany('company-1');
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
      include: WITH_ITEMS,
      orderBy: { orderDate: 'desc' },
    });
  });

  it('search() filtruje po companyId i częściowym dopasowaniu orderNumber (case-insensitive)', async () => {
    prisma.order.findMany.mockResolvedValue([]);
    await repository.search('company-1', 'ZAM/2026');
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1', orderNumber: { contains: 'ZAM/2026', mode: 'insensitive' } },
      include: WITH_ITEMS,
      take: 50,
    });
  });

  it('findAllForCustomer() filtruje po customerId i companyId', async () => {
    prisma.order.findMany.mockResolvedValue([]);
    await repository.findAllForCustomer('customer-1', 'company-1');
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { customerId: 'customer-1', companyId: 'company-1' },
      include: WITH_ITEMS,
    });
  });

  it('create() dowiązuje companyId i tworzy zagnieżdżone OrderItem', async () => {
    prisma.order.create.mockResolvedValue({});
    await repository.create('company-1', {
      customerId: 'customer-1',
      orderNumber: 'ZAM/2026/001',
      orderDate: new Date('2026-01-01'),
      items: [{ productId: 'product-1', quantity: 2 }],
    });
    expect(prisma.order.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company-1',
        shopId: undefined,
        customerId: 'customer-1',
        orderNumber: 'ZAM/2026/001',
        orderDate: new Date('2026-01-01'),
        totalAmount: undefined,
        items: { create: [{ productId: 'product-1', quantity: 2 }] },
      },
      include: WITH_ITEMS,
    });
  });

  it('update() przekazuje dane wprost do prisma.order.update, dołączając pozycje w odpowiedzi', async () => {
    prisma.order.update.mockResolvedValue({});
    await repository.update('order-1', { orderNumber: 'ZAM/2026/002' });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { orderNumber: 'ZAM/2026/002' },
      include: WITH_ITEMS,
    });
  });
});
