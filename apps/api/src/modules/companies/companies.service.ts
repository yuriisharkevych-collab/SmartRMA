import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationKind, OrganizationType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { deriveCaseNumberPrefix, slugify } from '../../common/utils/organization-slug.util';
import { generateAccountToken, hashAccountToken } from '../../common/utils/account-token.util';
import { AuditRepository } from '../audit/audit.repository';
import { PasswordService } from '../auth/services/password.service';
import { PrismaService } from '../../prisma/prisma.service';
import { IStorageService, STORAGE_SERVICE } from '../../storage/storage.interface';
import {
  CompanySignupCompletedPayload,
  CompanyUpdatedPayload,
  ShopCreatedPayload,
  ShopDeactivatedPayload,
  ShopUpdatedPayload,
} from '../../events/contracts/company.events';
import { DomainEvent } from '../../events/domain-event.base';
import { EVENT_BUS, IEventBus } from '../../events/event-bus.interface';
import { EVENT_NAMES } from '../../events/event-names.const';
import { CompaniesRepository } from './companies.repository';
import { CompanySignupDto } from './dto/company-signup.dto';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { CompanyEntity } from './entities/company.entity';
import { ShopEntity } from './entities/shop.entity';
import { SignupResultEntity } from './entities/signup-result.entity';
import { CompanyMapper } from './mappers/company.mapper';

const SHOP_AUDIT_FIELDS = ['name', 'address', 'city', 'postalCode', 'phone', 'email'] as const;

// Etap 6 — signup jest akcją ręczną, rzadką (nie "gorącym" zasobem jak numeracja
// spraw) — wystarczy PRZED-sprawdzenie kolizji sluga (ten sam wzorzec co
// `ContractorsService`/NIP, patrz jej doc-comment: "nie łapać P2002 na ślepo"),
// nie retry-po-P2002 jak `CasesService.createWithUniqueCaseNumber`. Limit
// istnieje wyłącznie jako twarda górna granica przeciw patologicznemu
// przypadkowi (setki firm o identycznej nazwie) — nie przeciw normalnemu ruchowi.
const SIGNUP_SLUG_MAX_ATTEMPTS = 30;

/** Etap 7 — analogiczny twardy limit dla kolizji `caseNumberPrefix` (patrz doc-comment `CompaniesRepository.caseNumberPrefixExists`). */
const SIGNUP_PREFIX_MAX_ATTEMPTS = 30;

/** Sufiks numeryczny doklejony do 4-znakowego prefiksu przy kolizji — `deriveCaseNumberPrefix` nie ma miejsca na sufiks w 4 znakach, więc kolejne próby są dłuższe (`TEXT`→`TEXT2`→`TEXT3`), co jest w porządku: `caseNumberPrefix` nie ma ograniczenia długości w bazie. */
function suffixedPrefix(base: string, attempt: number): string {
  return attempt === 0 ? base : `${base}${attempt + 1}`;
}

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
 * BR-086 (historyczne — MVP jednej firmy) dawno nieaktualne: multi-tenant
 * współistnieje od Etapów 1–5 (Partnerzy B2B, CaseHandoff). `listCompanies`/
 * `deactivateCompany`/`reactivateCompany` nadal nie istnieją (RBAC.md §2 zna
 * wyłącznie `company.manage` — edycja WŁASNEJ firmy, nie przegląd cudzych) —
 * ale **tworzenie** firmy od Etapu 6 JEST możliwe, publicznie, przez `signup()`
 * poniżej (`POST /companies/signup`) — jedyny wyjątek od "Company = seed".
 *
 * Brak kodów COMPANY-* / SHOP-* w ERROR_CODES.md dla pozostałych metod —
 * "nie znaleziono" rzuca gołym `NotFoundException()`, dokładnie jak
 * `DocumentsService.findById` (ten sam, już zaakceptowany brak, patrz raport
 * końcowy Zadania 12).
 */
