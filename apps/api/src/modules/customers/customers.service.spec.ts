import { Customer } from '@prisma/client';
import { AuditRepository } from '../audit/audit.repository';
import { IEventBus } from '../../events/event-bus.interface';
import { EVENT_NAMES } from '../../events/event-names.const';
import { CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';

function buildCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-1',
    companyId: 'company-1',
    firstName: 'Jan',
    lastName: 'Kowalski',
    phone: '600000000',
    email: 'jan.kowalski@example.com',
    address: 'ul. Testowa 1',
    notes: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  } as Customer;
}

describe('CustomersService', () => {
  let customersRepository: jest.Mocked<
    Pick<CustomersRepository, 'findById' | 'findAllByCompany' | 'search' | 'create' | 'update'>
  >;
  let auditRepository: jest.Mocked<Pick<AuditRepository, 'create'>>;
  let eventBus: jest.Mocked<IEventBus>;
  let service: CustomersService;

  beforeEach(() => {
    customersRepository = {
      findById: jest.fn(),
      findAllByCompany: jest.fn(),
      search: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    auditRepository = { create: jest.fn() };
    eventBus = { publish: jest.fn(), publishAll: jest.fn() };

    service = new CustomersService(
      customersRepository as unknown as CustomersRepository,
      auditRepository as unknown as AuditRepository,
      eventBus,
    );
  });

  describe('findById', () => {
    it('rzuca NotFoundException, gdy klient nie istnieje (brak kodu CUSTOMER-* w ERROR_CODES.md)', async () => {
      customersRepository.findById.mockResolvedValue(null);
      await expect(service.findById('brak')).rejects.toThrow();
    });

    it('zwraca CustomerEntity, gdy klient istnieje', async () => {
      customersRepository.findById.mockResolvedValue(buildCustomer());
      const result = await service.findById('customer-1');
      expect(result.id).toBe('customer-1');
    });
  });

  describe('listCustomers / searchCustomers', () => {
    it('listCustomers() zwraca wszystkich klientów firmy (bez filtra)', async () => {
      customersRepository.findAllByCompany.mockResolvedValue([buildCustomer()]);
      const result = await service.listCustomers('company-1');
      expect(customersRepository.findAllByCompany).toHaveBeenCalledWith('company-1');
      expect(result).toHaveLength(1);
    });

    it('searchCustomers() deleguje do repository.search() z frazą', async () => {
      customersRepository.search.mockResolvedValue([buildCustomer()]);
      await service.searchCustomers('company-1', 'kowalski');
      expect(customersRepository.search).toHaveBeenCalledWith('company-1', 'kowalski');
    });
  });

  describe('createCustomer', () => {
    it('NIE sprawdza duplikatów e-maila/telefonu (DATABASE.md §10 — brak unikalności, świadome uproszczenie)', async () => {
      const dto = { firstName: 'Jan', lastName: 'Kowalski', phone: '600000000' };
      customersRepository.create.mockResolvedValue(buildCustomer());

      await service.createCustomer('company-1', dto, 'user-1');

      expect(customersRepository.findById).not.toHaveBeenCalled();
      expect(customersRepository.create).toHaveBeenCalledWith('company-1', dto);
    });

    it('zapisuje AuditLog i publikuje CustomerCreated (payload BEZ danych osobowych, EVENTS.md §2.1 pkt 3)', async () => {
      const customer = buildCustomer();
      customersRepository.create.mockResolvedValue(customer);

      const result = await service.createCustomer('company-1', { firstName: 'Jan', lastName: 'Kowalski', phone: '600000000' }, 'user-1');

      expect(result.id).toBe('customer-1');
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'company-1', userId: 'user-1', action: 'CUSTOMER_CREATED', entityType: 'Customer', entityId: 'customer-1' }),
      );
      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.CUSTOMER_CREATED);
      expect(published.aggregateType).toBe('Customer');
      expect(published.aggregateId).toBe('customer-1');
      expect(published.actorUserId).toBe('user-1');
      expect(published.payload).toEqual({});
    });
  });

  describe('updateCustomer', () => {
    it('rzuca NotFoundException, gdy klient docelowy nie istnieje', async () => {
      customersRepository.findById.mockResolvedValue(null);
      await expect(service.updateCustomer('brak', { lastName: 'X' }, 'user-1')).rejects.toThrow();
      expect(customersRepository.update).not.toHaveBeenCalled();
    });

    it('NIE zapisuje AuditLog ani nie publikuje zdarzenia, gdy żadne pole faktycznie się nie zmieniło', async () => {
      const before = buildCustomer();
      customersRepository.findById.mockResolvedValue(before);
      customersRepository.update.mockResolvedValue(before);

      await service.updateCustomer('customer-1', { lastName: before.lastName }, 'user-1');

      expect(auditRepository.create).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('zapisuje AuditLog z diffem TYLKO zmienionych pól i publikuje CustomerUpdated', async () => {
      const before = buildCustomer({ lastName: 'Kowalski', phone: '600000000' });
      const after = buildCustomer({ lastName: 'Nowak', phone: '600000000' });
      customersRepository.findById.mockResolvedValue(before);
      customersRepository.update.mockResolvedValue(after);

      await service.updateCustomer('customer-1', { lastName: 'Nowak' }, 'user-1');

      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-1',
          userId: 'user-1',
          action: 'CUSTOMER_UPDATED',
          entityType: 'Customer',
          entityId: 'customer-1',
          previousValue: { lastName: 'Kowalski' },
          newValue: { lastName: 'Nowak' },
        }),
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.CUSTOMER_UPDATED);
      expect(published.payload).toEqual({ changedFields: ['lastName'] });
    });
  });
});
