import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditRepository } from '../audit/audit.repository';
import { ManufacturersService } from '../manufacturers/manufacturers.service';
import {
  BrandCreatedPayload,
  BrandUpdatedPayload,
  ProductCreatedPayload,
  ProductUpdatedPayload,
} from '../../events/contracts/product.events';
import { DomainEvent } from '../../events/domain-event.base';
import { EVENT_BUS, IEventBus } from '../../events/event-bus.interface';
import { EVENT_NAMES } from '../../events/event-names.const';
import { CreateBrandDto } from './dto/create-brand.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { SearchCatalogDto } from './dto/search-catalog.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { BrandEntity, ProductCategoryEntity, ProductEntity } from './entities/product.entity';
import { ProductMapper } from './mappers/product.mapper';
import { ProductFilters, ProductsRepository } from './products.repository';

/** Tylko pola faktycznie przesłane w `patch` i różne od `before` — wzorzec z `CompaniesService`/`CustomersService`. */
function diffChangedFields(before: object, patch: object): string[] {
  const b = before as Record<string, unknown>;
  const p = patch as Record<string, unknown>;
  return Object.keys(p).filter((key) => p[key] !== undefined && p[key] !== b[key]);
}

function pick(obj: object, keys: readonly string[]): Prisma.InputJsonValue {
  const o = obj as Record<string, unknown>;
  return Object.fromEntries(keys.map((key) => [key, o[key] ?? null])) as Prisma.InputJsonValue;
}

const PRODUCT_AUDIT_FIELDS = [
  'name',
  'sku',
  'category',
  'categoryId',
  'manufacturerId',
  'brandId',
  'active',
] as const;
const BRAND_AUDIT_FIELDS = ['name', 'manufacturerId'] as const;
const CATEGORY_AUDIT_FIELDS = ['name', 'active'] as const;

function toFilters(query: SearchCatalogDto): ProductFilters {
  return {
    manufacturerId: query.manufacturerId,
    brandId: query.brandId,
    categoryId: query.categoryId,
    active: query.active,
  };
}