@Injectable()
export class CompaniesService {
  constructor(
    private readonly companiesRepository: CompaniesRepository,
    private readonly auditRepository: AuditRepository,
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  /**
   * Onboarding samoobsługowy: NOWA firma "od zera", bez ręcznego SQL/Prisma/
   * skryptu developerskiego. Etap 6 ograniczał to do Producent/Dystrybutor i
   * logował od razu; Fundament „Fresh Install" rozszerza o `Shop`
   * (`dto.orgType`, patrz `CompanySignupDto`) i USUWA auto-login (breaking
   * change, wprost wymagany) — konto czeka na potwierdzenie e-maila przed
   * pierwszym logowaniem (AUTH-007, `AccountRecoveryService`).
   *
   * Bezpieczeństwo (wprost wymagane przez właściciela):
   *  - DTO nie przyjmuje `companyId`/`orgId`/`roleId` — `id` firmy i admina są
   *    generowane przez bazę, `ValidationPipe` (`forbidNonWhitelisted`) odrzuca
   *    każde dodatkowe pole 422 zanim dotrze tutaj;
   *  - hasło hashowane WYŁĄCZNIE przez `PasswordService` (bcrypt, jedyne
   *    miejsce w Auth, które go zna);
   *  - dokładnie JEDEN Administrator na wywołanie — rola systemowa
   *    (`SYSTEM_ROLE_CODES.ADMINISTRATOR`, `companyId:null`), TA SAMA co
   *    każdy inny bootstrap w tym repo, więc RBAC nowej firmy jest identyczne
   *    z każdą inną (`ALL_PERMISSION_CODES` minus `cases.decision.*`, seed.ts);
   *  - Company+CompanySettings+Shop+(samoopisany profil dla Producent/
   *    Dystrybutor)+katalog statusów+User+token weryfikacji w JEDNEJ
   *    `prisma.$transaction` — częściowy zapis (np. firma bez Administratora,
   *    albo Administrator bez tokenu) nie może przetrwać awarii w środku
   *    sekwencji;
   *  - izolacja tenantów jest strukturalna: nowa firma nie ma ŻADNEJ relacji
   *    do jakiejkolwiek istniejącej — wszystko poniżej to świeże `id`;
   *  - wysyłka e-maila weryfikacyjnego dzieje się PO commitcie transakcji
   *    (nie w jej środku — `MailService.sendPlatformEmail` nigdy nie rzuca,
   *    ale zewnętrzne wywołanie sieciowe nie powinno trzymać otwartej
   *    transakcji bazodanowej) — awaria wysyłki jest logowana przez
   *    `AccountRecoveryService`, ale NIE cofa już utworzonego konta (spójne z
   *    NOTIFICATION-002: konto istnieje, e-mail można wysłać ponownie przez
   *    `POST /auth/verify-email/resend`).
   */
  async signup(dto: CompanySignupDto): Promise<SignupResultEntity> {
    const emailTaken = await this.companiesRepository.passwordAccountEmailExists(dto.adminEmail);
    if (emailTaken) {
      throw new AppException(
        ERROR_CODES.USER_001.code,
        ERROR_CODES.USER_001.message,
        ERROR_CODES.USER_001.status,
      );
    }

    const type: OrganizationType = dto.orgType === 'Shop' ? 'Shop' : 'ManufacturerDistributor';
    const orgKind: OrganizationKind | null = dto.orgType === 'Shop' ? null : dto.orgType;

    const passwordHash = await this.passwordService.hash(dto.password);
    const verificationToken = generateAccountToken();
    const verificationTokenHash = hashAccountToken(verificationToken);
    const verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const baseSlug = slugify(dto.companyName);
    const baseCaseNumberPrefix = deriveCaseNumberPrefix(dto.companyName);

    let caseNumberPrefix: string | undefined;
    for (let attempt = 0; attempt < SIGNUP_PREFIX_MAX_ATTEMPTS; attempt += 1) {
      const candidate = suffixedPrefix(baseCaseNumberPrefix, attempt);
      if (await this.companiesRepository.caseNumberPrefixExists(candidate)) continue;
      caseNumberPrefix = candidate;
      break;
    }
    if (!caseNumberPrefix) {
      // Praktycznie nieosiągalne, ten sam twardy limit górny co przy slugu niżej.
      throw new AppException(
        ERROR_CODES.COMPANY_001.code,
        ERROR_CODES.COMPANY_001.message,
        ERROR_CODES.COMPANY_001.status,
      );
    }

    let companyId: string | undefined;
    let userId: string | undefined;
    for (let attempt = 0; attempt < SIGNUP_SLUG_MAX_ATTEMPTS; attempt += 1) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
      if (await this.companiesRepository.slugExists(slug)) continue;

      const result = await this.prisma.$transaction(async (tx) => {
        const company = await this.companiesRepository.createOrganizationShell(
          { name: dto.companyName, slug, type, orgKind, nip: dto.nip, caseNumberPrefix },
          tx,
        );
        const user = await this.companiesRepository.createFirstAdmin(
          company.id,
          {
            firstName: dto.adminFirstName,
            lastName: dto.adminLastName,
            email: dto.adminEmail,
            passwordHash,
            emailVerificationTokenHash: verificationTokenHash,
            emailVerificationTokenExpiresAt: verificationTokenExpiresAt,
          },
          tx,
        );
        return { company, user };
      });
      companyId = result.company.id;
      userId = result.user.id;
      break;
    }

    if (!companyId || !userId) {
      // Praktycznie nieosiągalne (30 kolejnych zajętych slugów pod rząd) —
      // twardy limit górny, nie oczekiwana ścieżka biznesowa.
      throw new AppException(
        ERROR_CODES.COMPANY_001.code,
        ERROR_CODES.COMPANY_001.message,
        ERROR_CODES.COMPANY_001.status,
      );
    }

    await this.auditRepository.create({
      companyId,
      userId,
      action: 'COMPANY_SIGNUP',
      entityType: 'Company',
      entityId: companyId,
      newValue: { companyName: dto.companyName, orgType: dto.orgType } as Prisma.InputJsonValue,
    });

    // Zdarzenie, nie wywołanie wprost `AccountRecoveryService` — patrz TODO
    // `event-names.const.ts` przy `COMPANY_SIGNUP_COMPLETED`: import
    // `AccountRecoveryModule` tutaj zamykał cykl modułów
    // (CompaniesModule → AccountRecoveryModule → MailModule → CompaniesModule),
    // na którym `NestFactory.create()` faktycznie się wieszał.
    await this.eventBus.publish(
      new DomainEvent<CompanySignupCompletedPayload>({
        eventName: EVENT_NAMES.COMPANY_SIGNUP_COMPLETED,
        companyId,
        aggregateType: 'Company',
        aggregateId: companyId,
        actorUserId: userId,
        correlationId: randomUUID(),
        payload: {
          email: dto.adminEmail,
          firstName: dto.adminFirstName,
          companyName: dto.companyName,
          verificationToken,
        },
      }),
    );

    return {
      message: 'Konto założone. Sprawdź skrzynkę e-mail, aby potwierdzić adres i aktywować konto.',
      email: dto.adminEmail,
    };
  }

