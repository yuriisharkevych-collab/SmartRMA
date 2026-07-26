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
import { UpdateBrandDto } from './dto/update-brand.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { BrandEntity, ProductEntity } from './entities/product.entity';
import { ProductMapper } from './mappers/product.mapper';
import { ProductsRepository } from './products.repository';

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

const PRODUCT_AUDIT_FIELDS = ['name', 'sku', 'category', 'manufacturerId', 'brandId'] as const;
const BRAND_AUDIT_FIELDS = ['name', 'manufacturerId'] as const;

/**
 * BR-074/BR-076 — `Product` to pozycja katalogowa (nie egzemplarz), `Brand`
 * jest polem pomocniczym przy wyborze producenta i NIE wymusza spójności
 * `Product.manufacturerId`/`Brand.manufacturerId` ("sugeruje, nie wymusza")
 * — celowo brak takiej walidacji krzyżowej.
 *
 * `manufacturerId`/`brandId` weryfikowane przez istniejące serwisy przed
 * zapisem (żeby naruszenie FK kończyło się 404, nie surowym wyjątkiem
 * Prisma P2003) — nigdy bezpośrednio przez Prisma poza Repository.
 *
 * Brak kodów PRODUCT-*/BRAND-* w ERROR_CODES.md — "nie znaleziono" rzuca
 * gołym `NotFoundException()`, ten sam już zaakceptowany brak co w
 * `CompaniesService`/`CustomersService`.
 *
 * Brak dezaktywacji: mimo że `Product.active`/`Brand.active` istnieją w
 * schemacie, zadanie nie wymieniało `deactivateProduct`/`deactivateBrand`
 * wśród wymaganych operacji (w przeciwieństwie do Zadania 12/13, które
 * wprost o to pytały) — nie dodano więc żadnego endpointu/metody do tego,
 * żeby nie wprowadzać funkcjonalności spoza zamówionego zakresu.
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly auditRepository: AuditRepository,
    private readonly manufacturersService: ManufacturersService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async findById(id: string): Promise<ProductEntity> {
    const product = await this.findProductOrThrow(id);
    return ProductMapper.toEntity(product);
  }

  async listProducts(companyId: string): Promise<ProductEntity[]> {
    return ProductMapper.toEntityList(await this.productsRepository.findAllForCompany(companyId));
  }

  async searchProducts(companyId: string, query: string): Promise<ProductEntity[]> {
    return ProductMapper.toEntityList(await this.productsRepository.search(companyId, query));
  }

  async createProduct(companyId: string, dto: CreateProductDto, actorUserId: string): Promise<ProductEntity> {
    await this.manufacturersService.findById(dto.manufacturerId);
    if (dto.brandId) await this.findBrandOrThrow(dto.brandId);

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

  async updateProduct(id: string, dto: UpdateProductDto, actorUserId: string): Promise<ProductEntity> {
    const before = await this.findProductOrThrow(id);
    if (dto.manufacturerId) await this.manufacturersService.findById(dto.manufacturerId);
    if (dto.brandId) await this.findBrandOrThrow(dto.brandId);

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

  async findBrandById(id: string): Promise<BrandEntity> {
    const brand = await this.findBrandOrThrow(id);
    return ProductMapper.brandToEntity(brand);
  }

  async listBrands(companyId: string): Promise<BrandEntity[]> {
    return ProductMapper.brandsToEntities(await this.productsRepository.findAllBrandsForCompany(companyId));
  }

  async searchBrands(companyId: string, query: string): Promise<BrandEntity[]> {
    return ProductMapper.brandsToEntities(await this.productsRepository.searchBrands(companyId, query));
  }

  async createBrand(companyId: string, dto: CreateBrandDto, actorUserId: string): Promise<BrandEntity> {
    await this.manufacturersService.findById(dto.manufacturerId);
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

  async updateBrand(id: string, dto: UpdateBrandDto, actorUserId: string): Promise<BrandEntity> {
    const before = await this.findBrandOrThrow(id);
    if (dto.manufacturerId) await this.manufacturersService.findById(dto.manufacturerId);

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

  private async findProductOrThrow(id: string) {
    const product = await this.productsRepository.findById(id);
    if (!product) throw new NotFoundException();
    return product;
  }

  private async findBrandOrThrow(id: string) {
    const brand = await this.productsRepository.findBrandById(id);
    if (!brand) throw new NotFoundException();
    return brand;
  }
}
