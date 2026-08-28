import { Injectable } from '@nestjs/common';
import { Brand, Prisma, Product, ProductCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** `GET /products` — filtry katalogowe Etapu 4 (panel "Produkty", formularz publiczny). */
export interface ProductFilters {
  manufacturerId?: string;
  brandId?: string;
  categoryId?: string;
  active?: boolean;
}

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

  findAllForCompany(companyId: string, filters: ProductFilters = {}): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { companyId, ...filters },
      orderBy: { createdAt: 'desc' },
    });
  }

  search(companyId: string, query: string, filters: ProductFilters = {}): Promise<Product[]> {
    const where: Prisma.ProductWhereInput = {
      companyId,
      ...filters,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { sku: { contains: query, mode: 'insensitive' } },
        { category: { contains: query, mode: 'insensitive' } },
      ],
    };
    return this.prisma.product.findMany({ where, take: 50 });
  }

  /** `companyId` obowiązkowy — bez niego administrator jednej firmy mógłby odczytać/edytować produkt innej firmy, znając samo UUID (IDOR, patrz audyt bezpieczeństwa). */
  findById(id: string, companyId: string): Promise<Product | null> {
    return this.prisma.product.findFirst({ where: { id, companyId } });
  }

  create(
    companyId: string,
    data: {
      manufacturerId: string;
      name: string;
      sku?: string;
      category?: string;
      categoryId?: string;
      brandId?: string;
    },
  ): Promise<Product> {
    return this.prisma.product.create({ data: { ...data, companyId } });
  }

  update(
    id: string,
    data: Partial<
      Pick<
        Product,
        'name' | 'sku' | 'category' | 'categoryId' | 'manufacturerId' | 'brandId' | 'active'
      >
    >,
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

  /** `companyId` obowiązkowy — patrz `findById` wyżej (ten sam IDOR dla `Brand`). */
  findBrandById(id: string, companyId: string): Promise<Brand | null> {
    return this.prisma.brand.findFirst({ where: { id, companyId } });
  }

  /** Reużyte przez `IntakeRepository`-owy odpowiednik formularza publicznego (podpowiedź marki→producent w CaseItem, BR-076) — patrz doc-comment tam. */
  findBrandsForManufacturer(manufacturerId: string): Promise<Brand[]> {
    return this.prisma.brand.findMany({ where: { manufacturerId } });
  }

  createBrand(companyId: string, data: { manufacturerId: string; name: string }): Promise<Brand> {
    return this.prisma.brand.create({ data: { ...data, companyId } });
  }

  updateBrand(
    id: string,
    data: Partial<
      Pick<
        Brand,
        | 'name'
        | 'manufacturerId'
        | 'active'
        | 'requiresSerialNumber'
        | 'requiresFrameNumber'
        | 'requiresProofOfPurchase'
        | 'minPhotos'
        | 'requiresVideo'
        | 'maxPhotos'
        | 'maxAttachmentSizeMb'
        | 'statusStaleDaysOverride'
        | 'caseAgeStaleDaysOverride'
      >
    >,
  ): Promise<Brand> {
    return this.prisma.brand.update({ where: { id }, data });
  }

  // --- Etap 4 (Produkty i konfiguracja formularza) — ProductCategory ---

  findAllCategoriesForCompany(
    companyId: string,
    filters: { manufacturerId?: string; active?: boolean } = {},
  ): Promise<ProductCategory[]> {
    return this.prisma.productCategory.findMany({
      where: { companyId, ...filters },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** `companyId` obowiązkowy — ten sam IDOR co `findById`/`findBrandById` powyżej. */
  findCategoryById(id: string, companyId: string): Promise<ProductCategory | null> {
    return this.prisma.productCategory.findFirst({ where: { id, companyId } });
  }

  createCategory(
    companyId: string,
    data: { manufacturerId: string; name: string },
  ): Promise<ProductCategory> {
    return this.prisma.productCategory.create({ data: { ...data, companyId } });
  }

  updateCategory(
    id: string,
    data: Partial<Pick<ProductCategory, 'name' | 'active'>>,
  ): Promise<ProductCategory> {
    return this.prisma.productCategory.update({ where: { id }, data });
  }
}