  async findById(id: string): Promise<CompanyEntity> {
    const company = await this.findCompanyOrThrow(id);
    return CompanyMapper.toEntity(company);
  }

  /**
   * Portal Klienta — `id` pochodzi z `Case.companyId` już odczytanej przez token
   * portalu zweryfikowany JWT (`CasesRepository.findByIdTrusted`), nie z parametru
   * ścieżki sterowanego przez klienta — ten sam, ugruntowany wzorzec co
   * `CasesRepository.findByIdTrusted` dla `PortalService.getCaseOrThrow`.
   */
  async findByIdTrusted(id: string): Promise<CompanyEntity> {
    return this.findById(id);
  }

  /** Publiczny Formularz Reklamacyjny — rozstrzyga organizację po `slug` w adresie (`/reklamacja/:orgSlug`), patrz `CompaniesRepository.findBySlug`. */
  async findBySlug(slug: string): Promise<CompanyEntity> {
    const company = await this.companiesRepository.findBySlug(slug);
    if (!company) throw new NotFoundException();
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
  async findShopById(id: string, companyId: string): Promise<ShopEntity> {
    const shop = await this.findShopOrThrow(id, companyId);
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

  async updateShop(
    id: string,
    companyId: string,
    dto: UpdateShopDto,
    actorUserId: string,
  ): Promise<ShopEntity> {
    const before = await this.findShopOrThrow(id, companyId);
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
  async deactivateShop(id: string, companyId: string, actorUserId: string): Promise<ShopEntity> {
    const before = await this.findShopOrThrow(id, companyId);
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

  /**
   * `company.manage`. Logo trafia na dysk pod stałym "caseId"=`logo`
   * (`IStorageService.save` jest zapisany pod kątem załączników spraw, ale
   * ścieżka `{companyId}/{caseId}/...` jest ogólna — nie ma potrzeby
   * rozszerzać interfejsu portu o osobną metodę). Nadpisanie logo NIE
   * usuwa starego pliku z dysku (MVP — sprzątanie osieroconych plików to
   * przyszły etap, tak jak w `DocumentsService` przy `markInvalid`).
   */
  async uploadLogo(
    companyId: string,
    file: Express.Multer.File,
    actorUserId: string,
  ): Promise<CompanyEntity> {
    await this.findCompanyOrThrow(companyId);
    const stored = await this.storageService.save(companyId, 'logo', file);
    const updated = await this.companiesRepository.updateLogoPath(companyId, stored.storagePath);

    await this.auditRepository.create({
      companyId,
      userId: actorUserId,
      action: 'COMPANY_LOGO_UPDATED',
      entityType: 'Company',
      entityId: companyId,
      newValue: { fileName: stored.fileName, fileSize: stored.fileSize } as Prisma.InputJsonValue,
    });

    return CompanyMapper.toEntity(updated);
  }

  /** `GET /companies/:id/logo` — publiczny (wydruki/portal klienta), patrz kontroler. Rzuca `NotFoundException`, gdy firma nie ma jeszcze wgranego logo. */
  async getLogoBuffer(companyId: string): Promise<{ buffer: Buffer; storagePath: string }> {
    const company = await this.findCompanyOrThrow(companyId);
    if (!company.logoPath) throw new NotFoundException();
    return {
      buffer: await this.storageService.read(company.logoPath),
      storagePath: company.logoPath,
    };
  }

  private async findCompanyOrThrow(id: string) {
    const company = await this.companiesRepository.findById(id);
    if (!company) throw new NotFoundException();
    return company;
  }

  private async findShopOrThrow(id: string, companyId: string) {
    const shop = await this.companiesRepository.findShopById(id, companyId);
    if (!shop) throw new NotFoundException();
    return shop;
  }
}
