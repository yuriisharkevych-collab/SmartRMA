import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ManufacturerWithRelations } from './mappers/manufacturer.mapper';

const WITH_RELATIONS = { sla: true, logistics: true, automation: true } as const;

@Injectable()
export class ManufacturersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllForCompany(companyId: string): Promise<ManufacturerWithRelations[]> {
    return this.prisma.manufacturer.findMany({ where: { companyId }, include: WITH_RELATIONS });
  }

  /** Przypomnienia o reakcji — nadpisania SLA (`statusStaleDaysOverride`/`caseAgeStaleDaysOverride`) dla wielu producentów jednym zapytaniem (bez N+1 per sprawę), patrz `CasesService.attachAttention`. `companyId` obowiązkowy mimo że `manufacturerIds` pochodzi z już przefiltrowanych po firmie spraw — obrona w głębi, wzorem reszty repozytorium (IDOR). */
  findSlaOverridesByIds(
    manufacturerIds: string[],
    companyId: string,
  ): Promise<
    {
      manufacturerId: string;
      statusStaleDaysOverride: number | null;
      caseAgeStaleDaysOverride: number | null;
    }[]
  > {
    if (manufacturerIds.length === 0) return Promise.resolve([]);
    return this.prisma.manufacturerSLA.findMany({
      where: { manufacturerId: { in: manufacturerIds }, manufacturer: { companyId } },
      select: {
        manufacturerId: true,
        statusStaleDaysOverride: true,
        caseAgeStaleDaysOverride: true,
      },
    });
  }

  /**
   * Etap 3 — nadpisanie wymagań JEDNEJ marki, dla `ManufacturersService.
   * resolveRequirementsForItem`. `manufacturerId` w `where` (nie tylko
   * `companyId`) — obrona w głębi: nadpisanie marki INNEGO producenta tej
   * samej firmy nigdy nie powinno się zastosować, nawet gdyby wołający się
   * pomylił co do `manufacturerId` pozycji sprawy.
   */
  findBrandRequirementOverride(
    brandId: string,
    manufacturerId: string,
    companyId: string,
  ): Promise<Pick<
    Prisma.BrandGetPayload<object>,
    | 'requiresSerialNumber'
    | 'requiresFrameNumber'
    | 'requiresProofOfPurchase'
    | 'minPhotos'
    | 'requiresVideo'
    | 'maxPhotos'
    | 'maxAttachmentSizeMb'
  > | null> {
    return this.prisma.brand.findFirst({
      where: { id: brandId, manufacturerId, companyId },
      select: {
        requiresSerialNumber: true,
        requiresFrameNumber: true,
        requiresProofOfPurchase: true,
        minPhotos: true,
        requiresVideo: true,
        maxPhotos: true,
        maxAttachmentSizeMb: true,
      },
    });
  }

  /** Etap 3 — nadpisania SLA (przypomnienia o reakcji) dla wielu marek jednym zapytaniem, ten sam wzorzec co `findSlaOverridesByIds` dla producentów. */
  findBrandSlaOverridesByIds(
    brandIds: string[],
    companyId: string,
  ): Promise<
    {
      id: string;
      statusStaleDaysOverride: number | null;
      caseAgeStaleDaysOverride: number | null;
    }[]
  > {
    if (brandIds.length === 0) return Promise.resolve([]);
    return this.prisma.brand.findMany({
      where: { id: { in: brandIds }, companyId },
      select: { id: true, statusStaleDaysOverride: true, caseAgeStaleDaysOverride: true },
    });
  }

  /** `companyId` obowiązkowy — bez niego administrator jednej firmy mógłby odczytać/edytować (w tym SLA/logistykę/automatyzację) profil producenta innej firmy, znając samo UUID (IDOR, patrz audyt bezpieczeństwa). */
  findById(id: string, companyId: string): Promise<ManufacturerWithRelations | null> {
    return this.prisma.manufacturer.findFirst({
      where: { id, companyId },
      include: WITH_RELATIONS,
    });
  }

  /** `GET /manufacturers/:id/logo` (publiczny, Etap 6) — celowo BEZ `companyId`, dokładnie jak `CompaniesRepository.findById`: logo nie jest daną wrażliwą, a wołający nie ma sesji/firmy do przekazania. */
  findByIdUnscoped(id: string): Promise<ManufacturerWithRelations | null> {
    return this.prisma.manufacturer.findUnique({ where: { id }, include: WITH_RELATIONS });
  }

  create(
    companyId: string,
    data: Omit<Prisma.ManufacturerUncheckedCreateInput, 'companyId'>,
  ): Promise<ManufacturerWithRelations> {
    return this.prisma.manufacturer.create({
      data: { ...data, companyId },
      include: WITH_RELATIONS,
    });
  }

  update(id: string, data: Prisma.ManufacturerUpdateInput): Promise<ManufacturerWithRelations> {
    return this.prisma.manufacturer.update({ where: { id }, data, include: WITH_RELATIONS });
  }

  upsertSla(
    manufacturerId: string,
    data: Partial<{
      responseDays: number | null;
      repairDays: number | null;
      reminderAfterDays: number | null;
      escalationAfterDays: number | null;
      statusStaleDaysOverride: number | null;
      caseAgeStaleDaysOverride: number | null;
    }>,
  ): Promise<ManufacturerWithRelations> {
    return this.prisma.manufacturer.update({
      where: { id: manufacturerId },
      data: { sla: { upsert: { create: data, update: data } } },
      include: WITH_RELATIONS,
    });
  }

  /** `ManufacturerLogistics` to relacja 1:1 tworzona leniwie — `upsert` obsługuje jednocześnie pierwszą konfigurację i późniejszą edycję (wzorzec z `upsertSla`). */
  upsertLogistics(
    manufacturerId: string,
    data: Prisma.ManufacturerLogisticsUpdateWithoutManufacturerInput,
  ): Promise<ManufacturerWithRelations> {
    return this.prisma.manufacturer.update({
      where: { id: manufacturerId },
      data: {
        logistics: {
          upsert: {
            create: data as Prisma.ManufacturerLogisticsCreateWithoutManufacturerInput,
            update: data,
          },
        },
      },
      include: WITH_RELATIONS,
    });
  }

  upsertAutomation(
    manufacturerId: string,
    data: Prisma.ManufacturerAutomationUpdateWithoutManufacturerInput,
  ): Promise<ManufacturerWithRelations> {
    return this.prisma.manufacturer.update({
      where: { id: manufacturerId },
      data: {
        automation: {
          upsert: {
            create: data as Prisma.ManufacturerAutomationCreateWithoutManufacturerInput,
            update: data,
          },
        },
      },
      include: WITH_RELATIONS,
    });
  }

  /** `manufacturers.delete` (RBAC.md §5) — czy trwałe usunięcie jest bezpieczne. `Product.manufacturerId` jest WYMAGANE (nie nullable), więc choćby jeden przypisany produkt/marka blokuje usunięcie (MANUFACTURER-003) — inaczej skasowanie osierociłoby dane katalogowe używane przez realne sprawy. */
  async countProductsAndBrands(
    manufacturerId: string,
  ): Promise<{ products: number; brands: number }> {
    const [products, brands] = await Promise.all([
      this.prisma.product.count({ where: { manufacturerId } }),
      this.prisma.brand.count({ where: { manufacturerId } }),
    ]);
    return { products, brands };
  }

  /** `manufacturers.delete` (RBAC.md §5, jedyny hard-delete tego modułu) — kasuje relacje 1:1 (SLA/logistyka/automatyzacja, brak `onDelete: Cascade` w schemacie), `client` = `tx` z `ManufacturersService.hardDelete`, żeby było atomowe razem z wpisem `AuditLog`. */
  deleteRelationsForHardDelete(
    manufacturerId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<unknown> {
    return Promise.all([
      client.manufacturerSLA.deleteMany({ where: { manufacturerId } }),
      client.manufacturerLogistics.deleteMany({ where: { manufacturerId } }),
      client.manufacturerAutomation.deleteMany({ where: { manufacturerId } }),
    ]);
  }

  /** Kasuje sam wiersz `Manufacturer` — wołający musi wcześniej, w TEJ SAMEJ transakcji, wyczyścić relacje 1:1 (`deleteRelationsForHardDelete`). Celowo NIE dotyka leżącego pod spodem `Contractor`. */
  hardDelete(
    id: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<unknown> {
    return client.manufacturer.delete({ where: { id } });
  }
}
