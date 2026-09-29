import { Injectable } from '@nestjs/common';
import { Brand, Company, OrganizationType, Partnership, Prisma, Role, User } from '@prisma/client';
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

  /**
   * Etap 6 — "Połącz z istniejącą firmą", wyszukiwanie po NIP zamiast slug
   * (wołający zwykle NIE zna sluga cudzej firmy, ale zna jej NIP z faktury/
   * umowy). `active: true` — nieaktywna firma nie przyjmuje nowych
   * partnerstw, ten sam warunek co `findCompanyBySlug`. Jednoznaczność
   * (co najwyżej jeden wynik) gwarantuje częściowy unikalny indeks
   * `Company_nip_key` (migracja `20260928120000_...`).
   */
  findCompanyByNip(nip: string): Promise<Company | null> {
    return this.prisma.company.findFirst({ where: { nip, active: true } });
  }

  /** Etap 6 — dociąga surowy rekord firmy po `id` (typ/aktywność), do rozstrzygnięcia roli Sklep/Dystrybutor w `PartnershipsService.resolveShopDistributorPair` oraz walidacji celu `requestConnection`. Bez filtra `active` — wołający sam decyduje, czy ma znaczenie (własna firma zawsze aktywna, skoro ma ważną sesję; cel sprawdzany osobno). */
  findCompanyById(id: string): Promise<Company | null> {
    return this.prisma.company.findUnique({ where: { id } });
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

  /**
   * Etap 6 — "Połącz z istniejącą firmą": tworzy `Partnership{status:Invited}`
   * BEZ żadnego `PartnershipBrand` (decyzja właściciela — marki nie są
   * częścią procesu łączenia partnerów, patrz doc-comment `InvitePartnerDto`).
   * Osobna metoda od `create()` powyżej (ten sam kształt zapisu, ale TAMTA
   * zostaje nietknięta — nadal jedyna droga dla starego trybu po `slug`,
   * który jawnie wymaga `brandIds`, żeby nie łamać jego istniejących testów).
   */
  createConnectionRequest(
    shopCompanyId: string,
    distributorCompanyId: string,
    invitedByUserId: string,
  ): Promise<PartnershipWithRelations> {
    return this.prisma.partnership.create({
      data: { shopCompanyId, distributorCompanyId, invitedByUserId },
      include: WITH_RELATIONS,
    });
  }

  /**
   * Etap 6, decyzja właściciela (punkt 2) — ponowienie ODRZUCONEJ prośby
   * AKTUALIZUJE istniejący wiersz (`Rejected` → `Invited`), nie tworzy
   * drugiego `Partnership` (chroni to `@@unique([shopCompanyId,
   * distributorCompanyId])`, który i tak by na to nie pozwolił). Resetuje
   * WSZYSTKIE znaczniki cyklu życia + pola tokenu e-mail — nawet jeśli ten
   * konkretny wiersz nigdy nie miał tokenu (stary tryb `invite()`/nowy
   * `requestConnection()`), zerowanie jest bezpieczne (już `null`) i chroni
   * przed przypadkiem, gdy odrzucone partnerstwo POWSTAŁO przez
   * `invitePartner()` (token e-mail) i nigdy nie zostało wyczyszczone przy
   * `reject()` — patrz `PartnershipsService.reject`, który dziś czyści
   * WYŁĄCZNIE `deactivatedAt`.
   */
  resetRejectedToInvited(id: string, invitedByUserId: string): Promise<PartnershipWithRelations> {
    return this.prisma.partnership.update({
      where: { id },
      data: {
        status: 'Invited',
        invitedByUserId,
        invitedAt: new Date(),
        acceptedAt: null,
        deactivatedAt: null,
        inviteEmail: null,
        inviteTokenHash: null,
        inviteTokenExpiresAt: null,
      },
      include: WITH_RELATIONS,
    });
  }

  // --- Etap 5 — zaproszenie partnera E-MAILEM (Dystrybutor inicjuje, `shopCompany` jeszcze nie istnieje) ---

  /** PARTNERSHIP-008 — zaproszenie/partnerstwo z tym adresem u TEGO dystrybutora już istnieje (oczekujące lub aktywne), zanim założymy nową firmę na próżno. */
  /** Etap 6 — `callerCompanyId` po OBU kolumnach (`OR`), bo wołający `invitePartner()` może dziś być Sklepem ALBO Producentem/Dystrybutorem (symetria) — w chwili tego sprawdzenia nowa firma jeszcze nie istnieje, więc nie da się filtrować po jednej z ról z góry. */
  findPendingOrActiveInviteByEmail(
    callerCompanyId: string,
    email: string,
  ): Promise<Partnership | null> {
    return this.prisma.partnership.findFirst({
      where: {
        OR: [{ shopCompanyId: callerCompanyId }, { distributorCompanyId: callerCompanyId }],
        inviteEmail: email,
        status: { in: ['Invited', 'Active'] },
      },
    });
  }

  /**
   * Zakłada NOWĄ, pustą firmę partnera — dokładnie ten sam komplet co
   * `scripts/create-organization.ts`/`CompaniesRepository.createOrganizationShell`
   * (siedziba + prefiks numeracji WŁASNY dla tej firmy,
   * `CasesRepository.findMaxSequenceInYear` liczy maksimum PO PREFIKSIE, więc
   * współdzielony prefiks zapętliłby numerację dwóch firm). Etap 6 — `type`
   * PRZECIWNY do wołającego (`PartnershipsService.invitePartner`, symetryczne
   * zapraszanie), więc gdy nowa firma jest `ManufacturerDistributor`, dokłada
   * TAKŻE samoopisany `Contractor`/`Manufacturer`/`Brand` (nazwa = nazwa
   * firmy) — bez tego nowo zaproszony Producent/Dystrybutor nie miałby czym
   * opisać SIEBIE (`Brand.manufacturerId` wymaga `Manufacturer`, ten
   * wymaga `Contractor`) — ten sam warunek co `createOrganizationShell`,
   * świadomie zduplikowany tutaj (nie przez cross-modułowy import
   * `CompaniesRepository`, żeby nie wiązać modułu Partnerships z Companies
   * dla ~10 linii). Dla `Shop` — bez zmian, MINUS ten komplet (Sklep
   * prowadzi katalog O KIMŚ INNYM, nie o sobie). Katalog statusów
   * (`DEFAULT_STATUS_CATALOG`) zasiewa wołający (`PartnershipsService`, przez
   * już eksportowany `CaseStatusesService.seedDefaultCatalog` — bez
   * duplikowania tej listy tutaj).
   */
  async createPendingPartnerCompany(
    companyName: string,
    nip: string,
    type: OrganizationType,
  ): Promise<Company> {
    const company = await this.prisma.company.create({ data: { name: companyName, nip, type } });
    await this.prisma.companySettings.create({
      data: { companyId: company.id, caseNumberPrefix: deriveCaseNumberPrefix(companyName) },
    });
    await this.prisma.shop.create({
      data: { companyId: company.id, name: `${companyName} — siedziba` },
    });
    if (type === 'ManufacturerDistributor') {
      const contractor = await this.prisma.contractor.create({
        data: { companyId: company.id, name: companyName, category: 'Manufacturer' },
      });
      const manufacturer = await this.prisma.manufacturer.create({
        data: {
          companyId: company.id,
          contractorId: contractor.id,
          submissionMethod: 'FormularzWWW',
        },
      });
      await this.prisma.brand.create({
        data: { companyId: company.id, manufacturerId: manufacturer.id, name: companyName },
      });
    }
    return company;
  }

  /** BEZ `brandIds` (Etap 6) — patrz doc-comment `InvitePartnerDto`. */
  createWithInviteToken(
    shopCompanyId: string,
    distributorCompanyId: string,
    invitedByUserId: string,
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
        // Fundament „Fresh Install" — akceptacja zaproszenia partnera już dowodzi
        // dostępu do tej skrzynki (link zaproszenia przyszedł na `email`), więc
        // osobna weryfikacja e-maila (jak przy `POST /companies/signup`) byłaby
        // zbędnym powtórzeniem tego samego dowodu.
        emailVerifiedAt: new Date(),
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
