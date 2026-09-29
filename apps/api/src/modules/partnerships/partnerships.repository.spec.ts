import { PrismaService } from '../../prisma/prisma.service';
import { PartnershipsRepository } from './partnerships.repository';

describe('PartnershipsRepository', () => {
  let prisma: {
    partnership: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    company: { findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
    companySettings: { create: jest.Mock };
    shop: { create: jest.Mock };
    brand: { findMany: jest.Mock; create: jest.Mock };
    contractor: { create: jest.Mock };
    manufacturer: { create: jest.Mock };
    role: { findFirst: jest.Mock };
    user: { create: jest.Mock };
    case: { count: jest.Mock };
    caseHandoff: { count: jest.Mock };
  };
  let repository: PartnershipsRepository;

  beforeEach(() => {
    prisma = {
      partnership: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      company: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
      companySettings: { create: jest.fn() },
      shop: { create: jest.fn() },
      brand: { findMany: jest.fn(), create: jest.fn() },
      contractor: { create: jest.fn() },
      manufacturer: { create: jest.fn() },
      role: { findFirst: jest.fn() },
      user: { create: jest.fn() },
      case: { count: jest.fn() },
      caseHandoff: { count: jest.fn() },
    };
    repository = new PartnershipsRepository(prisma as unknown as PrismaService);
  });

  describe('izolacja najemcy (IDOR)', () => {
    it('findAllForCompany() woła OR po shopCompanyId/distributorCompanyId — firma widzi partnerstwo z KTÓREJKOLWIEK strony', async () => {
      prisma.partnership.findMany.mockResolvedValue([]);
      await repository.findAllForCompany('company-1');
      expect(prisma.partnership.findMany).toHaveBeenCalledWith({
        where: { OR: [{ shopCompanyId: 'company-1' }, { distributorCompanyId: 'company-1' }] },
        include: expect.anything(),
        orderBy: { invitedAt: 'desc' },
      });
    });

    it('findById() wymaga id ORAZ OR po obu stronach — bez tego dowolna firma odczytałaby cudze partnerstwo znając samo UUID', async () => {
      prisma.partnership.findFirst.mockResolvedValue(null);
      await repository.findById('partnership-1', 'company-1');
      expect(prisma.partnership.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'partnership-1',
          OR: [{ shopCompanyId: 'company-1' }, { distributorCompanyId: 'company-1' }],
        },
        include: expect.anything(),
      });
    });

    it('findBrandsOwnedByCompany() filtruje marki po companyId — zaproszenie nie może wskazywać cudzego katalogu marek (PARTNERSHIP-004)', async () => {
      prisma.brand.findMany.mockResolvedValue([]);
      await repository.findBrandsOwnedByCompany(['brand-1', 'brand-2'], 'company-1');
      expect(prisma.brand.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['brand-1', 'brand-2'] }, companyId: 'company-1' },
      });
    });

    it('findBrandsOwnedByCompany() zwraca [] bez wywołania Prisma, gdy lista marek jest pusta', async () => {
      const result = await repository.findBrandsOwnedByCompany([], 'company-1');
      expect(result).toEqual([]);
      expect(prisma.brand.findMany).not.toHaveBeenCalled();
    });
  });

  describe('zaproszenie e-mailem (Etap 5/6)', () => {
    it('findPendingOrActiveInviteByEmail() filtruje po OR(shopCompanyId,distributorCompanyId) — Etap 6, wołający może być KTÓRĄKOLWIEK stroną (PARTNERSHIP-008)', async () => {
      prisma.partnership.findFirst.mockResolvedValue(null);
      await repository.findPendingOrActiveInviteByEmail('caller-1', 'partner@example.com');
      expect(prisma.partnership.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ shopCompanyId: 'caller-1' }, { distributorCompanyId: 'caller-1' }],
          inviteEmail: 'partner@example.com',
          status: { in: ['Invited', 'Active'] },
        },
      });
    });

    it('createPendingPartnerCompany() dla type=Shop zakłada Company + CompanySettings + Shop, bez samoopisanego Manufacturer/Brand', async () => {
      prisma.company.create.mockResolvedValue({
        id: 'company-new',
        name: 'Nowy Partner Sp. z o.o.',
      });
      prisma.companySettings.create.mockResolvedValue({});
      prisma.shop.create.mockResolvedValue({});

      const result = await repository.createPendingPartnerCompany(
        'Nowy Partner Sp. z o.o.',
        '1234567890',
        'Shop',
      );

      expect(prisma.company.create).toHaveBeenCalledWith({
        data: { name: 'Nowy Partner Sp. z o.o.', nip: '1234567890', type: 'Shop' },
      });
      expect(prisma.companySettings.create).toHaveBeenCalledWith({
        data: { companyId: 'company-new', caseNumberPrefix: expect.any(String) },
      });
      expect(prisma.shop.create).toHaveBeenCalledWith({
        data: { companyId: 'company-new', name: 'Nowy Partner Sp. z o.o. — siedziba' },
      });
      expect(prisma.contractor.create).not.toHaveBeenCalled();
      expect(prisma.manufacturer.create).not.toHaveBeenCalled();
      expect(prisma.brand.create).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'company-new', name: 'Nowy Partner Sp. z o.o.' });
    });

    it('createPendingPartnerCompany() dla type=ManufacturerDistributor DOKŁADA samoopisany Contractor+Manufacturer+Brand (Etap 6 — symetryczne zaproszenie, Sklep zaprasza NOWEGO dystrybutora)', async () => {
      prisma.company.create.mockResolvedValue({ id: 'company-new', name: 'Nowy Dystrybutor' });
      prisma.companySettings.create.mockResolvedValue({});
      prisma.shop.create.mockResolvedValue({});
      prisma.contractor.create.mockResolvedValue({ id: 'contractor-new' });
      prisma.manufacturer.create.mockResolvedValue({ id: 'manufacturer-new' });
      prisma.brand.create.mockResolvedValue({});

      await repository.createPendingPartnerCompany(
        'Nowy Dystrybutor',
        '1234567890',
        'ManufacturerDistributor',
      );

      expect(prisma.company.create).toHaveBeenCalledWith({
        data: { name: 'Nowy Dystrybutor', nip: '1234567890', type: 'ManufacturerDistributor' },
      });
      expect(prisma.contractor.create).toHaveBeenCalledWith({
        data: { companyId: 'company-new', name: 'Nowy Dystrybutor', category: 'Manufacturer' },
      });
      expect(prisma.manufacturer.create).toHaveBeenCalledWith({
        data: {
          companyId: 'company-new',
          contractorId: 'contractor-new',
          submissionMethod: 'FormularzWWW',
        },
      });
      expect(prisma.brand.create).toHaveBeenCalledWith({
        data: {
          companyId: 'company-new',
          manufacturerId: 'manufacturer-new',
          name: 'Nowy Dystrybutor',
        },
      });
    });

    it('createWithInviteToken() zapisuje inviteEmail/inviteTokenHash/inviteTokenExpiresAt, BEZ marek (Etap 6)', async () => {
      const expiresAt = new Date('2026-09-11T00:00:00Z');
      prisma.partnership.create.mockResolvedValue({});
      await repository.createWithInviteToken(
        'shop-1',
        'distributor-1',
        'user-1',
        'partner@example.com',
        'hash-abc',
        expiresAt,
      );
      expect(prisma.partnership.create).toHaveBeenCalledWith({
        data: {
          shopCompanyId: 'shop-1',
          distributorCompanyId: 'distributor-1',
          invitedByUserId: 'user-1',
          inviteEmail: 'partner@example.com',
          inviteTokenHash: 'hash-abc',
          inviteTokenExpiresAt: expiresAt,
        },
        include: expect.anything(),
      });
    });

    it('findByInviteTokenHash() wyszukuje WYŁĄCZNIE po haszu tokenu, nigdy po jawnej wartości', async () => {
      prisma.partnership.findFirst.mockResolvedValue(null);
      await repository.findByInviteTokenHash('hash-abc');
      expect(prisma.partnership.findFirst).toHaveBeenCalledWith({
        where: { inviteTokenHash: 'hash-abc' },
        include: expect.anything(),
      });
    });

    it('activateFromInvite() aktywuje partnerstwo i czyści pola tokenu (jednorazowy)', async () => {
      prisma.partnership.update.mockResolvedValue({});
      await repository.activateFromInvite('partnership-1');
      expect(prisma.partnership.update).toHaveBeenCalledWith({
        where: { id: 'partnership-1' },
        data: {
          status: 'Active',
          acceptedAt: expect.any(Date),
          inviteEmail: null,
          inviteTokenHash: null,
          inviteTokenExpiresAt: null,
        },
        include: expect.anything(),
      });
    });
  });

  describe('połączenie z istniejącą firmą (Etap 6)', () => {
    it('findCompanyByNip() filtruje po nip i active:true (jednoznaczne dzięki Company_nip_key)', async () => {
      prisma.company.findFirst.mockResolvedValue(null);
      await repository.findCompanyByNip('1234567890');
      expect(prisma.company.findFirst).toHaveBeenCalledWith({
        where: { nip: '1234567890', active: true },
      });
    });

    it('findCompanyById() woła findUnique po samym id, bez filtra active (wołający sam decyduje)', async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      await repository.findCompanyById('company-1');
      expect(prisma.company.findUnique).toHaveBeenCalledWith({ where: { id: 'company-1' } });
    });

    it('createConnectionRequest() tworzy Partnership BEZ żadnego PartnershipBrand', async () => {
      prisma.partnership.create.mockResolvedValue({});
      await repository.createConnectionRequest('shop-1', 'distributor-1', 'user-1');
      expect(prisma.partnership.create).toHaveBeenCalledWith({
        data: {
          shopCompanyId: 'shop-1',
          distributorCompanyId: 'distributor-1',
          invitedByUserId: 'user-1',
        },
        include: expect.anything(),
      });
    });

    it('resetRejectedToInvited() ustawia status Invited i zeruje WSZYSTKIE znaczniki cyklu życia + pola tokenu e-mail', async () => {
      prisma.partnership.update.mockResolvedValue({});
      await repository.resetRejectedToInvited('partnership-1', 'user-2');
      expect(prisma.partnership.update).toHaveBeenCalledWith({
        where: { id: 'partnership-1' },
        data: {
          status: 'Invited',
          invitedByUserId: 'user-2',
          invitedAt: expect.any(Date),
          acceptedAt: null,
          deactivatedAt: null,
          inviteEmail: null,
          inviteTokenHash: null,
          inviteTokenExpiresAt: null,
        },
        include: expect.anything(),
      });
    });
  });

  describe('countCasesForPartnership() — suma dwóch rozłącznych ścieżek', () => {
    it('sumuje Case (formularz marki) i CaseHandoff (przekazanie pracownika), filtrowane po parze firm', async () => {
      prisma.case.count.mockResolvedValue(3);
      prisma.caseHandoff.count.mockResolvedValue(2);

      const result = await repository.countCasesForPartnership('shop-1', 'distributor-1');

      expect(prisma.case.count).toHaveBeenCalledWith({
        where: { companyId: 'distributor-1', reportedByPartnerCompanyId: 'shop-1' },
      });
      expect(prisma.caseHandoff.count).toHaveBeenCalledWith({
        where: { originCompanyId: 'shop-1', targetCompanyId: 'distributor-1' },
      });
      expect(result).toBe(5);
    });

    it('zwraca 0, gdy partnerstwo nie ma jeszcze żadnej sprawy w żadnej z dwóch ścieżek', async () => {
      prisma.case.count.mockResolvedValue(0);
      prisma.caseHandoff.count.mockResolvedValue(0);
      const result = await repository.countCasesForPartnership('shop-1', 'distributor-1');
      expect(result).toBe(0);
    });
  });
});
