import { Company, Shop } from '@prisma/client';
import { AuditRepository } from '../audit/audit.repository';
import { PasswordService } from '../auth/services/password.service';
import { IEventBus } from '../../events/event-bus.interface';
import { EVENT_NAMES } from '../../events/event-names.const';
import { IStorageService } from '../../storage/storage.interface';
import { CompaniesRepository } from './companies.repository';
import { CompaniesService } from './companies.service';

/** Marker unikalny per test — potwierdza, że repozytorium dostaje DOKŁADNIE ten `tx`, którym `$transaction` wywołał callback (nie `this.prisma`), ten sam wzorzec co `cases.service.spec.ts`. */
const TX_MARKER = { __tx: true } as const;

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
    Pick<
      CompaniesRepository,
      | 'findById'
      | 'update'
      | 'updateLogoPath'
      | 'findShopsByCompany'
      | 'findShopById'
      | 'createShop'
      | 'updateShop'
      | 'slugExists'
      | 'caseNumberPrefixExists'
      | 'passwordAccountEmailExists'
      | 'createOrganizationShell'
      | 'createFirstAdmin'
    >
  >;
  let auditRepository: jest.Mocked<Pick<AuditRepository, 'create'>>;
  let prisma: { $transaction: jest.Mock };
  let passwordService: jest.Mocked<Pick<PasswordService, 'hash'>>;
  let eventBus: jest.Mocked<IEventBus>;
  let storageService: jest.Mocked<IStorageService>;
  let service: CompaniesService;

  beforeEach(() => {
    companiesRepository = {
      findById: jest.fn(),
      update: jest.fn(),
      updateLogoPath: jest.fn(),
      findShopsByCompany: jest.fn(),
      findShopById: jest.fn(),
      createShop: jest.fn(),
      updateShop: jest.fn(),
      slugExists: jest.fn(),
      caseNumberPrefixExists: jest.fn(),
      passwordAccountEmailExists: jest.fn(),
      createOrganizationShell: jest.fn(),
      createFirstAdmin: jest.fn(),
    };
    auditRepository = { create: jest.fn() };
    prisma = { $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(TX_MARKER)) };
    passwordService = { hash: jest.fn() };
    eventBus = { publish: jest.fn(), publishAll: jest.fn() };
    storageService = { save: jest.fn(), read: jest.fn(), copy: jest.fn() };

    service = new CompaniesService(
      companiesRepository as unknown as CompaniesRepository,
      auditRepository as unknown as AuditRepository,
      prisma as never,
      passwordService as unknown as PasswordService,
      eventBus,
      storageService,
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
        expect.objectContaining({
          companyId: 'company-1',
          userId: 'user-1',
          action: 'SHOP_CREATED',
          entityType: 'Shop',
          entityId: 'shop-1',
        }),
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
      await expect(
        service.updateShop('brak', 'company-1', { name: 'X' }, 'user-1'),
      ).rejects.toThrow();
      expect(companiesRepository.updateShop).not.toHaveBeenCalled();
    });

    it('zapisuje AuditLog i publikuje ShopUpdated TYLKO gdy pola faktycznie się zmieniły', async () => {
      const before = buildShop({ city: 'Kraków' });
      const after = buildShop({ city: 'Warszawa' });
      companiesRepository.findShopById.mockResolvedValue(before);
      companiesRepository.updateShop.mockResolvedValue(after);

      await service.updateShop('shop-1', 'company-1', { city: 'Warszawa' }, 'user-1');

      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-1',
          action: 'SHOP_UPDATED',
          entityType: 'Shop',
          entityId: 'shop-1',
        }),
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.SHOP_UPDATED);
      expect(published.payload).toEqual({ changedFields: ['city'] });
    });
  });

  describe('deactivateShop', () => {
    it('rzuca NotFoundException, gdy placówka nie istnieje', async () => {
      companiesRepository.findShopById.mockResolvedValue(null);
      await expect(service.deactivateShop('brak', 'company-1', 'user-1')).rejects.toThrow();
    });

    it('ustawia active=false, zapisuje AuditLog i publikuje ShopDeactivated', async () => {
      const before = buildShop({ active: true });
      const after = buildShop({ active: false });
      companiesRepository.findShopById.mockResolvedValue(before);
      companiesRepository.updateShop.mockResolvedValue(after);

      const result = await service.deactivateShop('shop-1', 'company-1', 'user-1');

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

  describe('uploadLogo / getLogoBuffer', () => {
    const file = {
      originalname: 'logo.png',
      mimetype: 'image/png',
      size: 1024,
      buffer: Buffer.from('x'),
    } as Express.Multer.File;

    it('zapisuje plik przez IStorageService pod caseId="logo" i aktualizuje logoPath', async () => {
      companiesRepository.findById.mockResolvedValue(buildCompany());
      storageService.save.mockResolvedValue({
        storagePath: 'company-1/logo/uuid-logo.png',
        fileName: 'logo.png',
        mimeType: 'image/png',
        fileSize: 1024,
      });
      companiesRepository.updateLogoPath.mockResolvedValue(
        buildCompany({ logoPath: 'company-1/logo/uuid-logo.png' } as never),
      );

      const result = await service.uploadLogo('company-1', file, 'user-1');

      expect(storageService.save).toHaveBeenCalledWith('company-1', 'logo', file);
      expect(companiesRepository.updateLogoPath).toHaveBeenCalledWith(
        'company-1',
        'company-1/logo/uuid-logo.png',
      );
      expect(result.logoUrl).toBe(
        `/companies/company-1/logo?v=${new Date('2026-01-01').getTime()}`,
      );
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'COMPANY_LOGO_UPDATED' }),
      );
    });

    it('rzuca NotFoundException z getLogoBuffer, gdy firma nie ma jeszcze logo', async () => {
      companiesRepository.findById.mockResolvedValue(buildCompany());
      await expect(service.getLogoBuffer('company-1')).rejects.toThrow();
      expect(storageService.read).not.toHaveBeenCalled();
    });

    it('czyta plik przez IStorageService, gdy logoPath jest ustawiony', async () => {
      companiesRepository.findById.mockResolvedValue(
        buildCompany({ logoPath: 'company-1/logo/uuid-logo.png' } as never),
      );
      storageService.read.mockResolvedValue(Buffer.from('dane-obrazu'));

      const result = await service.getLogoBuffer('company-1');

      expect(storageService.read).toHaveBeenCalledWith('company-1/logo/uuid-logo.png');
      expect(result.buffer.toString()).toBe('dane-obrazu');
    });
  });

  describe('signup — onboarding samoobsługowy (Fundament „Fresh Install")', () => {
    const dto = {
      companyName: 'TextilePro',
      orgType: 'Producent' as const,
      nip: '1234567890',
      adminFirstName: 'Anna',
      adminLastName: 'Nowak',
      adminEmail: 'anna@textilepro.pl',
      password: 'Bezpieczne-Haslo-123',
    };

    function stubHappyPath() {
      companiesRepository.passwordAccountEmailExists.mockResolvedValue(false);
      companiesRepository.slugExists.mockResolvedValue(false);
      companiesRepository.caseNumberPrefixExists.mockResolvedValue(false);
      passwordService.hash.mockResolvedValue('hash-abc');
      companiesRepository.createOrganizationShell.mockResolvedValue({ id: 'company-1' } as Company);
      companiesRepository.createFirstAdmin.mockResolvedValue({ id: 'user-1' } as never);
      eventBus.publish.mockResolvedValue(undefined);
    }

    it('USER-001 — nie tworzy NICZEGO, gdy e-mail administratora jest już zajęty przez konto Password (globalnie, nie tylko w tej firmie)', async () => {
      companiesRepository.passwordAccountEmailExists.mockResolvedValue(true);

      await expect(service.signup(dto)).rejects.toThrow();

      expect(passwordService.hash).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('hashuje hasło WYŁĄCZNIE przez PasswordService, nigdy nie przekazuje hasła jawnym tekstem do repozytorium', async () => {
      stubHappyPath();
      await service.signup(dto);

      expect(passwordService.hash).toHaveBeenCalledWith(dto.password);
      const adminCall = companiesRepository.createFirstAdmin.mock.calls[0][1] as {
        passwordHash: string;
      };
      expect(adminCall.passwordHash).toBe('hash-abc');
      expect(adminCall).not.toHaveProperty('password');
    });

    it('zakłada organizację (type=ManufacturerDistributor, orgKind=Producent, nip) i JEDNEGO Administratora Z TOKENEM WERYFIKACJI w JEDNEJ transakcji ($transaction), przekazując `tx` do obu wywołań repozytorium', async () => {
      stubHappyPath();
      await service.signup(dto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(companiesRepository.createOrganizationShell).toHaveBeenCalledWith(
        {
          name: 'TextilePro',
          slug: 'textilepro',
          type: 'ManufacturerDistributor',
          orgKind: 'Producent',
          nip: '1234567890',
          caseNumberPrefix: 'TEXT',
        },
        TX_MARKER,
      );
      const adminCall = companiesRepository.createFirstAdmin.mock.calls[0][1] as {
        firstName: string;
        lastName: string;
        email: string;
        passwordHash: string;
        emailVerificationTokenHash: string;
        emailVerificationTokenExpiresAt: Date;
      };
      expect(companiesRepository.createFirstAdmin.mock.calls[0][0]).toBe('company-1');
      expect(companiesRepository.createFirstAdmin.mock.calls[0][2]).toBe(TX_MARKER);
      expect(adminCall).toMatchObject({
        firstName: 'Anna',
        lastName: 'Nowak',
        email: 'anna@textilepro.pl',
        passwordHash: 'hash-abc',
      });
      // Token nigdy nie jest zapisywany jawnym tekstem — tylko jego SHA-256 hash.
      expect(adminCall.emailVerificationTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(adminCall.emailVerificationTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('zakłada Sklep (orgType=Shop) BEZ samoopisanego profilu producenta — type=Shop, orgKind=null', async () => {
      stubHappyPath();
      await service.signup({ ...dto, orgType: 'Shop' });

      expect(companiesRepository.createOrganizationShell).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'Shop', orgKind: null }),
        TX_MARKER,
      );
    });

    it('generuje slug z nazwy firmy i próbuje kolejnych wariantów (-2, -3, …) dopóki nie znajdzie wolnego', async () => {
      stubHappyPath();
      companiesRepository.slugExists
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await service.signup(dto);

      expect(companiesRepository.slugExists).toHaveBeenNthCalledWith(1, 'textilepro');
      expect(companiesRepository.slugExists).toHaveBeenNthCalledWith(2, 'textilepro-2');
      expect(companiesRepository.slugExists).toHaveBeenNthCalledWith(3, 'textilepro-3');
      expect(companiesRepository.createOrganizationShell).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'textilepro-3' }),
        TX_MARKER,
      );
    });

    it('COMPANY-001 — poddaje się po wyczerpaniu limitu prób sluga, bez wywołania transakcji', async () => {
      companiesRepository.passwordAccountEmailExists.mockResolvedValue(false);
      companiesRepository.caseNumberPrefixExists.mockResolvedValue(false);
      companiesRepository.slugExists.mockResolvedValue(true);

      await expect(service.signup(dto)).rejects.toThrow();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('generuje prefiks numeracji z nazwy firmy i próbuje kolejnych wariantów przy kolizji (Etap 7 — dawny Problem 8b z raportu wdrożeniowego)', async () => {
      stubHappyPath();
      companiesRepository.caseNumberPrefixExists
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await service.signup(dto);

      expect(companiesRepository.caseNumberPrefixExists).toHaveBeenNthCalledWith(1, 'TEXT');
      expect(companiesRepository.caseNumberPrefixExists).toHaveBeenNthCalledWith(2, 'TEXT2');
      expect(companiesRepository.caseNumberPrefixExists).toHaveBeenNthCalledWith(3, 'TEXT3');
      expect(companiesRepository.createOrganizationShell).toHaveBeenCalledWith(
        expect.objectContaining({ caseNumberPrefix: 'TEXT3' }),
        TX_MARKER,
      );
    });

    it('COMPANY-001 — poddaje się po wyczerpaniu limitu prób prefiksu numeracji, PRZED sprawdzeniem sluga/transakcją', async () => {
      companiesRepository.passwordAccountEmailExists.mockResolvedValue(false);
      companiesRepository.caseNumberPrefixExists.mockResolvedValue(true);

      await expect(service.signup(dto)).rejects.toThrow();
      expect(companiesRepository.slugExists).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('zapisuje AuditLog COMPANY_SIGNUP przypisany do NOWEJ firmy i NOWEGO administratora', async () => {
      stubHappyPath();
      await service.signup(dto);

      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-1',
          userId: 'user-1',
          action: 'COMPANY_SIGNUP',
          entityType: 'Company',
          entityId: 'company-1',
        }),
      );
    });

    it('NIE loguje automatycznie (breaking change) — publikuje COMPANY_SIGNUP_COMPLETED (Fundament „Fresh Install" wysyła e-mail przez subskrybenta, nie wprost) i zwraca komunikat + e-mail, bez tokenów', async () => {
      stubHappyPath();
      const result = await service.signup(dto);

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.COMPANY_SIGNUP_COMPLETED);
      expect(published.companyId).toBe('company-1');
      expect(published.actorUserId).toBe('user-1');
      expect(published.payload).toEqual({
        email: 'anna@textilepro.pl',
        firstName: 'Anna',
        companyName: 'TextilePro',
        verificationToken: expect.any(String),
      });
      expect(result).toEqual({
        message: expect.any(String),
        email: 'anna@textilepro.pl',
      });
      expect(result).not.toHaveProperty('accessToken');
    });
  });
});
