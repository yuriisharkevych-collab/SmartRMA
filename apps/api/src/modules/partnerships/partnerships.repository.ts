import { Injectable } from '@nestjs/common';
import { Brand, Company, Partnership, Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { deriveCaseNumberPrefix } from '../../common/utils/organization-slug.util';
import { SYSTEM_ROLE_CODES } from '../../rbac/constants/roles.const';
import { PartnershipWithRelations } from './mappers/partnership.mapper';

const WITH_RELATIONS = {
  shopCompany: { select: { id: true, name: true } },
  distributorCompany: { select: { id: true, name: true } },
  brands: { include: { brand: { select: { id: true, name: true } } } },
} as const;

@Injectable()
export class PartnershipsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Widoczne firmie po OBU stronach (Sklep lub Producent/Dystrybutor) — partnerstwo to relacja dwóch tenantów, nie zasób jednego z nich. */
  findAllForCompany(companyId: string): Promise<PartnershipWithRelations[]> {
    return this.prisma.partnership.findMany({
      where: { OR: [{ shopCompanyId: companyId }, { distributorCompanyId: companyId }] },
      include: WITH_RELATIONS,
      orderBy: { invitedAt: 'desc' },
    });
  }

  /** `companyId` obowiązkowy po OBU stronach `OR` — bez niego dowolna firma mogłaby odczytać cudze partnerstwo, znając samo UUID (IDOR). */
  findById(id: string, companyId: string): Promise<PartnershipWithRelations | null> {
    return this.prisma.partnership.findFirst({
      where: { id, OR: [{ shopCompanyId: companyId }, { distributorCompanyId: companyId }] },
      include: WITH_RELATIONS,
    });
  }

  findByCompanyPair(
    shopCompanyId: string,
    distributorCompanyId: string,
  ): Promise<Partnership | null> {
    return this.prisma.partnership.findUnique({
      where: { shopCompanyId_distributorCompanyId: { shopCompanyId, distributorCompanyId } },
    });
  }

  /** Publiczny Formularz Reklamacyjny (Faza 1) rozwiązuje organizacje wyłącznie po `slug` — Sklep zaprasza partnera tym samym identyfikatorem, nie UUID cudzej firmy. `active: true`, zgodnie z `CompaniesRepository.findBySlug`. */
  findCompanyBySlug(slug: string): Promise<Company | null> {
    return this.prisma.company.findFirst({ where: { slug, active: true } });
  }

  /** PARTNERSHIP-004 — marki proponowane do zaproszenia muszą należeć do WŁASNEGO, samoopisanego profilu zapraszanej organizacji (`Brand.companyId`), nie do katalogu prowadzonego przez kogoś innego. */
  findBrandsOwnedByCompany(brandIds: string[], companyId: string): Promise<Brand[]> {
    if (brandIds.length === 0) return Promise.resolve([]);
    return this.prisma.brand.findMany({ where: { id: { in: brandIds }, companyId } });
  }

  create(
    shopCompanyId: string,
    distributorCompanyId: string,
    invitedByUserId: string,
    brandIds: string[],
  ): Promise<PartnershipWithRelations> {
    return this.prisma.partnership.create({
      data: {
        shopCompanyId,
        distributorCompanyId,
        invitedByUserId,
        brands: { createMany: { data: brandIds.map((brandId) => ({ brandId })) } },
      },
      include: WITH_RELATIONS,
    });
  }

  updateStatus(id: string, data: Prisma.PartnershipUpdateInput): Promise<PartnershipWithRelations> {
    return this.prisma.partnership.update({ where: { id }, data, include: WITH_RELATIONS });
  }

  // --- Etap 5 — zaproszenie partnera E-MAILEM (Dystrybutor inicjuje, `shopCompany` jeszcze nie istnieje) ---

  /** PARTNERSHIP-008 — zaproszenie/partnerstwo z tym adresem u TEGO dystrybutora już istnieje (oczekujące lub aktywne), zanim założymy nową firmę na próżno. */
  findPendingOrActiveInviteByEmail(
    distributorCompanyId: string,
    email: string,
  ): Promise<Partnership | null> {
    return this.prisma.partnership.findFirst({
      where: { distributorCompanyId, inviteEmail: email, status: { in: ['Invited', 'Active'] } },
    });
  }

  /**
   * Zakłada NOWĄ, pustą firmę partnera (typ domyślny `Shop`) — dokładnie ten
   * sam komplet co `scripts/create-organization.ts` (siedziba + prefiks
   * numeracji WŁASNY dla tej firmy, `CasesRepository.findMaxSequenceInYear`
   * liczy maksimum PO PREFIKSIE, więc współdzielony prefiks zapętliłby
   * numerację dwóch firm), MINUS samoopisany Manufacturer/Brand — to jest
   * Sklep, nie Producent/Dystrybutor, nie ma czego "samoopisywać". Katalog
   * statusów (`DEFAULT_STATUS_CATALOG`) zasiewa wołający (`PartnershipsService`,
   * przez już eksportowany `CaseStatusesService.seedDefaultCatalog` — bez
   * duplikowania tej listy tutaj).
   */
  async createPendingPartnerCompany(companyName: string): Promise<Company> {
    const company = await this.prisma.company.create({ data: { name: companyName } });
    await this.prisma.companySettings.create({
      data: { companyId: company.id, caseNumberPrefix: deriveCaseNumberPrefix(companyName) },
    });
    await this.prisma.shop.create({
      data: { companyId: company.id, name: `${companyName} — siedziba` },
    });
    return company;
  }

  createWithInviteToken(
    shopCompanyId: string,
    distributorCompanyId: string,
    invitedByUserId: string,
    brandIds: string[],
    inviteEmail: string,
    inviteTokenHash: string,
    inviteTokenExpiresAt: Date,
  ): Promise<PartnershipWithRelations> {
    return this.prisma.partnership.create({
      data: {
        shopCompanyId,
        distributorCompanyId,
        invitedByUserId,
        inviteEmail,
        inviteTokenHash,
        inviteTokenExpiresAt,
        brands: { createMany: { data: brandIds.map((brandId) => ({ brandId })) } },
      },
      include: WITH_RELATIONS,
    });
  }

  /** Token porównywany po HASHU (nigdy jawną wartością) — `inviteTokenHash` jest indeksowane, jeden wiersz na hash z definicji (SHA-256 losowego 256-bitowego tokenu). */
  findByInviteTokenHash(inviteTokenHash: string): Promise<PartnershipWithRelations | null> {
    return this.prisma.partnership.findFirst({
      where: { inviteTokenHash },
      include: WITH_RELATIONS,
    });
  }

  /** Aktywacja partnerstwa PRZEZ PRZYJĘCIE zaproszenia (nie przez Dystrybutora — ten już wyraził zgodę w chwili zaproszenia) — token jednorazowy, czyszczony natychmiast po użyciu. */
  activateFromInvite(id: string): Promise<PartnershipWithRelations> {
    return this.prisma.partnership.update({
      where: { id },
      data: {
        status: 'Active',
        acceptedAt: new Date(),
        inviteEmail: null,
        inviteTokenHash: null,
        inviteTokenExpiresAt: null,
      },
      include: WITH_RELATIONS,
    });
  }

  findSystemRoleByCode(code: string): Promise<Role | null> {
    return this.prisma.role.findFirst({ where: { companyId: null, code } });
  }

  /** Pierwszy administrator NOWO zakładanej firmy partnera — ten sam wzorzec co `scripts/create-organization.ts` (rola systemowa `Administrator`, nie per-firmowa, bo firma jeszcze żadnej własnej nie ma). */
  async createAdminUser(
    companyId: string,
    firstName: string,
    lastName: string,
    email: string,
    passwordHash: string,
  ): Promise<User> {
    const role = await this.findSystemRoleByCode(SYSTEM_ROLE_CODES.ADMINISTRATOR);
    if (!role) throw new Error('Rola systemowa "Administrator" nie istnieje.');
    return this.prisma.user.create({
      data: {
        companyId,
        firstName,
        lastName,
        email,
        passwordHash,
        active: true,
        roles: { create: [{ roleId: role.id }] },
      },
    });
  }

  /**
   * Liczba reklamacji tego partnerstwa — suma DWÓCH niezależnych ścieżek,
   * którymi sprawa dociera od Sklepu do Dystrybutora (patrz `dashboard.service.ts`,
   * ten sam dualizm): formularz marki (`Case.reportedByPartnerCompanyId`,
   * sprawa żyje OD RAZU w tenancie Dystrybutora) i przekazanie pracownika
   * Sklepu (`CaseHandoff.partnershipId`, sprawa Sklepu + jej odpowiednik u
   * Dystrybutora połączone wąskim rekordem). Nie liczy dwa razy tej samej
   * sprawy — to są rozłączne mechanizmy tworzenia, nigdy oba naraz.
   */
  async countCasesForPartnership(
    shopCompanyId: string,
    distributorCompanyId: string,
  ): Promise<number> {
    const [viaForm, viaHandoff] = await Promise.all([
      this.prisma.case.count({
        where: { companyId: distributorCompanyId, reportedByPartnerCompanyId: shopCompanyId },
      }),
      this.prisma.caseHandoff.count({
        where: { originCompanyId: shopCompanyId, targetCompanyId: distributorCompanyId },
      }),
    ]);
    return viaForm + viaHandoff;
  }
}
