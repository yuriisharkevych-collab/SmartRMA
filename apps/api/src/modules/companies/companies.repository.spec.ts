import { PrismaService } from '../../prisma/prisma.service';
import { CompaniesRepository } from './companies.repository';

describe('CompaniesRepository', () => {
  let prisma: {
    company: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock; create: jest.Mock };
    shop: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    companySettings: { create: jest.Mock; findFirst: jest.Mock };
    contractor: { create: jest.Mock };
    manufacturer: { create: jest.Mock };
    brand: { create: jest.Mock };
    caseStatusDefinition: { createMany: jest.Mock };
    user: { findFirst: jest.Mock; create: jest.Mock };
    role: { findFirst: jest.Mock };
  };
  let repository: CompaniesRepository;

  beforeEach(() => {
    prisma = {
      company: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      shop: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      companySettings: { create: jest.fn(), findFirst: jest.fn() },
      contractor: { create: jest.fn() },
      manufacturer: { create: jest.fn() },
      brand: { create: jest.fn() },
      caseStatusDefinition: { createMany: jest.fn() },
      user: { findFirst: jest.fn(), create: jest.fn() },
      role: { findFirst: jest.fn() },
    };
    repository = new CompaniesRepository(prisma as unknown as PrismaService);
  });

  it('findById() odpytuje po id', async () => {
    prisma.company.findUnique.mockResolvedValue(null);
    await repository.findById('company-1');
    expect(prisma.company.findUnique).toHaveBeenCalledWith({ where: { id: 'company-1' } });
  });

  it('update() przekazuje dane wprost do prisma.company.update', async () => {
    prisma.company.update.mockResolvedValue({});
    await repository.update('company-1', { name: 'Nowa Nazwa' });
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { name: 'Nowa Nazwa' },
    });
  });

  it('updateLogoPath() ustawia wyłącznie pole logoPath', async () => {
    prisma.company.update.mockResolvedValue({});
    await repository.updateLogoPath('company-1', 'company-1/logo/uuid-logo.png');
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { logoPath: 'company-1/logo/uuid-logo.png' },
    });
  });

  it('findShopsByCompany() filtruje po companyId', async () => {
    prisma.shop.findMany.mockResolvedValue([]);
    await repository.findShopsByCompany('company-1');
    expect(prisma.shop.findMany).toHaveBeenCalledWith({ where: { companyId: 'company-1' } });
  });

  it('findShopById() filtruje po id i companyId (IDOR — patrz audyt bezpieczeństwa)', async () => {
    prisma.shop.findFirst.mockResolvedValue(null);
    await repository.findShopById('shop-1', 'company-1');
    expect(prisma.shop.findFirst).toHaveBeenCalledWith({
      where: { id: 'shop-1', companyId: 'company-1' },
    });
  });

  it('createShop() dowiązuje companyId do danych placówki', async () => {
    prisma.shop.create.mockResolvedValue({});
    await repository.createShop('company-1', { name: 'Sklep Centrum' });
    expect(prisma.shop.create).toHaveBeenCalledWith({
      data: { name: 'Sklep Centrum', companyId: 'company-1' },
    });
  });

  it('updateShop() przekazuje dane wprost do prisma.shop.update, w tym pole `active` (dezaktywacja)', async () => {
    prisma.shop.update.mockResolvedValue({});
    await repository.updateShop('shop-1', { active: false });
    expect(prisma.shop.update).toHaveBeenCalledWith({
      where: { id: 'shop-1' },
      data: { active: false },
    });
  });

  describe('Etap 6 — onboarding samoobsługowy', () => {
    it('slugExists() sprawdza kolizję NIEZALEŻNIE od `active` (w przeciwieństwie do findBySlug publicznego formularza)', async () => {
      prisma.company.findFirst.mockResolvedValue({ id: 'company-1' });
      const result = await repository.slugExists('textilepro');
      expect(prisma.company.findFirst).toHaveBeenCalledWith({ where: { slug: 'textilepro' } });
      expect(result).toBe(true);
    });

    it('slugExists() zwraca false, gdy żadna firma nie ma tego sluga', async () => {
      prisma.company.findFirst.mockResolvedValue(null);
      expect(await repository.slugExists('wolny-slug')).toBe(false);
    });

    it('caseNumberPrefixExists() sprawdza kolizję prefiksu numeracji (Etap 7 — pole bez @unique w bazie)', async () => {
      prisma.companySettings.findFirst.mockResolvedValue({ id: 'settings-1' });
      const result = await repository.caseNumberPrefixExists('TEXT');
      expect(prisma.companySettings.findFirst).toHaveBeenCalledWith({
        where: { caseNumberPrefix: 'TEXT' },
      });
      expect(result).toBe(true);
    });

    it('caseNumberPrefixExists() zwraca false, gdy żadna firma nie ma tego prefiksu', async () => {
      prisma.companySettings.findFirst.mockResolvedValue(null);
      expect(await repository.caseNumberPrefixExists('WOLN')).toBe(false);
    });

    it('passwordAccountEmailExists() filtruje po loginMethod=Password — USER-001 dotyczy WYŁĄCZNIE kont hasłowych, globalnie (bez companyId)', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await repository.passwordAccountEmailExists('anna@textilepro.pl');
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'anna@textilepro.pl', loginMethod: 'Password' },
      });
    });

    it('findAdministratorRole() szuka roli SYSTEMOWEJ (companyId:null), nie firmowej', async () => {
      prisma.role.findFirst.mockResolvedValue(null);
      await repository.findAdministratorRole();
      expect(prisma.role.findFirst).toHaveBeenCalledWith({
        where: { companyId: null, code: 'Administrator' },
      });
    });

    it('createOrganizationShell() zakłada Company(type=ManufacturerDistributor)+CompanySettings+Shop+samoopisany Contractor/Manufacturer/Brand+katalog statusów, wszystko przez PRZEKAZANY klient (tx)', async () => {
      const tx = {
        company: { create: jest.fn().mockResolvedValue({ id: 'company-1', name: 'TextilePro' }) },
        companySettings: { create: jest.fn().mockResolvedValue({}) },
        shop: { create: jest.fn().mockResolvedValue({}) },
        contractor: { create: jest.fn().mockResolvedValue({ id: 'contractor-1' }) },
        manufacturer: { create: jest.fn().mockResolvedValue({ id: 'manufacturer-1' }) },
        brand: { create: jest.fn().mockResolvedValue({}) },
        caseStatusDefinition: { createMany: jest.fn().mockResolvedValue({}) },
      };

      const result = await repository.createOrganizationShell(
        {
          name: 'TextilePro',
          slug: 'textilepro',
          orgKind: 'Producent' as never,
          caseNumberPrefix: 'TEXT',
        },
        tx as never,
      );

      expect(tx.company.create).toHaveBeenCalledWith({
        data: {
          name: 'TextilePro',
          slug: 'textilepro',
          type: 'ManufacturerDistributor',
          orgKind: 'Producent',
        },
      });
      expect(tx.companySettings.create).toHaveBeenCalledWith({
        data: { companyId: 'company-1', caseNumberPrefix: 'TEXT' },
      });
      expect(tx.shop.create).toHaveBeenCalledWith({
        data: { companyId: 'company-1', name: 'TextilePro — siedziba' },
      });
      expect(tx.contractor.create).toHaveBeenCalledWith({
        data: { companyId: 'company-1', name: 'TextilePro', category: 'Manufacturer' },
      });
      expect(tx.manufacturer.create).toHaveBeenCalledWith({
        data: {
          companyId: 'company-1',
          contractorId: 'contractor-1',
          submissionMethod: 'FormularzWWW',
        },
      });
      expect(tx.brand.create).toHaveBeenCalledWith({
        data: { companyId: 'company-1', manufacturerId: 'manufacturer-1', name: 'TextilePro' },
      });
      expect(tx.caseStatusDefinition.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([expect.objectContaining({ companyId: 'company-1' })]),
      });
      // Nie wywołuje `this.prisma.*` bezpośrednio — wyłącznie `tx` (izolacja transakcji).
      expect(prisma.company.create).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'company-1', name: 'TextilePro' });
    });

    it('createFirstAdmin() rzuca, gdy rola systemowa Administrator nie istnieje (środowisko nie zaseedowane) — nie tworzy User-a w tym stanie', async () => {
      const tx = {
        role: { findFirst: jest.fn().mockResolvedValue(null) },
        user: { create: jest.fn() },
      };
      await expect(
        repository.createFirstAdmin(
          'company-1',
          {
            firstName: 'Anna',
            lastName: 'Nowak',
            email: 'anna@textilepro.pl',
            passwordHash: 'hash',
          },
          tx as never,
        ),
      ).rejects.toThrow('Rola systemowa "Administrator" nie istnieje.');
      expect(tx.user.create).not.toHaveBeenCalled();
    });

    it('createFirstAdmin() tworzy DOKŁADNIE JEDNEGO usera z rolą systemową Administrator, aktywnego od razu', async () => {
      const tx = {
        role: { findFirst: jest.fn().mockResolvedValue({ id: 'role-admin' }) },
        user: { create: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      };
      await repository.createFirstAdmin(
        'company-1',
        {
          firstName: 'Anna',
          lastName: 'Nowak',
          email: 'anna@textilepro.pl',
          passwordHash: 'hash-abc',
        },
        tx as never,
      );
      expect(tx.user.create).toHaveBeenCalledWith({
        data: {
          companyId: 'company-1',
          firstName: 'Anna',
          lastName: 'Nowak',
          email: 'anna@textilepro.pl',
          passwordHash: 'hash-abc',
          active: true,
          roles: { create: [{ roleId: 'role-admin' }] },
        },
      });
    });
  });
});
