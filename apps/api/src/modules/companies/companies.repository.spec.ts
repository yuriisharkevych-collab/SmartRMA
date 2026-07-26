import { PrismaService } from '../../prisma/prisma.service';
import { CompaniesRepository } from './companies.repository';

describe('CompaniesRepository', () => {
  let prisma: {
    company: { findUnique: jest.Mock; update: jest.Mock };
    shop: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let repository: CompaniesRepository;

  beforeEach(() => {
    prisma = {
      company: { findUnique: jest.fn(), update: jest.fn() },
      shop: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
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
    expect(prisma.company.update).toHaveBeenCalledWith({ where: { id: 'company-1' }, data: { name: 'Nowa Nazwa' } });
  });

  it('findShopsByCompany() filtruje po companyId', async () => {
    prisma.shop.findMany.mockResolvedValue([]);
    await repository.findShopsByCompany('company-1');
    expect(prisma.shop.findMany).toHaveBeenCalledWith({ where: { companyId: 'company-1' } });
  });

  it('findShopById() odpytuje po id', async () => {
    prisma.shop.findUnique.mockResolvedValue(null);
    await repository.findShopById('shop-1');
    expect(prisma.shop.findUnique).toHaveBeenCalledWith({ where: { id: 'shop-1' } });
  });

  it('createShop() dowiązuje companyId do danych placówki', async () => {
    prisma.shop.create.mockResolvedValue({});
    await repository.createShop('company-1', { name: 'Sklep Centrum' });
    expect(prisma.shop.create).toHaveBeenCalledWith({ data: { name: 'Sklep Centrum', companyId: 'company-1' } });
  });

  it('updateShop() przekazuje dane wprost do prisma.shop.update, w tym pole `active` (dezaktywacja)', async () => {
    prisma.shop.update.mockResolvedValue({});
    await repository.updateShop('shop-1', { active: false });
    expect(prisma.shop.update).toHaveBeenCalledWith({ where: { id: 'shop-1' }, data: { active: false } });
  });
});
