import { Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationType, PartnershipStatus, Prisma } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { AuditRepository } from '../audit/audit.repository';
import { InvitePartnershipDto } from './dto/invite-partnership.dto';
import { PartnershipEntity } from './entities/partnership.entity';
import { PartnershipMapper, PartnershipWithRelations } from './mappers/partnership.mapper';
import { PartnershipsRepository } from './partnerships.repository';

/**
 * Faza 4 planu (Producent/Dystrybutor + Partnerzy B2B) — cykl życia
 * partnerstwa Sklep↔Dystrybutor/Producent, scope'owanego do konkretnych marek.
 * Wzorowane 1:1 na `ManufacturersService` (ta sama struktura `findAllForCompany`/
 * `findById`/RBAC/audytu) — zero nowych mechanizmów autoryzacji.
 *
 * Izolacja jest strukturalna, nie oparta na osobnym flagowaniu: firma widzi
 * WYŁĄCZNIE partnerstwa, w których jest jedną ze stron (`PartnershipsRepository`,
 * `OR: [{shopCompanyId}, {distributorCompanyId}]`) — nie ma przekroju "wszystkie
 * partnerstwa w systemie".
 */
@Injectable()
export class PartnershipsService {
  constructor(
    private readonly partnershipsRepository: PartnershipsRepository,
    private readonly auditRepository: AuditRepository,
  ) {}

  async findAllForCompany(companyId: string): Promise<PartnershipEntity[]> {
    return PartnershipMapper.toEntityList(
      await this.partnershipsRepository.findAllForCompany(companyId),
    );
  }

  async findById(id: string, companyId: string): Promise<PartnershipEntity> {
    return PartnershipMapper.toEntity(await this.findRawOrThrow(id, companyId));
  }

  /**
   * `companyId` wołającego to zawsze strona Sklepu — dziś nie ma odwrotnego
   * kierunku zaproszenia (Producent/Dystrybutor zapraszający Sklep), zgodnie
   * z planem Fazy 4/16-punktową specyfikacją właściciela (Sklep inicjuje
   * współpracę). `distributorSlug` rozwiązywany tym samym mechanizmem co
   * Formularz Publiczny (Faza 1) — Sklep nie zna UUID cudzej firmy.
   */
  async invite(
    companyId: string,
    actorUserId: string,
    dto: InvitePartnershipDto,
  ): Promise<PartnershipEntity> {
    const distributor = await this.partnershipsRepository.findCompanyBySlug(dto.distributorSlug);
    if (!distributor || distributor.type !== OrganizationType.ManufacturerDistributor) {
      throw new AppException(
        ERROR_CODES.PARTNERSHIP_001.code,
        ERROR_CODES.PARTNERSHIP_001.message,
        ERROR_CODES.PARTNERSHIP_001.status,
      );
    }

    const existing = await this.partnershipsRepository.findByCompanyPair(companyId, distributor.id);
    if (existing) {
      throw new AppException(
        ERROR_CODES.PARTNERSHIP_002.code,
        ERROR_CODES.PARTNERSHIP_002.message,
        ERROR_CODES.PARTNERSHIP_002.status,
      );
    }

    const ownedBrands = await this.partnershipsRepository.findBrandsOwnedByCompany(
      dto.brandIds,
      distributor.id,
    );
    if (ownedBrands.length !== dto.brandIds.length) {
      throw new AppException(
        ERROR_CODES.PARTNERSHIP_004.code,
        ERROR_CODES.PARTNERSHIP_004.message,
        ERROR_CODES.PARTNERSHIP_004.status,
      );
    }

    const created = await this.partnershipsRepository.create(
      companyId,
      distributor.id,
      actorUserId,
      dto.brandIds,
    );

    await this.auditRepository.create({
      companyId,
      userId: actorUserId,
      action: 'PARTNERSHIP_INVITED',
      entityType: 'Partnership',
      entityId: created.id,
      newValue: {
        distributorCompanyId: distributor.id,
        brandIds: dto.brandIds,
      } as Prisma.InputJsonValue,
    });

    return PartnershipMapper.toEntity(created);
  }

  /** Wyłącznie strona Dystrybutora/Producenta może zaakceptować zaproszenie — PARTNERSHIP-003, gdy woła Sklep (który JEST stroną, więc widzi 403, nie 404 — patrz `findRawOrThrow`). */
  async accept(id: string, companyId: string, actorUserId: string): Promise<PartnershipEntity> {
    const partnership = await this.assertDistributorSide(id, companyId);
    const updated = await this.partnershipsRepository.updateStatus(partnership.id, {
      status: PartnershipStatus.Active,
      acceptedAt: new Date(),
    });

    await this.auditRepository.create({
      companyId,
      userId: actorUserId,
      action: 'PARTNERSHIP_ACCEPTED',
      entityType: 'Partnership',
      entityId: partnership.id,
    });

    return PartnershipMapper.toEntity(updated);
  }

