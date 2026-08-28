import { PrismaService } from '../../prisma/prisma.service';
import { ProductsRepository } from './products.repository';

describe('ProductsRepository', () => {
  let prisma: {
    product: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    brand: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    productCategory: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let repository: ProductsRepository;

  beforeEach(() => {
    prisma = {
      product: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      brand: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      productCategory: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    repository = new ProductsRepository(prisma as unknown as PrismaService);
  });

  it('findAllForCompany() filtruje po companyId i sortuje od najnowszych', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    await repository.findAllForCompany('company-1');
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('search() filtruje po companyId oraz OR po name/sku/category (case-insensitive)', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    await repository.search('company-1', 'rower');
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        OR: [
          { name: { contains: 'rower', mode: 'insensitive' } },
          { sku: { contains: 'rower', mode: 'insensitive' } },
          { category: { contains: 'rower', mode: 'insensitive' } },
        ],
      },
      take: 50,
    });
  });

  it('findById() filtruje po id i companyId (IDOR — patrz audyt bezpieczeństwa)', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    await repository.findById('product-1', 'company-1');
    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: 'product-1', companyId: 'company-1' },
    });
  });

  it('create() dowiązuje companyId do danych produktu', async () => {
    prisma.product.create.mockResolvedValue({});
    await repository.create('company-1', { manufacturerId: 'manufacturer-1', name: 'Rower X' });
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: { manufacturerId: 'manufacturer-1', name: 'Rower X', companyId: 'company-1' },
    });
  });

  it('update() przekazuje dane wprost do prisma.product.update', async () => {
    prisma.product.update.mockResolvedValue({});
    await repository.update('product-1', { name: 'Rower Y' });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { name: 'Rower Y' },
    });
  });

  it('findAllBrandsForCompany() filtruje po companyId', async () => {
    prisma.brand.findMany.mockResolvedValue([]);
    await repository.findAllBrandsForCompany('company-1');
    expect(prisma.brand.findMany).toHaveBeenCalledWith({ where: { companyId: 'company-1' } });
  });

  it('searchBrands() filtruje po companyId i nazwie (case-insensitive)', async () => {
    prisma.brand.findMany.mockResolvedValue([]);
    await repository.searchBrands('company-1', 'acme');
    expect(prisma.brand.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1', name: { contains: 'acme', mode: 'insensitive' } },
    });
  });

  it('findBrandById() filtruje po id i companyId (IDOR — patrz audyt bezpieczeństwa)', async () => {
    prisma.brand.findFirst.mockResolvedValue(null);
    await repository.findBrandById('brand-1', 'company-1');
    expect(prisma.brand.findFirst).toHaveBeenCalledWith({
      where: { id: 'brand-1', companyId: 'company-1' },
    });
  });

  it('createBrand() dowiązuje companyId do danych marki', async () => {
    prisma.brand.create.mockResolvedValue({});
    await repository.createBrand('company-1', { manufacturerId: 'manufacturer-1', name: 'Acme' });
    expect(prisma.brand.create).toHaveBeenCalledWith({
      data: { manufacturerId: 'manufacturer-1', name: 'Acme', companyId: 'company-1' },
    });
  });

  it('updateBrand() przekazuje dane wprost do prisma.brand.update', async () => {
    prisma.brand.update.mockResolvedValue({});
    await repository.updateBrand('brand-1', { name: 'Acme Corp' });
    expect(prisma.brand.update).toHaveBeenCalledWith({
      where: { id: 'brand-1' },
      data: { name: 'Acme Corp' },
    });
  });

  it('findAllForCompany() z filtrami Etapu 4 (manufacturerId/brandId/categoryId/active) zawęża `where`', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    await repository.findAllForCompany('company-1', {
      manufacturerId: 'manufacturer-1',
      brandId: 'brand-1',
      categoryId: 'category-1',
      active: true,
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        manufacturerId: 'manufacturer-1',
        brandId: 'brand-1',
        categoryId: 'category-1',
        active: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  describe('ProductCategory (Etap 4)', () => {
    it('findAllCategoriesForCompany() filtruje po companyId i opcjonalnie manufacturerId/active', async () => {
      prisma.productCategory.findMany.mockResolvedValue([]);
      await repository.findAllCategoriesForCompany('company-1', {
        manufacturerId: 'manufacturer-1',
      });
      expect(prisma.productCategory.findMany).toHaveBeenCalledWith({
        where: { companyId: 'company-1', manufacturerId: 'manufacturer-1' },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('findCategoryById() filtruje po id i companyId (IDOR — patrz audyt bezpieczeństwa)', async () => {
      prisma.productCategory.findFirst.mockResolvedValue(null);
      await repository.findCategoryById('category-1', 'company-1');
      expect(prisma.productCategory.findFirst).toHaveBeenCalledWith({
        where: { id: 'category-1', companyId: 'company-1' },
      });
    });

    it('createCategory() dowiązuje companyId do danych kategorii', async () => {
      prisma.productCategory.create.mockResolvedValue({});
      await repository.createCategory('company-1', {
        manufacturerId: 'manufacturer-1',
        name: 'Rowery',
      });
      expect(prisma.productCategory.create).toHaveBeenCalledWith({
        data: { manufacturerId: 'manufacturer-1', name: 'Rowery', companyId: 'company-1' },
      });
    });

    it('updateCategory() przekazuje dane wprost do prisma.productCategory.update', async () => {
      prisma.productCategory.update.mockResolvedValue({});
      await repository.updateCategory('category-1', { active: false });
      expect(prisma.productCategory.update).toHaveBeenCalledWith({
        where: { id: 'category-1' },
        data: { active: false },
      });
    });
  });
});
