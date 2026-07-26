import { Company, Shop } from '@prisma/client';
import { AuditRepository } from '../audit/audit.repository';
import { IEventBus } from '../../events/event-bus.interface';
import { EVENT_NAMES } from '../../events/event-names.const';
import { CompaniesRepository } from './companies.repository';
import { CompaniesService } from './companies.service';

function buildCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'company-1',
    name: 'Sklep Sportowy Sp. z o.o.',
    nip: '1234567890',
    address: 'ul. Testowa 1',
    email: 'kontakt@sklep.pl',
    phone: '600000000',
    active: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Company;
}

function buildShop(overrides: Partial<Shop> = {}): Shop {
  return {
    id: 'shop-1',
    companyId: 'company-1',
    name: 'Sklep Centrum',
    address: 'ul. Rynek 1',
    city: 'Warszawa',
    postalCode: '00-001',
    phone: '600000001',
    email: 'centrum@sklep.pl',
    active: true,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  } as Shop;
}

describe('CompaniesService', () => {
  let companiesRepository: jest.Mocked<
    Pick<CompaniesRepository, 'findById' | 'update' | 'findShopsByCompany' | 'findShopById' | 'createShop' | 'updateShop'>
  >;
  let auditRepository: jest.Mocked<Pick<AuditRepository, 'create'>>;
  let eventBus: jest.Mocked<IEventBus>;
  let service: CompaniesService;

  beforeEach(() => {
    companiesRepository = {
      findById: jest.fn(),
      update: jest.fn(),
      findShopsByCompany: jest.fn(),
      findShopById: jest.fn(),
      createShop: jest.fn(),
      updateShop: jest.fn(),
    };
    auditRepository = { create: jest.fn() };
    eventBus = { publish: jest.fn(), publishAll: jest.fn() };

    service = new CompaniesService(
      companiesRepository as unknown as CompaniesRepository,
      auditRepository as unknown as AuditRepository,
      eventBus,
    );
  });

  describe('findById', () => {
    it('rzuca NotFoundException, gdy firma nie istnieje (brak kodu COMPANY-* w ERROR_CODES.md)', async () => {
      companiesRepository.findById.mockResolvedValue(null);
      await expect(service.findById('brak')).rejects.toThrow();
    });

    it('zwraca CompanyEntity, gdy firma istnieje', async () => {
      companiesRepository.findById.mockResolvedValue(buildCompany());
      const result = await service.findById('company-1');
      expect(result.id).toBe('company-1');
    });
  });

  describe('update', () => {
    it('rzuca NotFoundException, gdy firma docelowa nie istnieje', async () => {
      companiesRepository.findById.mockResolvedValue(null);
      await expect(service.update('brak', { name: 'X' }, 'user-1')).rejects.toThrow();
      expect(companiesRepository.update).not.toHaveBeenCalled();
    });

    it('NIE zapisuje AuditLog ani nie publikuje zdarzenia, gdy żadne pole faktycznie się nie zmieniło', async () => {
      const before = buildCompany();
      companiesRepository.findById.mockResolvedValue(before);
      companiesRepository.update.mockResolvedValue(before);

      await service.update('company-1', { name: before.name }, 'user-1');

      expect(auditRepository.create).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('zapisuje AuditLog z poprzednią/nową wartością TYLKO zmienionych pól i publikuje CompanyUpdated', async () => {
      const before = buildCompany({ name: 'Stara Nazwa', phone: '111111111' });
      const after = buildCompany({ name: 'Nowa Nazwa', phone: '111111111' });
      companiesRepository.findById.mockResolvedValue(before);
      companiesRepository.update.mockResolvedValue(after);

      await service.update('company-1', { name: 'Nowa Nazwa' }, 'user-1');

      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-1',
          userId: 'user-1',
          action: 'COMPANY_UPDATED',
          entityType: 'Company',
          entityId: 'company-1',
          previousValue: { name: 'Stara Nazwa' },
          newValue: { name: 'Nowa Nazwa' },
        }),
      );
      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.COMPANY_UPDATED);
      expect(published.aggregateType).toBe('Company');
      expect(published.aggregateId).toBe('company-1');
      expect(published.actorUserId).toBe('user-1');
      expect(published.payload).toEqual({ changedFields: ['name'] });
    });
  });

  describe('createShop', () => {
    it('zapisuje AuditLog i publikuje ShopCreated', async () => {
      const shop = buildShop();
      companiesRepository.createShop.mockResolvedValue(shop);

      const result = await service.createShop('company-1', { name: shop.name }, 'user-1');

      expect(result.id).toBe('shop-1');
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'company-1', userId: 'user-1', action: 'SHOP_CREATED', entityType: 'Shop', entityId: 'shop-1' }),
      );
      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.SHOP_CREATED);
      expect(published.payload).toEqual({ name: shop.name });
    });
  });

  describe('updateShop', () => {
    it('rzuca NotFoundException, gdy placówka nie istnieje', async () => {
      companiesRepository.findShopById.mockResolvedValue(null);
      await expect(service.updateShop('brak', { name: 'X' }, 'user-1')).rejects.toThrow();
      expect(companiesRepository.updateShop).not.toHaveBeenCalled();
    });

    it('zapisuje AuditLog i publikuje ShopUpdated TYLKO gdy pola faktycznie się zmieniły', async () => {
      const before = buildShop({ city: 'Kraków' });
      const after = buildShop({ city: 'Warszawa' });
      companiesRepository.findShopById.mockResolvedValue(before);
      companiesRepository.updateShop.mockResolvedValue(after);

      await service.updateShop('shop-1', { city: 'Warszawa' }, 'user-1');

      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'company-1', action: 'SHOP_UPDATED', entityType: 'Shop', entityId: 'shop-1' }),
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.SHOP_UPDATED);
      expect(published.payload).toEqual({ changedFields: ['city'] });
    });
  });

  describe('deactivateShop', () => {
    it('rzuca NotFoundException, gdy placówka nie istnieje', async () => {
      companiesRepository.findShopById.mockResolvedValue(null);
      await expect(service.deactivateShop('brak', 'user-1')).rejects.toThrow();
    });

    it('ustawia active=false, zapisuje AuditLog i publikuje ShopDeactivated', async () => {
      const before = buildShop({ active: true });
      const after = buildShop({ active: false });
      companiesRepository.findShopById.mockResolvedValue(before);
      companiesRepository.updateShop.mockResolvedValue(after);

      const result = await service.deactivateShop('shop-1', 'user-1');

      expect(companiesRepository.updateShop).toHaveBeenCalledWith('shop-1', { active: false });
      expect(result.active).toBe(false);
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SHOP_DEACTIVATED',
          entityType: 'Shop',
          entityId: 'shop-1',
          previousValue: { active: true },
          newValue: { active: false },
        }),
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.SHOP_DEACTIVATED);
      expect(published.payload).toEqual({});
    });
  });
});