  async reject(id: string, companyId: string, actorUserId: string): Promise<PartnershipEntity> {
    const partnership = await this.assertDistributorSide(id, companyId);
    const updated = await this.partnershipsRepository.updateStatus(partnership.id, {
      status: PartnershipStatus.Rejected,
      deactivatedAt: new Date(),
    });

    await this.auditRepository.create({
      companyId,
      userId: actorUserId,
      action: 'PARTNERSHIP_REJECTED',
      entityType: 'Partnership',
      entityId: partnership.id,
    });

    return PartnershipMapper.toEntity(updated);
  }

  /** Dezaktywacja dozwolona z OBU stron (Sklep lub Dystrybutor/Producent) — w przeciwieństwie do akceptacji/odrzucenia, każda ze stron może zakończyć aktywną współpracę. */
  async deactivate(id: string, companyId: string, actorUserId: string): Promise<PartnershipEntity> {
    const partnership = await this.findRawOrThrow(id, companyId);
    const updated = await this.partnershipsRepository.updateStatus(partnership.id, {
      status: PartnershipStatus.Inactive,
      deactivatedAt: new Date(),
    });

    await this.auditRepository.create({
      companyId,
      userId: actorUserId,
      action: 'PARTNERSHIP_DEACTIVATED',
      entityType: 'Partnership',
      entityId: partnership.id,
    });

    return PartnershipMapper.toEntity(updated);
  }

  /**
   * Faza 5 (`CaseHandoffService.sendToPartner`) — bramka autoryzacyjna dla
   * przekazania sprawy: partnerstwo musi być stroną Sklepu (nie
   * Dystrybutora — tylko Sklep inicjuje przekazanie), aktywne, i musieć
   * obejmować WSKAZANĄ markę docelową (własną markę Dystrybutora/Producenta,
   * wybraną przez pracownika przy przekazaniu — patrz `SendToPartnerDto`).
   * Zwraca pełny wiersz (nie `Entity`) — `CaseHandoffService` potrzebuje
   * `distributorCompanyId` do utworzenia sprawy w tenancie partnera.
   */
  async assertActiveForShopWithBrand(
    partnershipId: string,
    shopCompanyId: string,
    brandId: string,
  ): Promise<PartnershipWithRelations> {
    const partnership = await this.partnershipsRepository.findById(partnershipId, shopCompanyId);
    const covers = partnership?.brands.some((b) => b.brandId === brandId) ?? false;
    if (
      !partnership ||
      partnership.shopCompanyId !== shopCompanyId ||
      partnership.status !== PartnershipStatus.Active ||
      !covers
    ) {
      throw new AppException(
        ERROR_CODES.PARTNERSHIP_005.code,
        ERROR_CODES.PARTNERSHIP_005.message,
        ERROR_CODES.PARTNERSHIP_005.status,
      );
    }
    return partnership;
  }

  /**
   * `CasesService.create` (obrona w głąb dla `Case.reportedByPartnerCompanyId`, formularz
   * rozgałęziony marki wariant "osobne konto Dystrybutora") — `IntakeService` już zweryfikował
   * to samo przed wywołaniem, ale `POST /cases` jest też ścieżką pracownika: bez tej bramki
   * dowolny pracownik dowolnej firmy mógłby przypiąć do swojej sprawy UUID cudzej,
   * niepowiązanej firmy (IDOR — wyciek istnienia/nazwy firmy spoza sieci partnerów).
   */
  async assertActiveShopPartner(
    distributorCompanyId: string,
    shopCompanyId: string,
  ): Promise<void> {
    const partnership = await this.partnershipsRepository.findByCompanyPair(
      shopCompanyId,
      distributorCompanyId,
    );
    if (!partnership || partnership.status !== PartnershipStatus.Active)
      throw new NotFoundException();
  }

  private async findRawOrThrow(id: string, companyId: string): Promise<PartnershipWithRelations> {
    const partnership = await this.partnershipsRepository.findById(id, companyId);
    if (!partnership) throw new NotFoundException();
    return partnership;
  }

  private async assertDistributorSide(
    id: string,
    companyId: string,
  ): Promise<PartnershipWithRelations> {
    const partnership = await this.findRawOrThrow(id, companyId);
    if (partnership.distributorCompanyId !== companyId) {
      throw new AppException(
        ERROR_CODES.PARTNERSHIP_003.code,
        ERROR_CODES.PARTNERSHIP_003.message,
        ERROR_CODES.PARTNERSHIP_003.status,
      );
    }
    return partnership;
  }
}
