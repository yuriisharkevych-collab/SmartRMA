import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditRepository } from '../audit/audit.repository';
import {
  CompanyUpdatedPayload,
  ShopCreatedPayload,
  ShopDeactivatedPayload,
  ShopUpdatedPayload,
} from '../../events/contracts/company.events';
import { DomainEvent } from '../../events/domain-event.base';
import { EVENT_BUS, IEventBus } from '../../events/event-bus.interface';
import { EVENT_NAMES } from '../../events/event-names.const';
import { CompaniesRepository } from './companies.repository';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { CompanyEntity } from './entities/company.entity';
import { ShopEntity } from './entities/shop.entity';
import { CompanyMapper } from './mappers/company.mapper';

const SHOP_AUDIT_FIELDS = ['name', 'address', 'city', 'postalCode', 'phone', 'email'] as const;

/** Tylko pola faktycznie przesłane w `patch` (obecne jako własne klucze DTO po ValidationPipe) i różne od `before`. */
function diffChangedFields(before: object, patch: object): string[] {
  const b = before as Record<string, unknown>;
  const p = patch as Record<string, unknown>;
  return Object.keys(p).filter((key) => p[key] !== undefined && p[key] !== b[key]);
}

function pick(obj: object, keys: readonly string[]): Prisma.InputJsonValue {
  const o = obj as Record<string, unknown>;
  return Object.fromEntries(keys.map((key) => [key, o[key] ?? null])) as Prisma.InputJsonValue;
}

/**
 * BR-086 — MVP ma dokładnie jedną `Company`, tworzoną przez seed. `createCompany`/
 * `listCompanies`/`deactivateCompany`/`reactivateCompany` NIE istnieją tu celowo:
 * RBAC.md §2 zna wyłącznie `company.manage` (edycja), bez odpowiednika
 * create/view-many/deactivate/reactivate dla Company — patrz raport końcowy
 * Zadania 12. Shop natomiast ma pełne CRUD + deaktywację, zgodnie z `shops.manage`.
 *
 * Brak kodów COMPANY-* / SHOP-* w ERROR_CODES.md — "nie znaleziono" rzuca gołym
 * `NotFoundException()`, dokładnie jak `DocumentsService.findById` (ten sam,
 * już zaakceptowany brak, patrz raport końcowy).
 */
@Injectable()
export class CompaniesService {
  constructor(
    private readonly companiesRepository: CompaniesRepository,
    private readonly auditRepository: AuditRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async findById(id: string): Promise<CompanyEntity> {
    const company = await this.findCompanyOrThrow(id);
    return CompanyMapper.toEntity(company);
  }

  async update(id: string, dto: UpdateCompanyDto, actorUserId: string): Promise<CompanyEntity> {
    const before = await this.findCompanyOrThrow(id);
    const updated = await this.companiesRepository.update(id, dto);
    const changedFields = diffChangedFields(before, dto);

    if (changedFields.length > 0) {
      await this.auditRepository.create({
        companyId: id,
        userId: actorUserId,
        action: 'COMPANY_UPDATED',
        entityType: 'Company',
        entityId: id,
        previousValue: pick(before, changedFields),
        newValue: pick(updated, changedFields),
      });

      await this.eventBus.publish(
        new DomainEvent<CompanyUpdatedPayload>({
          eventName: EVENT_NAMES.COMPANY_UPDATED,
          companyId: id,
          aggregateType: 'Company',
          aggregateId: id,
          actorUserId,
          correlationId: randomUUID(),
          payload: { changedFields },
        }),
      );
    }

    return CompanyMapper.toEntity(updated);
  }

  async findShops(companyId: string): Promise<ShopEntity[]> {
    return CompanyMapper.shopsToEntities(
      await this.companiesRepository.findShopsByCompany(companyId),
    );
  }

  /** Zadanie 15 (Orders) — weryfikacja referencji `Order.shopId` przed zapisem, reużywając istniejący existence-check zamiast duplikować go w module Orders. */
  async findShopById(id: string): Promise<ShopEntity> {
    const shop = await this.findShopOrThrow(id);
    return CompanyMapper.shopToEntity(shop);
  }

  async createShop(
    companyId: string,
    dto: CreateShopDto,
    actorUserId: string,
  ): Promise<ShopEntity> {
    const shop = await this.companiesRepository.createShop(companyId, dto);

    await this.auditRepository.create({
      companyId,
      userId: actorUserId,
      action: 'SHOP_CREATED',
      entityType: 'Shop',
      entityId: shop.id,
      newValue: pick(shop, SHOP_AUDIT_FIELDS),
    });

    await this.eventBus.publish(
      new DomainEvent<ShopCreatedPayload>({
        eventName: EVENT_NAMES.SHOP_CREATED,
        companyId,
        aggregateType: 'Shop',
        aggregateId: shop.id,
        actorUserId,
        correlationId: randomUUID(),
        payload: { name: shop.name },
      }),
    );

    return CompanyMapper.shopToEntity(shop);
  }

  async updateShop(id: string, dto: UpdateShopDto, actorUserId: string): Promise<ShopEntity> {
    const before = await this.findShopOrThrow(id);
    const updated = await this.companiesRepository.updateShop(id, dto);
    const changedFields = diffChangedFields(before, dto);

    if (changedFields.length > 0) {
      await this.auditRepository.create({
        companyId: before.companyId,
        userId: actorUserId,
        action: 'SHOP_UPDATED',
        entityType: 'Shop',
        entityId: id,
        previousValue: pick(before, changedFields),
        newValue: pick(updated, changedFields),
      });

      await this.eventBus.publish(
        new DomainEvent<ShopUpdatedPayload>({
          eventName: EVENT_NAMES.SHOP_UPDATED,
          companyId: before.companyId,
          aggregateType: 'Shop',
          aggregateId: id,
          actorUserId,
          correlationId: randomUUID(),
          payload: { changedFields },
        }),
      );
    }

    return CompanyMapper.shopToEntity(updated);
  }

  /** `shops.manage` — soft delete (`active=false`), zawsze dozwolone, bez blokad (brak reguły biznesowej wymagającej inaczej). */
  async deactivateShop(id: string, actorUserId: string): Promise<ShopEntity> {
    const before = await this.findShopOrThrow(id);
    const updated = await this.companiesRepository.updateShop(id, { active: false });

    await this.auditRepository.create({
      companyId: before.companyId,
      userId: actorUserId,
      action: 'SHOP_DEACTIVATED',
      entityType: 'Shop',
      entityId: id,
      previousValue: { active: before.active },
      newValue: { active: updated.active },
    });

    await this.eventBus.publish(
      new DomainEvent<ShopDeactivatedPayload>({
        eventName: EVENT_NAMES.SHOP_DEACTIVATED,
        companyId: before.companyId,
        aggregateType: 'Shop',
        aggregateId: id,
        actorUserId,
        correlationId: randomUUID(),
        payload: {},
      }),
    );

    return CompanyMapper.shopToEntity(updated);
  }

  private async findCompanyOrThrow(id: string) {
    const company = await this.companiesRepository.findById(id);
    if (!company) throw new NotFoundException();
    return company;
  }

  private async findShopOrThrow(id: string) {
    const shop = await this.companiesRepository.findShopById(id);
    if (!shop) throw new NotFoundException();
    return shop;
  }
}
