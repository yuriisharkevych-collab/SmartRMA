import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditRepository } from '../audit/audit.repository';
import { CreateManufacturerDto } from './dto/create-manufacturer.dto';
import { UpdateManufacturerDto } from './dto/update-manufacturer.dto';
import { UpdateManufacturerAutomationDto } from './dto/update-manufacturer-automation.dto';
import { UpdateManufacturerLogisticsDto } from './dto/update-manufacturer-logistics.dto';
import { UpdateManufacturerSlaDto } from './dto/update-manufacturer-sla.dto';
import { ManufacturerEntity } from './entities/manufacturer.entity';
import { ManufacturerMapper } from './mappers/manufacturer.mapper';
import { ManufacturersRepository } from './manufacturers.repository';
import {
  AttentionSlaProfile,
  RequirementProfile,
  resolveAttentionSla,
  resolveRequirements,
} from './requirements-resolver';

/** TODO(MANUFACTURER-001/002): walidacja "Contractor istnieje / nie ma jeszcze profilu" nie zaimplementowana — dziś polega wyłącznie na `@@unique` w bazie. */
@Injectable()
export class ManufacturersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly manufacturersRepository: ManufacturersRepository,
    private readonly auditRepository: AuditRepository,
  ) {}

  async findAllForCompany(companyId: string): Promise<ManufacturerEntity[]> {
    return ManufacturerMapper.toEntityList(
      await this.manufacturersRepository.findAllForCompany(companyId),
    );
  }

  async findById(id: string, companyId: string): Promise<ManufacturerEntity> {
    const manufacturer = await this.manufacturersRepository.findById(id, companyId);
    if (!manufacturer) throw new NotFoundException();
    return ManufacturerMapper.toEntity(manufacturer);
  }

  /** Przypomnienia o reakcji — mapa `manufacturerId -> nadpisania SLA`, patrz `CasesService.attachAttention`. */
  async findSlaOverridesMap(
    manufacturerIds: string[],
    companyId: string,
  ): Promise<
    Map<string, { statusStaleDaysOverride: number | null; caseAgeStaleDaysOverride: number | null }>
  > {
    const rows = await this.manufacturersRepository.findSlaOverridesByIds(
      manufacturerIds,
      companyId,
    );
    return new Map(rows.map((row) => [row.manufacturerId, row]));
  }

  /**
   * Etap 3 — JEDYNE miejsce, które łączy wymagania producenta z opcjonalnym
   * nadpisaniem marki (`requirements-resolver.ts`). Wołające: `CasesService.
   * assertManufacturerRequirements`/`assertRequiredDocuments`/`computeCompleteness`,
   * `IntakeService` (formularz publiczny — od Etapu 4 z rzeczywistym `brandId`
   * wybranego produktu katalogowego, `getBrandRequirements`). `brandId` musi należeć do
   * TEGO `manufacturerId` i TEJ firmy — inaczej nadpisanie po prostu się nie
   * zastosuje (`findBrandRequirementOverride` zwróci `null`), zamiast rzucić
   * błąd na coś, co i tak nie powinno wpłynąć na wynik.
   */
  async resolveRequirementsForItem(
    manufacturerId: string | null | undefined,
    brandId: string | null | undefined,
    companyId: string,
  ): Promise<RequirementProfile | null> {
    if (!manufacturerId) return null;
    const manufacturer = await this.findById(manufacturerId, companyId);
    const brandOverride = brandId
      ? await this.manufacturersRepository.findBrandRequirementOverride(
          brandId,
          manufacturerId,
          companyId,
        )
      : null;
    return resolveRequirements(manufacturer, brandOverride);
  }

  /**
   * Etap 3 — wariant wsadowy dla list spraw (`CasesService.attachAttention`,
   * `DashboardService.countCasesNeedingAttention`, `CaseAttentionScannerService.
   * scanCompany`) — TA SAMA logika łączenia co `resolveRequirementsForItem`,
   * ale bez N+1 na sprawę: dwa zapytania (producenci + marki) niezależnie od
   * liczby spraw, potem zwykłe wyszukanie w mapie. Zwraca funkcję, nie mapę —
   * wołający i tak musi znać `manufacturerId`/`brandId` KAŻDEJ sprawy z osobna,
   * więc closure jest wygodniejsze niż złożony klucz mapy.
   */
  async resolveAttentionOverridesResolver(
    items: { manufacturerId: string | null; brandId: string | null }[],
    companyId: string,
  ): Promise<
    (item: { manufacturerId: string | null; brandId: string | null }) => AttentionSlaProfile
  > {
    const manufacturerIds = Array.from(
      new Set(items.map((i) => i.manufacturerId).filter((id): id is string => !!id)),
    );
    const brandIds = Array.from(
      new Set(items.map((i) => i.brandId).filter((id): id is string => !!id)),
    );

    const [manufacturerOverrides, brandOverrideRows] = await Promise.all([
      this.findSlaOverridesMap(manufacturerIds, companyId),
      this.manufacturersRepository.findBrandSlaOverridesByIds(brandIds, companyId),
    ]);
    const brandOverrides = new Map(brandOverrideRows.map((row) => [row.id, row]));

    return (item) =>
      resolveAttentionSla(
        item.manufacturerId ? (manufacturerOverrides.get(item.manufacturerId) ?? null) : null,
        item.brandId ? brandOverrides.get(item.brandId) : null,
      );
  }

  async create(companyId: string, dto: CreateManufacturerDto): Promise<ManufacturerEntity> {
    return ManufacturerMapper.toEntity(await this.manufacturersRepository.create(companyId, dto));
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateManufacturerDto,
  ): Promise<ManufacturerEntity> {
    await this.findById(id, companyId);
    return ManufacturerMapper.toEntity(await this.manufacturersRepository.update(id, dto));
  }

  async updateSla(
    id: string,
    companyId: string,
    dto: UpdateManufacturerSlaDto,
  ): Promise<ManufacturerEntity> {
    await this.findById(id, companyId);
    return ManufacturerMapper.toEntity(await this.manufacturersRepository.upsertSla(id, dto));
  }

  async updateLogistics(
    id: string,
    companyId: string,
    dto: UpdateManufacturerLogisticsDto,
  ): Promise<ManufacturerEntity> {
    await this.findById(id, companyId);
    return ManufacturerMapper.toEntity(await this.manufacturersRepository.upsertLogistics(id, dto));
  }

  async updateAutomation(
    id: string,
    companyId: string,
    dto: UpdateManufacturerAutomationDto,
  ): Promise<ManufacturerEntity> {
    await this.findById(id, companyId);
    return ManufacturerMapper.toEntity(
      await this.manufacturersRepository.upsertAutomation(id, dto),
    );
  }

  /**
   * `manufacturers.delete` (RBAC.md §5) — TRWAŁE usunięcie, na wyraźne
   * żądanie właściciela produktu (czyszczenie producentów testowych z
   * panelu admina). MANUFACTURER-003 blokuje, gdy producent ma choć jeden
   * `Product`/`Brand` — `Product.manufacturerId` jest polem WYMAGANYM, więc
   * usunięcie osierociłoby dane katalogowe używane przez realne sprawy;
   * jedyna bezpieczna droga wtedy to dezaktywacja (`active: false` przez
   * zwykłą edycję), nie usunięcie. Audyt PRZED skasowaniem (ślad, że
   * producent w ogóle istniał), w tej samej transakcji co kasowanie relacji
   * 1:1 (SLA/logistyka/automatyzacja) i samego wiersza `Manufacturer`.
   */
  async hardDelete(id: string, companyId: string, actorUserId: string): Promise<void> {
    const manufacturer = await this.manufacturersRepository.findById(id, companyId);
    if (!manufacturer) throw new NotFoundException();

    const { products, brands } = await this.manufacturersRepository.countProductsAndBrands(id);
    if (products > 0 || brands > 0) {
      throw new AppException(
        ERROR_CODES.MANUFACTURER_003.code,
        ERROR_CODES.MANUFACTURER_003.message,
        ERROR_CODES.MANUFACTURER_003.status,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.manufacturersRepository.deleteRelationsForHardDelete(id, tx);
      await this.auditRepository.create(
        {
          companyId,
          userId: actorUserId,
          action: 'MANUFACTURER_DELETED',
          entityType: 'Manufacturer',
          entityId: id,
          previousValue: { contractorId: manufacturer.contractorId } as Prisma.InputJsonValue,
        },
        tx,
      );
      await this.manufacturersRepository.hardDelete(id, tx);
    });
  }
}
