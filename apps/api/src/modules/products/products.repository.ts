import { Injectable } from '@nestjs/common';
import { Brand, Prisma, Product } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Typy pól zawężone do `Pick<Product/Brand, ...>` (nie `Prisma.XxxUpdateInput`
 * wprost) — ten sam błąd co w wersji scaffoldu tego pliku (Zadanie 8: create()
 * już był naprawiony przez `Omit<...,'companyId'>`, ale `update()` wciąż
 * przyjmował surowy `Prisma.ProductUpdateInput`, przez co teoretycznie można
 * by zapisać dowolne pole modelu, w tym `active`/`id`/`createdAt`). Naprawione
 * tutaj analogicznie do `CompaniesRepository`/`CustomersRepository`.
 */
@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllForCompany(companyId: string): Promise<Product[]> {
    return this.prisma.product.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } });
  }

  search(companyId: string, query: string): Promise<Product[]> {
    const where: Prisma.ProductWhereInput = {
      companyId,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { sku: { contains: query, mode: 'insensitive' } },
        { category: { contains: query, mode: 'insensitive' } },
      ],
    };
    return this.prisma.product.findMany({ where, take: 50 });
  }

  findById(id: string): Promise<Product | null> {
    return this.prisma.product.findUnique({ where: { id } });
  }

  create(
    companyId: string,
    data: {
      manufacturerId: string;
      name: string;
      sku?: string;
      category?: string;
      brandId?: string;
    },
  ): Promise<Product> {
    return this.prisma.product.create({ data: { ...data, companyId } });
  }

  update(
    id: string,
    data: Partial<Pick<Product, 'name' | 'sku' | 'category' | 'manufacturerId' | 'brandId'>>,
  ): Promise<Product> {
    return this.prisma.product.update({ where: { id }, data });
  }

  findAllBrandsForCompany(companyId: string): Promise<Brand[]> {
    return this.prisma.brand.findMany({ where: { companyId } });
  }

  searchBrands(companyId: string, query: string): Promise<Brand[]> {
    return this.prisma.brand.findMany({
      where: { companyId, name: { contains: query, mode: 'insensitive' } },
    });
  }

  findBrandById(id: string): Promise<Brand | null> {
    return this.prisma.brand.findUnique({ where: { id } });
  }

  /** Nieużywane dziś przez żaden serwis (dead code ze scaffoldu) — zostawione jako potencjalny helper dla przyszłego BR-076 (podpowiedź marki→producent w CaseItem). */
  findBrandsForManufacturer(manufacturerId: string): Promise<Brand[]> {
    return this.prisma.brand.findMany({ where: { manufacturerId } });
  }

  createBrand(companyId: string, data: { manufacturerId: string; name: string }): Promise<Brand> {
    return this.prisma.brand.create({ data: { ...data, companyId } });
  }

  updateBrand(
    id: string,
    data: Partial<Pick<Brand, 'name' | 'manufacturerId' | 'active'>>,
  ): Promise<Brand> {
    return this.prisma.brand.update({ where: { id }, data });
  }
}