/**
 * BR-074/BR-076 — `Product` to pozycja katalogowa (nie egzemplarz), `Brand`
 * jest polem pomocniczym przy wyborze producenta i NIE wymusza spójności
 * `Product.manufacturerId`/`Brand.manufacturerId` ("sugeruje, nie wymusza")
 * — celowo brak takiej walidacji krzyżowej.
 *
 * `manufacturerId`/`brandId`/`categoryId` weryfikowane przez istniejące
 * serwisy przed zapisem (żeby naruszenie FK kończyło się 404, nie surowym
 * wyjątkiem Prisma P2003) — nigdy bezpośrednio przez Prisma poza Repository.
 *
 * Brak kodów PRODUCT-x / BRAND-x / CATEGORY-x w ERROR_CODES.md — "nie znaleziono"
 * rzuca gołym `NotFoundException()`, ten sam już zaakceptowany brak co w
 * `CompaniesService`/`CustomersService`.
 *
 * Etap 4 (Produkty i konfiguracja formularza) — dezaktywacja Produktu/Kategorii
 * (`active=false`), NIGDY fizyczne usunięcie: `Product` może mieć historyczne
 * `CaseItem`/`OrderItem`, `ProductCategory` może mieć historyczne `Product`
 * (przez `categoryId`) — usunięcie osierociłoby te rekordy albo (przy FK
 * `ON DELETE CASCADE`/`RESTRICT`) skasowało dane sprzed lat/zablokowało
 * operację. Ten sam wzorzec co `Brand.active`/`Manufacturer.active`.
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly auditRepository: AuditRepository,
    private readonly manufacturersService: ManufacturersService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async findById(id: string, companyId: string): Promise<ProductEntity> {
    const product = await this.findProductOrThrow(id, companyId);
    return ProductMapper.toEntity(product);
  }

  async listProducts(companyId: string, query: SearchCatalogDto = {}): Promise<ProductEntity[]> {
    const filters = toFilters(query);
    return ProductMapper.toEntityList(
      query.query
        ? await this.productsRepository.search(companyId, query.query, filters)
        : await this.productsRepository.findAllForCompany(companyId, filters),
    );
  }

  /** Reużyte przez `CasesService.resolveItemProduct` (BR-072 — dopasowanie modelu spoza katalogu po nazwie) — sygnatura celowo NIEZMIENIONA (bez filtrów katalogowych Etapu 4), żeby nie dotykać tej ścieżki. */
  async searchProducts(companyId: string, query: string): Promise<ProductEntity[]> {
    return ProductMapper.toEntityList(await this.productsRepository.search(companyId, query));
  }

  async createProduct(
    companyId: string,
    dto: CreateProductDto,
    actorUserId: string,
  ): Promise<ProductEntity> {
    if (dto.manufacturerId) await this.manufacturersService.findById(dto.manufacturerId, companyId);
    if (dto.brandId) await this.findBrandOrThrow(dto.brandId, companyId);
    if (dto.categoryId) await this.findCategoryOrThrow(dto.categoryId, companyId);

    const product = await this.productsRepository.create(companyId, dto);

    await this.auditRepository.create({
      companyId,
      userId: actorUserId,
      action: 'PRODUCT_CREATED',
      entityType: 'Product',
      entityId: product.id,
      newValue: pick(product, PRODUCT_AUDIT_FIELDS),
    });

    await this.eventBus.publish(
      new DomainEvent<ProductCreatedPayload>({
        eventName: EVENT_NAMES.PRODUCT_CREATED,
        companyId,
        aggregateType: 'Product',
        aggregateId: product.id,
        actorUserId,
        correlationId: randomUUID(),
        payload: { name: product.name },
      }),
    );

    return ProductMapper.toEntity(product);
  }

  async updateProduct(
    id: string,
    companyId: string,
    dto: UpdateProductDto,
    actorUserId: string,
  ): Promise<ProductEntity> {
    const before = await this.findProductOrThrow(id, companyId);
    if (dto.manufacturerId) await this.manufacturersService.findById(dto.manufacturerId, companyId);
    if (dto.brandId) await this.findBrandOrThrow(dto.brandId, companyId);
    if (dto.categoryId) await this.findCategoryOrThrow(dto.categoryId, companyId);

    const updated = await this.productsRepository.update(id, dto);
    const changedFields = diffChangedFields(before, dto);

    if (changedFields.length > 0) {
      await this.auditRepository.create({
        companyId: before.companyId,
        userId: actorUserId,
        action: 'PRODUCT_UPDATED',
        entityType: 'Product',
        entityId: id,
        previousValue: pick(before, changedFields),
        newValue: pick(updated, changedFields),
      });

      await this.eventBus.publish(
        new DomainEvent<ProductUpdatedPayload>({
          eventName: EVENT_NAMES.PRODUCT_UPDATED,
          companyId: before.companyId,
          aggregateType: 'Product',
          aggregateId: id,
          actorUserId,
          correlationId: randomUUID(),
          payload: { changedFields },
        }),
      );
    }

    return ProductMapper.toEntity(updated);
  }

  async findBrandById(id: string, companyId: string): Promise<BrandEntity> {
    const brand = await this.findBrandOrThrow(id, companyId);
    return ProductMapper.brandToEntity(brand);
  }

  async listBrands(companyId: string): Promise<BrandEntity[]> {
    return ProductMapper.brandsToEntities(
      await this.productsRepository.findAllBrandsForCompany(companyId),
    );
  }

  async searchBrands(companyId: string, query: string): Promise<BrandEntity[]> {
    return ProductMapper.brandsToEntities(
      await this.productsRepository.searchBrands(companyId, query),
    );
  }

  async createBrand(
    companyId: string,
    dto: CreateBrandDto,
    actorUserId: string,
  ): Promise<BrandEntity> {
    await this.manufacturersService.findById(dto.manufacturerId, companyId);
    const brand = await this.productsRepository.createBrand(companyId, dto);

    await this.auditRepository.create({
      companyId,
      userId: actorUserId,
      action: 'BRAND_CREATED',
      entityType: 'Brand',
      entityId: brand.id,
      newValue: pick(brand, BRAND_AUDIT_FIELDS),
    });

    await this.eventBus.publish(
      new DomainEvent<BrandCreatedPayload>({
        eventName: EVENT_NAMES.BRAND_CREATED,
        companyId,
        aggregateType: 'Brand',
        aggregateId: brand.id,
        actorUserId,
        correlationId: randomUUID(),
        payload: { name: brand.name },
      }),
    );

    return ProductMapper.brandToEntity(brand);
  }

  async updateBrand(
    id: string,
    companyId: string,
    dto: UpdateBrandDto,
    actorUserId: string,
  ): Promise<BrandEntity> {
    const before = await this.findBrandOrThrow(id, companyId);
    if (dto.manufacturerId) await this.manufacturersService.findById(dto.manufacturerId, companyId);

    const updated = await this.productsRepository.updateBrand(id, dto);
    const changedFields = diffChangedFields(before, dto);

    if (changedFields.length > 0) {
      await this.auditRepository.create({
        companyId: before.companyId,
        userId: actorUserId,
        action: 'BRAND_UPDATED',
        entityType: 'Brand',
        entityId: id,
        previousValue: pick(before, changedFields),
        newValue: pick(updated, changedFields),
      });

      await this.eventBus.publish(
        new DomainEvent<BrandUpdatedPayload>({
          eventName: EVENT_NAMES.BRAND_UPDATED,
          companyId: before.companyId,
          aggregateType: 'Brand',
          aggregateId: id,
          actorUserId,
          correlationId: randomUUID(),
          payload: { changedFields },
        }),
      );
    }

    return ProductMapper.brandToEntity(updated);
  }

  // --- Etap 4 (Produkty i konfiguracja formularza) — ProductCategory ---

  async findCategoryById(id: string, companyId: string): Promise<ProductCategoryEntity> {
    return ProductMapper.categoryToEntity(await this.findCategoryOrThrow(id, companyId));
  }

  async listCategories(
    companyId: string,
    manufacturerId?: string,
    active?: boolean,
  ): Promise<ProductCategoryEntity[]> {
    return ProductMapper.categoriesToEntities(
      await this.productsRepository.findAllCategoriesForCompany(companyId, {
        manufacturerId,
        active,
      }),
    );
  }

  async createCategory(
    companyId: string,
    dto: CreateProductCategoryDto,
    actorUserId: string,
  ): Promise<ProductCategoryEntity> {
    await this.manufacturersService.findById(dto.manufacturerId, companyId);
    const category = await this.productsRepository.createCategory(companyId, dto);

    await this.auditRepository.create({
      companyId,
      userId: actorUserId,
      action: 'PRODUCT_CATEGORY_CREATED',
      entityType: 'ProductCategory',
      entityId: category.id,
      newValue: pick(category, CATEGORY_AUDIT_FIELDS),
    });

    return ProductMapper.categoryToEntity(category);
  }

  async updateCategory(
    id: string,
    companyId: string,
    dto: UpdateProductCategoryDto,
    actorUserId: string,
  ): Promise<ProductCategoryEntity> {
    const before = await this.findCategoryOrThrow(id, companyId);
    const updated = await this.productsRepository.updateCategory(id, dto);
    const changedFields = diffChangedFields(before, dto);

    if (changedFields.length > 0) {
      await this.auditRepository.create({
        companyId: before.companyId,
        userId: actorUserId,
        action: 'PRODUCT_CATEGORY_UPDATED',
        entityType: 'ProductCategory',
        entityId: id,
        previousValue: pick(before, changedFields),
        newValue: pick(updated, changedFields),
      });
    }

    return ProductMapper.categoryToEntity(updated);
  }

  private async findProductOrThrow(id: string, companyId: string) {
    const product = await this.productsRepository.findById(id, companyId);
    if (!product) throw new NotFoundException();
    return product;
  }

  private async findBrandOrThrow(id: string, companyId: string) {
    const brand = await this.productsRepository.findBrandById(id, companyId);
    if (!brand) throw new NotFoundException();
    return brand;
  }

  private async findCategoryOrThrow(id: string, companyId: string) {
    const category = await this.productsRepository.findCategoryById(id, companyId);
    if (!category) throw new NotFoundException();
    return category;
  }
}
