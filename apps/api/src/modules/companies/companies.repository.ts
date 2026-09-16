import { Injectable } from '@nestjs/common';
import {
  Company,
  LoginMethod,
  OrganizationKind,
  OrganizationType,
  Prisma,
  Shop,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_STATUS_CATALOG } from '../case-statuses/case-statuses.service';
import { SYSTEM_ROLE_CODES } from '../../rbac/constants/roles.const';

type PrismaClientLike = Prisma.TransactionClient | PrismaService;

@Injectable()
export class CompaniesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Company | null> {
    return this.prisma.company.findUnique({ where: { id } });
  }

  // --- Etap 6 — onboarding samoobsługowy (`POST /companies/signup`) ---

  /** Sprawdzenie kolizji sluga PRZED transakcją (pre-check, nie łapanie P2002 na ślepo — ten sam wzorzec co `ContractorsService`/NIP, patrz jej doc-comment) — `slug` koliduje niezależnie od `active`, więc bez filtra `active:true` (w przeciwieństwie do `findBySlug` publicznego formularza). */
  slugExists(slug: string, client: PrismaClientLike = this.prisma): Promise<boolean> {
    return client.company.findFirst({ where: { slug } }).then((row) => row !== null);
  }

  /**
   * Etap 7 (audyt gotowości produkcyjnej, punkt "Izolacja tenantów"/8b z
   * raportu wdrożeniowego 17.08) — `CompanySettings.caseNumberPrefix` NIE MA
   * unikalności wymuszonej w bazie (`String @default("RMA")`, bez `@unique`),
   * a `CasesRepository.findMaxSequenceInYear` liczy maksimum numeru sprawy PO
   * PREFIKSIE, nie po `companyId` (`Case.caseNumber` jest unikalny GLOBALNIE —
   * Portal Klienta loguje się samym numerem sprawy, bez podawania firmy).
   * Dwie firmy o podobnym prefiksie (np. "TextilePro"/"Textylia" → oba "TEXT")
   * dzieliłyby tę samą sekwencję numeracji — nie przecieka danych, ale psuje
   * sens numeracji obu firmom. `signup()` sprawdza to PRZED transakcją, tym
   * samym wzorzec co `slugExists` wyżej.
   */
  caseNumberPrefixExists(prefix: string, client: PrismaClientLike = this.prisma): Promise<boolean> {
    return client.companySettings
      .findFirst({ where: { caseNumberPrefix: prefix } })
      .then((row) => row !== null);
  }

  /** USER-001 dotyczy globalnie WSZYSTKICH firm — `User_email_password_key` to częściowy indeks bez `companyId` (patrz komentarz przy `User.email` w schemacie), więc nowo zakładana firma może "ukraść" e-mail administratora innej firmy, jeśli tego nie sprawdzimy tutaj. */
  passwordAccountEmailExists(
    email: string,
    client: PrismaClientLike = this.prisma,
  ): Promise<boolean> {
    return client.user
      .findFirst({ where: { email, loginMethod: LoginMethod.Password } })
      .then((row) => row !== null);
  }

  findAdministratorRole(client: PrismaClientLike = this.prisma) {
    return client.role.findFirst({
      where: { companyId: null, code: SYSTEM_ROLE_CODES.ADMINISTRATOR },
    });
  }

  /**
   * Zakłada organizację "od zera" — DOKŁADNIE ten sam komplet co
   * `scripts/create-organization.ts` (Company + CompanySettings + Shop +
   * katalog statusów), tylko jako wywoływalna metoda repozytorium zamiast
   * jednorazowego skryptu poza NestJS DI — świadomie NIE nowy, równoległy
   * mechanizm inicjalizacji firmy (właściciel: "nie twórz równoległego
   * mechanizmu"), tylko ten sam wzorzec przeniesiony do warstwy aplikacji,
   * żeby `CompaniesService.signup` mógł go wywołać wewnątrz JEDNEJ transakcji
   * z utworzeniem pierwszego Administratora.
   *
   * Fundament „Fresh Install" dokłada gałąź `type=Shop`: samoopisany
   * Contractor/Manufacturer/Brand (katalog "producentów, których TA firma
   * obsługuje") ma sens WYŁĄCZNIE dla `ManufacturerDistributor` — Sklep
   * prowadzi katalog o KIMŚ INNYM (istniejąca mechanika `ManufacturersPage`),
   * nie o sobie samym. Tworzenie go dla nowego Sklepu byłoby pustym,
   * mylącym rekordem "producenta" o tej samej nazwie co sam Sklep.
   */
  async createOrganizationShell(
    data: {
      name: string;
      slug: string;
      type: OrganizationType;
      orgKind: OrganizationKind | null;
      nip: string;
      caseNumberPrefix: string;
    },
    client: PrismaClientLike = this.prisma,
  ): Promise<Company> {
    const company = await client.company.create({
      data: {
        name: data.name,
        slug: data.slug,
        type: data.type,
        orgKind: data.orgKind,
        nip: data.nip,
      },
    });
    await client.companySettings.create({
      data: { companyId: company.id, caseNumberPrefix: data.caseNumberPrefix },
    });
    await client.shop.create({ data: { companyId: company.id, name: `${data.name} — siedziba` } });

    if (data.type === 'ManufacturerDistributor') {
      const contractor = await client.contractor.create({
        data: { companyId: company.id, name: data.name, category: 'Manufacturer' },
      });
      const manufacturer = await client.manufacturer.create({
        data: {
          companyId: company.id,
          contractorId: contractor.id,
          submissionMethod: 'FormularzWWW',
        },
      });
      await client.brand.create({
        data: { companyId: company.id, manufacturerId: manufacturer.id, name: data.name },
      });
    }

    await client.caseStatusDefinition.createMany({
      data: DEFAULT_STATUS_CATALOG.map((row) => ({ ...row, companyId: company.id })),
    });

    return company;
  }

  /**
   * Pierwszy i JEDYNY Administrator zakładany przez `signup()` — rola
   * systemowa (`companyId:null`), dokładnie ten sam wzorzec co
   * `PartnershipsRepository.createAdminUser`/`create-organization.ts`. Woła
   * się RAZ, wewnątrz tej samej transakcji co `createOrganizationShell`.
   *
   * Fundament „Fresh Install" — BRAK `emailVerifiedAt` (zostaje `null`, w
   * przeciwieństwie do `UsersRepository.create`/`PartnershipsRepository.
   * createAdminUser`, patrz ich doc-comment): to JEDYNE miejsce tworzenia
   * `User`, gdzie nikt wcześniej nie poświadczył adresu e-mail — self-service
   * rejestracja wymaga potwierdzenia PRZED pierwszym logowaniem (AUTH-007).
   * Token weryfikacyjny zapisywany w TEJ SAMEJ transakcji co reszta konta.
   */
  async createFirstAdmin(
    companyId: string,
    data: {
      firstName: string;
      lastName: string;
      email: string;
      passwordHash: string;
      emailVerificationTokenHash: string;
      emailVerificationTokenExpiresAt: Date;
    },
    client: PrismaClientLike = this.prisma,
  ) {
    const role = await this.findAdministratorRole(client);
    if (!role) throw new Error('Rola systemowa "Administrator" nie istnieje.');
    return client.user.create({
      data: {
        companyId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        passwordHash: data.passwordHash,
        active: true,
        emailVerificationTokenHash: data.emailVerificationTokenHash,
        emailVerificationTokenExpiresAt: data.emailVerificationTokenExpiresAt,
        roles: { create: [{ roleId: role.id }] },
      },
    });
  }

  /**
   * Publiczny Formularz Reklamacyjny — punkt wejścia BEZ sesji/tokenu, więc firma
   * jest rozstrzygana przez `slug` w adresie (`/reklamacja/:orgSlug`), nie przez
   * domyślanie się "jedynej aktywnej firmy" (dawne BR-086 — porzucone: ten sam
   * mechanizm już raz zepsuł formularz, gdy w bazie powstała druga aktywna firma
   * testowa). `active: true` dodatkowo — nieaktywna firma nie ma prawa przyjmować
   * nowych zgłoszeń. Każda organizacja (Sklep, Producent/Dystrybutor) ma własny slug.
   */
  findBySlug(slug: string): Promise<Company | null> {
    return this.prisma.company.findFirst({ where: { slug, active: true } });
  }

  update(
    id: string,
    data: Partial<
      Pick<
        Company,
        | 'name'
        | 'nip'
        | 'regon'
        | 'address'
        | 'email'
        | 'phone'
        | 'website'
        | 'privacyPolicyUrl'
        | 'privacyPolicyVersion'
        | 'termsUrl'
      >
    >,
  ): Promise<Company> {
    return this.prisma.company.update({ where: { id }, data });
  }

  updateLogoPath(id: string, logoPath: string): Promise<Company> {
    return this.prisma.company.update({ where: { id }, data: { logoPath } });
  }

  findShopsByCompany(companyId: string): Promise<Shop[]> {
    return this.prisma.shop.findMany({ where: { companyId } });
  }

  /** `companyId` obowiązkowy — bez niego administrator jednej firmy mógłby odczytać/edytować/dezaktywować placówkę innej firmy, znając samo UUID (IDOR, patrz audyt bezpieczeństwa). */
  findShopById(id: string, companyId: string): Promise<Shop | null> {
    return this.prisma.shop.findFirst({ where: { id, companyId } });
  }

  createShop(
    companyId: string,
    data: {
      name: string;
      address?: string;
      city?: string;
      postalCode?: string;
      phone?: string;
      email?: string;
    },
  ): Promise<Shop> {
    return this.prisma.shop.create({ data: { ...data, companyId } });
  }

  updateShop(
    id: string,
    data: Partial<
      Pick<Shop, 'name' | 'address' | 'city' | 'postalCode' | 'phone' | 'email' | 'active'>
    >,
  ): Promise<Shop> {
    return this.prisma.shop.update({ where: { id }, data });
  }
}
