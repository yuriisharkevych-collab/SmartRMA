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
    company: { findFirst: jest.Mock; create: jest.Mock };
    companySettings: { create: jest.Mock };
    shop: { create: jest.Mock };
    brand: { findMany: jest.Mock };
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
      company: { findFirst: jest.fn(), create: jest.fn() },
      companySettings: { create: jest.fn() },
      shop: { create: jest.fn() },
      brand: { findMany: jest.fn() },
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

  describe('zaproszenie e-mailem (Etap 5)', () => {
    it('findPendingOrActiveInviteByEmail() filtruje po distributorCompanyId, inviteEmail i statusie Invited/Active (PARTNERSHIP-008)', async () => {
      prisma.partnership.findFirst.mockResolvedValue(null);
      await repository.findPendingOrActiveInviteByEmail('distributor-1', 'partner@example.com');
      expect(prisma.partnership.findFirst).toHaveBeenCalledWith({
        where: {
          distributorCompanyId: 'distributor-1',
          inviteEmail: 'partner@example.com',
          status: { in: ['Invited', 'Active'] },
        },
      });
    });

    it('createPendingPartnerCompany() zakłada Company + CompanySettings + Shop, bez samoopisanego Manufacturer/Brand', async () => {
      prisma.company.create.mockResolvedValue({
        id: 'company-new',
        name: 'Nowy Partner Sp. z o.o.',
      });
      prisma.companySettings.create.mockResolvedValue({});
      prisma.shop.create.mockResolvedValue({});

      const result = await repository.createPendingPartnerCompany('Nowy Partner Sp. z o.o.');

      expect(prisma.company.create).toHaveBeenCalledWith({
        data: { name: 'Nowy Partner Sp. z o.o.' },
      });
      expect(prisma.companySettings.create).toHaveBeenCalledWith({
        data: { companyId: 'company-new', caseNumberPrefix: expect.any(String) },
      });
      expect(prisma.shop.create).toHaveBeenCalledWith({
        data: { companyId: 'company-new', name: 'Nowy Partner Sp. z o.o. — siedziba' },
      });
      expect(result).toEqual({ id: 'company-new', name: 'Nowy Partner Sp. z o.o.' });
    });

    it('createWithInviteToken() zapisuje inviteEmail/inviteTokenHash/inviteTokenExpiresAt razem z marakami partnerstwa', async () => {
      const expiresAt = new Date('2026-09-11T00:00:00Z');
      prisma.partnership.create.mockResolvedValue({});
      await repository.createWithInviteToken(
        'shop-1',
        'distributor-1',
        'user-1',
        ['brand-1'],
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
          brands: { createMany: { data: [{ brandId: 'brand-1' }] } },
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
