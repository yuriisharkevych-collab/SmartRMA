import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditRepository } from '../audit/audit.repository';
import { CompaniesService } from '../companies/companies.service';
import { CustomersService } from '../customers/customers.service';
import { IEventBus } from '../../events/event-bus.interface';
import { EVENT_NAMES } from '../../events/event-names.const';
import { ProductsService } from '../products/products.service';
import { OrderWithItems } from './mappers/order.mapper';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

function buildOrder(overrides: Partial<OrderWithItems> = {}): OrderWithItems {
  return {
    id: 'order-1',
    companyId: 'company-1',
    shopId: null,
    customerId: 'customer-1',
    orderNumber: 'ZAM/2026/001',
    orderDate: new Date('2026-01-01T00:00:00.000Z'),
    totalAmount: new Prisma.Decimal(100),
    currency: 'PLN',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    items: [
      {
        id: 'item-1',
        orderId: 'order-1',
        productId: 'product-1',
        quantity: 1,
        unitPrice: null,
        serialNumber: null,
        frameNumber: null,
        invoiceNumber: null,
      },
    ],
    ...overrides,
  } as unknown as OrderWithItems;
}

describe('OrdersService', () => {
  let ordersRepository: jest.Mocked<
    Pick<
      OrdersRepository,
      | 'findByOrderNumber'
      | 'findById'
      | 'findAllForCompany'
      | 'search'
      | 'findAllForCustomer'
      | 'create'
      | 'update'
    >
  >;
  let auditRepository: jest.Mocked<Pick<AuditRepository, 'create'>>;
  let customersService: jest.Mocked<Pick<CustomersService, 'findById'>>;
  let companiesService: jest.Mocked<Pick<CompaniesService, 'findShopById'>>;
  let productsService: jest.Mocked<Pick<ProductsService, 'findById'>>;
  let eventBus: jest.Mocked<IEventBus>;
  let service: OrdersService;

  const createDto = {
    customerId: 'customer-1',
    orderNumber: 'ZAM/2026/001',
    orderDate: '2026-01-01T00:00:00.000Z',
    items: [{ productId: 'product-1', quantity: 1 }],
  };

  beforeEach(() => {
    ordersRepository = {
      findByOrderNumber: jest.fn(),
      findById: jest.fn(),
      findAllForCompany: jest.fn(),
      search: jest.fn(),
      findAllForCustomer: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    auditRepository = { create: jest.fn() };
    customersService = { findById: jest.fn().mockResolvedValue({ id: 'customer-1' }) };
    companiesService = { findShopById: jest.fn().mockResolvedValue({ id: 'shop-1' }) };
    productsService = { findById: jest.fn().mockResolvedValue({ id: 'product-1' }) };
    eventBus = { publish: jest.fn(), publishAll: jest.fn() };

    service = new OrdersService(
      ordersRepository as unknown as OrdersRepository,
      auditRepository as unknown as AuditRepository,
      customersService as unknown as CustomersService,
      companiesService as unknown as CompaniesService,
      productsService as unknown as ProductsService,
      eventBus,
    );
  });

  describe('findById', () => {
    it('rzuca NotFoundException, gdy zamówienie nie istnieje (ORDER-001 dotyczy tylko wyszukiwania po numerze)', async () => {
      ordersRepository.findById.mockResolvedValue(null);
      await expect(service.findById('brak', 'company-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listOrders / searchOrders', () => {
    it('listOrders() deleguje do findAllForCompany()', async () => {
      ordersRepository.findAllForCompany.mockResolvedValue([buildOrder()]);
      await service.listOrders('company-1');
      expect(ordersRepository.findAllForCompany).toHaveBeenCalledWith('company-1');
    });

    it('searchOrders() deleguje do search() z frazą', async () => {
      ordersRepository.search.mockResolvedValue([buildOrder()]);
      await service.searchOrders('company-1', 'ZAM');
      expect(ordersRepository.search).toHaveBeenCalledWith('company-1', 'ZAM');
    });
  });

  describe('createOrder', () => {
    it('weryfikuje istnienie customerId PRZED zapisem — 404, gdy klient nie istnieje', async () => {
      customersService.findById.mockRejectedValue(new NotFoundException());
      await expect(service.createOrder('company-1', createDto, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(ordersRepository.create).not.toHaveBeenCalled();
    });

    it('weryfikuje istnienie shopId, gdy podane — 404, gdy sklep nie istnieje', async () => {
      companiesService.findShopById.mockRejectedValue(new NotFoundException());
      await expect(
        service.createOrder('company-1', { ...createDto, shopId: 'brak' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
      expect(ordersRepository.create).not.toHaveBeenCalled();
    });

    it('weryfikuje istnienie KAŻDEGO productId z pozycji — 404, gdy jedna pozycja wskazuje nieistniejący produkt', async () => {
      productsService.findById.mockRejectedValueOnce(new NotFoundException());
      await expect(
        service.createOrder(
          'company-1',
          { ...createDto, items: [{ productId: 'brak', quantity: 1 }] },
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(ordersRepository.create).not.toHaveBeenCalled();
    });

    it('rzuca ORDER-002, gdy numer zamówienia już istnieje w firmie (pre-check, nie P2002 z Prisma)', async () => {
      ordersRepository.findByOrderNumber.mockResolvedValue(buildOrder());
      await expect(service.createOrder('company-1', createDto, 'user-1')).rejects.toMatchObject({
        code: 'ORDER-002',
      });
      expect(ordersRepository.create).not.toHaveBeenCalled();
    });

    it('tworzy zamówienie, zapisuje AuditLog i publikuje OrderCreated', async () => {
      ordersRepository.findByOrderNumber.mockResolvedValue(null);
      const order = buildOrder();
      ordersRepository.create.mockResolvedValue(order);

      const result = await service.createOrder('company-1', createDto, 'user-1');

      expect(result.id).toBe('order-1');
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-1',
          userId: 'user-1',
          action: 'ORDER_CREATED',
          entityType: 'Order',
          entityId: 'order-1',
        }),
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.ORDER_CREATED);
      expect(published.payload).toEqual({ orderNumber: 'ZAM/2026/001', itemCount: 1 });
    });
  });

  describe('updateOrder', () => {
    it('rzuca NotFoundException, gdy zamówienie docelowe nie istnieje', async () => {
      ordersRepository.findById.mockResolvedValue(null);
      await expect(
        service.updateOrder('brak', 'company-1', { orderNumber: 'X' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
      expect(ordersRepository.update).not.toHaveBeenCalled();
    });

    it('NIE sprawdza kolizji numeru, gdy orderNumber w ogóle się nie zmienia', async () => {
      const before = buildOrder();
      ordersRepository.findById.mockResolvedValue(before);
      ordersRepository.update.mockResolvedValue(before);

      await service.updateOrder(
        'order-1',
        'company-1',
        { orderNumber: before.orderNumber },
        'user-1',
      );

      expect(ordersRepository.findByOrderNumber).not.toHaveBeenCalled();
    });

    it('rzuca ORDER-002, gdy NOWY numer zamówienia koliduje z innym zamówieniem firmy', async () => {
      const before = buildOrder();
      ordersRepository.findById.mockResolvedValue(before);
      ordersRepository.findByOrderNumber.mockResolvedValue(
        buildOrder({ id: 'order-2', orderNumber: 'ZAM/2026/002' }),
      );

      await expect(
        service.updateOrder('order-1', 'company-1', { orderNumber: 'ZAM/2026/002' }, 'user-1'),
      ).rejects.toMatchObject({ code: 'ORDER-002' });
      expect(ordersRepository.update).not.toHaveBeenCalled();
    });

    it('NIE zapisuje AuditLog ani nie publikuje zdarzenia, gdy Decimal/Date są równe wartościowo mimo różnych referencji', async () => {
      const before = buildOrder({
        totalAmount: new Prisma.Decimal(100),
        orderDate: new Date('2026-01-01T00:00:00.000Z'),
      });
      ordersRepository.findById.mockResolvedValue(before);
      ordersRepository.update.mockResolvedValue(before);

      await service.updateOrder(
        'order-1',
        'company-1',
        { totalAmount: 100, orderDate: '2026-01-01T00:00:00.000Z' },
        'user-1',
      );

      expect(auditRepository.create).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('zapisuje AuditLog z diffem TYLKO zmienionych pól i publikuje OrderUpdated', async () => {
      const before = buildOrder({ totalAmount: new Prisma.Decimal(100) });
      const after = buildOrder({ totalAmount: new Prisma.Decimal(150) });
      ordersRepository.findById.mockResolvedValue(before);
      ordersRepository.update.mockResolvedValue(after);

      await service.updateOrder('order-1', 'company-1', { totalAmount: 150 }, 'user-1');

      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ORDER_UPDATED',
          previousValue: { totalAmount: 100 },
          newValue: { totalAmount: 150 },
        }),
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.ORDER_UPDATED);
      expect(published.payload).toEqual({ changedFields: ['totalAmount'] });
    });
  });
});
