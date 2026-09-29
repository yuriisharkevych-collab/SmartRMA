import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import {
  Company,
  NotificationChannel,
  NotificationRecipientType,
  OrganizationType,
  PartnershipStatus,
  Prisma,
} from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import {
  generatePartnerInviteToken,
  hashPartnerInviteToken,
} from '../../common/utils/partner-invite-token.util';
import { AuditRepository } from '../audit/audit.repository';
import { AuthService } from '../auth/auth.service';
import { PasswordService } from '../auth/services/password.service';
import { CaseStatusesService } from '../case-statuses/case-statuses.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersRepository } from '../users/users.repository';
import { AuthTokensEntity } from '../auth/entities/auth-tokens.entity';
import { AcceptPartnerInviteDto } from './dto/accept-partner-invite.dto';
import { InvitePartnerDto } from './dto/invite-partner.dto';
import { InvitePartnershipDto } from './dto/invite-partnership.dto';
import { RequestConnectionDto } from './dto/request-connection.dto';
import { SearchCompanyDto } from './dto/search-company.dto';
import { PartnerInviteInfoEntity } from './entities/partner-invite-info.entity';
import { PartnershipEntity } from './entities/partnership.entity';
import { SearchCompanyResultEntity } from './entities/search-company-result.entity';
import { PartnershipMapper, PartnershipWithRelations } from './mappers/partnership.mapper';
import { PartnershipsRepository } from './partnerships.repository';

/** Ważność linku zaproszenia partnera — wystarczająco długo, żeby dotrzeć do właściwej osoby w firmie (nie jest to jednorazowy kod OTP), krócej niż "bezterminowo" (stary, niewykorzystany link nie powinien wisieć wiecznie). */
const INVITE_TOKEN_TTL_DAYS = 14;

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
 *
 * Etap 5 dokłada DRUGI, RÓWNOLEGŁY sposób zawiązania partnerstwa
 * (`invitePartner`/`getInviteInfo`/`acceptPartnerInvite`) — Dystrybutor
 * zaprasza e-mailem firmę, która JESZCZE NIE ISTNIEJE w SmartRMA (w
 * przeciwieństwie do `invite()` powyżej, gdzie Sklep zna slug JUŻ
 * istniejącego Dystrybutora). Oba tryby zapisują się do TEGO SAMEGO modelu
 * `Partnership`/`PartnershipBrand` — świadoma decyzja właściciela, żeby nie
 * duplikować mechanizmu partnerstw.
 */
@Injectable()
export class PartnershipsService {
  constructor(
    private readonly partnershipsRepository: PartnershipsRepository,
    private readonly auditRepository: AuditRepository,
    private readonly caseStatusesService: CaseStatusesService,
    private readonly passwordService: PasswordService,
    private readonly usersRepository: UsersRepository,
    private readonly authService: AuthService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async findAllForCompany(companyId: string): Promise<PartnershipEntity[]> {
    const rows = await this.partnershipsRepository.findAllForCompany(companyId);
    return Promise.all(rows.map((row) => this.toEntityWithCaseCount(row)));
  }

  async findById(id: string, companyId: string): Promise<PartnershipEntity> {
    return this.toEntityWithCaseCount(await this.findRawOrThrow(id, companyId));
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

    return this.toEntityWithCaseCount(created);
  }

  // --- Etap 6 — "Połącz z istniejącą firmą" (symetryczne, obie strony) ---

  /**
   * `POST /partnerships/search-company` — WYŁĄCZNIE odczyt, zero efektów
   * ubocznych. Zwraca `null`, gdy nie znaleziono (200, nie 404 — "brak
   * wyniku" to normalny wynik wyszukiwania, nie błąd) ALBO gdy trafiono we
   * WŁASNĄ firmę (nie ma sensu "połączyć się" z samym sobą — patrz
   * `PARTNERSHIP_010` w `requestConnection`, tu po prostu chowamy wynik,
   * żeby UI od razu wiedziało "nic nie znaleziono", bez osobnego
   * komunikatu błędu na etapie SAMEGO wyszukiwania).
   *
   * Bezpieczeństwo tenantów (specyfikacja właściciela, punkt 9) — zwracany
   * kształt to WYŁĄCZNIE `SearchCompanyResultEntity`: nazwa, NIP, typ,
   * dwie flagi. Zero użytkowników/produktów/marek/reklamacji/ustawień/
   * adresu/e-maila/telefonu drugiej firmy.
   */
  async searchCompanyByNip(
    callerCompanyId: string,
    dto: SearchCompanyDto,
  ): Promise<SearchCompanyResultEntity | null> {
    const target = await this.partnershipsRepository.findCompanyByNip(dto.nip);
    if (!target || target.id === callerCompanyId) return null;

    const caller = await this.partnershipsRepository.findCompanyById(callerCompanyId);
    // `caller` zawsze istnieje (companyId z JWT zalogowanego użytkownika) — `!` bezpieczne.
    const pair = this.tryResolveShopDistributorPair(caller!, target);

    let alreadyConnected = false;
    let pendingRequest = false;
    if (pair) {
      const existing = await this.partnershipsRepository.findByCompanyPair(
        pair.shopCompanyId,
        pair.distributorCompanyId,
      );
      alreadyConnected = existing?.status === PartnershipStatus.Active;
      pendingRequest = existing?.status === PartnershipStatus.Invited;
    }

    return {
      id: target.id,
      name: target.name,
      nip: target.nip!,
      type: target.type,
      alreadyConnected,
      pendingRequest,
    };
  }

  /**
   * `POST /partnerships/request-connection` — druga połowa "Połącz z
   * istniejącą firmą". Weryfikuje WSZYSTKO od nowa (nie ufa, że klient
   * przesyła dokładnie to, co pokazał `searchCompanyByNip` chwilę wcześniej
   * — `targetCompanyId` to zwykły parametr sterowany przez klienta).
   *
   * Właściciel, punkt 6: NIE tworzymy `Company`, NIE tworzymy `User`, NIE
   * kopiujemy żadnych danych/marek drugiej firmy — WYŁĄCZNIE nowy albo
   * zresetowany wiersz `Partnership{status:Invited}`, bez `PartnershipBrand`
   * (patrz doc-comment `InvitePartnerDto` — marki nie są częścią tego
   * procesu). Druga strona musi jeszcze zaakceptować (`accept()` powyżej,
   * bez zmian — działa identycznie dla partnerstw z obu trybów, bo oba
   * zapisują się do TEGO SAMEGO modelu).
   */
  async requestConnection(
    callerCompanyId: string,
    actorUserId: string,
    dto: RequestConnectionDto,
  ): Promise<PartnershipEntity> {
    if (dto.targetCompanyId === callerCompanyId) {
      throw new AppException(
        ERROR_CODES.PARTNERSHIP_010.code,
        ERROR_CODES.PARTNERSHIP_010.message,
        ERROR_CODES.PARTNERSHIP_010.status,
      );
    }

    const [caller, target] = await Promise.all([
      this.partnershipsRepository.findCompanyById(callerCompanyId),
      this.partnershipsRepository.findCompanyById(dto.targetCompanyId),
    ]);
    // 404, nie PARTNERSHIP-001 — to NIE jest "zła para typów", to brak/
    // dezaktywacja celu (np. wyszukano chwilę temu, w międzyczasie
    // dezaktywowana, albo klient wysłał dowolne, niezweryfikowane UUID).
    if (!target || !target.active) {
      throw new NotFoundException();
    }
    const pair = this.tryResolveShopDistributorPair(caller!, target);
    if (!pair) {
      throw new AppException(
        ERROR_CODES.PARTNERSHIP_001.code,
        ERROR_CODES.PARTNERSHIP_001.message,
        ERROR_CODES.PARTNERSHIP_001.status,
      );
    }

    const existing = await this.partnershipsRepository.findByCompanyPair(
      pair.shopCompanyId,
      pair.distributorCompanyId,
    );
    if (existing?.status === PartnershipStatus.Active) {
      throw new AppException(
        ERROR_CODES.PARTNERSHIP_002.code,
        ERROR_CODES.PARTNERSHIP_002.message,
        ERROR_CODES.PARTNERSHIP_002.status,
      );
    }
    if (existing?.status === PartnershipStatus.Invited) {
      throw new AppException(
        ERROR_CODES.PARTNERSHIP_009.code,
        ERROR_CODES.PARTNERSHIP_009.message,
        ERROR_CODES.PARTNERSHIP_009.status,
      );
    }

    const created =
      existing?.status === PartnershipStatus.Rejected
        ? await this.partnershipsRepository.resetRejectedToInvited(existing.id, actorUserId)
        : await this.partnershipsRepository.createConnectionRequest(
            pair.shopCompanyId,
            pair.distributorCompanyId,
            actorUserId,
          );

    await this.auditRepository.create({
      companyId: callerCompanyId,
      userId: actorUserId,
      action:
        existing?.status === PartnershipStatus.Rejected
          ? 'PARTNERSHIP_CONNECTION_REQUESTED_AGAIN'
          : 'PARTNERSHIP_CONNECTION_REQUESTED',
      entityType: 'Partnership',
      entityId: created.id,
      newValue: { targetCompanyId: dto.targetCompanyId } as Prisma.InputJsonValue,
    });

    await this.notifyConnectionRequested(target, caller!.name);

    return this.toEntityWithCaseCount(created);
  }

  /**
   * Powiadamia drugą firmę e-mailem na jej OGÓLNY adres kontaktowy
   * (`Company.email`) — w przeciwieństwie do `invitePartner()` (gdzie
   * `adminEmail` jest jawnie podanym parametrem, bo firma jeszcze nie ma
   * żadnych użytkowników), tu firma docelowa JUŻ ISTNIEJE i ma własnych
   * pracowników, ale system nie ma dziś mechanizmu "wyślij do wszystkich
   * pracowników z uprawnieniem partnerships.manage" — świadome uproszczenie
   * zakresu tego etapu (do rozbudowy jako osobne zadanie, jeśli potrzebne).
   * Brak `Company.email` u celu = `NotificationsService` sam ustawi
   * `status=Failed` bez próby wysyłki (NOTIFICATIONS.md §8) — nie wywala się.
   */
  private async notifyConnectionRequested(target: Company, callerName: string): Promise<void> {
    await this.notificationsService.createNotificationFromTemplate({
      companyId: target.id,
      code: 'partnership.connection.requested',
      channel: NotificationChannel.Email,
      recipientType: NotificationRecipientType.Employee,
      recipientEmail: target.email ?? undefined,
      variables: { callerName, targetName: target.name },
    });
  }

  /**
   * Etap 6 — rozstrzyga role Sklep/Dystrybutor z PARY TYPÓW, nie z tego, kto
   * jest wołającym (w przeciwieństwie do starego `invite()` powyżej, gdzie
   * `companyId` wołającego to ZAWSZE Sklep). Dokładnie DWIE organizacje typu
   * `OrganizationType` dziś istnieją, więc jedyna poprawna para to jedna
   * `Shop` + jedna `ManufacturerDistributor` — w dowolnej kolejności
   * wołania. `null`, gdy para jest niezgodna (oba `Shop` albo oba
   * `ManufacturerDistributor`) — wołający decyduje, jak to zgłosić
   * (wyjątek vs. ciche `false` w wynikach wyszukiwania).
   */
  private tryResolveShopDistributorPair(
    a: Pick<Company, 'id' | 'type'>,
    b: Pick<Company, 'id' | 'type'>,
  ): { shopCompanyId: string; distributorCompanyId: string } | null {
    if (a.type === OrganizationType.Shop && b.type === OrganizationType.ManufacturerDistributor) {
      return { shopCompanyId: a.id, distributorCompanyId: b.id };
    }
    if (a.type === OrganizationType.ManufacturerDistributor && b.type === OrganizationType.Shop) {
      return { shopCompanyId: b.id, distributorCompanyId: a.id };
    }
    return null;
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

    return this.toEntityWithCaseCount(updated);
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

    return this.toEntityWithCaseCount(updated);
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

    return this.toEntityWithCaseCount(updated);
  }

  // --- Etap 5/6 — zaproszenie partnera e-mailem (symetryczne — obie strony) ---

  /**
   * Wołający zaprasza firmę, która JESZCZE NIE ISTNIEJE w SmartRMA. Zakłada
   * od razu: `Company` (typ PRZECIWNY do wołającego — Etap 6, symetria) +
   * siedzibę + własny prefiks numeracji + katalog statusów (dokładnie ten
   * sam komplet co `scripts/create-organization.ts`) + samoopisany
   * Contractor/Manufacturer/Brand, JEŚLI nowa firma jest Producentem/
   * Dystrybutorem (patrz `PartnershipsRepository.createPendingPartnerCompany`)
   * + `Partnership{status:Invited}` (BEZ `PartnershipBrand` — Etap 6,
   * decyzja właściciela: marki nie są częścią zapraszania, każda firma
   * zarządza własnymi) + wysyła e-mail z linkiem. Zaproszony sam zakłada
   * swoje konto poprzez `acceptPartnerInvite` — właściciel wprost zastrzegł,
   * że administrator SmartRMA nie ma ręcznie zakładać kont partnerów.
   */
  async invitePartner(
    callerCompanyId: string,
    actorUserId: string,
    dto: InvitePartnerDto,
  ): Promise<PartnershipEntity> {
    const existingInvite = await this.partnershipsRepository.findPendingOrActiveInviteByEmail(
      callerCompanyId,
      dto.adminEmail,
    );
    if (existingInvite) {
      throw new AppException(
        ERROR_CODES.PARTNERSHIP_008.code,
        ERROR_CODES.PARTNERSHIP_008.message,
        ERROR_CODES.PARTNERSHIP_008.status,
      );
    }

    const caller = await this.partnershipsRepository.findCompanyById(callerCompanyId);
    // Dokładnie dwa typy istnieją (`OrganizationType`) — nowa firma dostaje ten drugi.
    const newCompanyType =
      caller!.type === OrganizationType.Shop
        ? OrganizationType.ManufacturerDistributor
        : OrganizationType.Shop;

    const company = await this.partnershipsRepository.createPendingPartnerCompany(
      dto.companyName,
      dto.nip,
      newCompanyType,
    );
    await this.caseStatusesService.seedDefaultCatalog(company.id);

    const pair = this.tryResolveShopDistributorPair(caller!, {
      id: company.id,
      type: newCompanyType,
    })!;

    const token = generatePartnerInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    const created = await this.partnershipsRepository.createWithInviteToken(
      pair.shopCompanyId,
      pair.distributorCompanyId,
      actorUserId,
      dto.adminEmail,
      hashPartnerInviteToken(token),
      expiresAt,
    );

    await this.auditRepository.create({
      companyId: callerCompanyId,
      userId: actorUserId,
      action: 'PARTNERSHIP_PARTNER_INVITED',
      entityType: 'Partnership',
      entityId: created.id,
      newValue: {
        newCompanyId: company.id,
        inviteEmail: dto.adminEmail,
      } as Prisma.InputJsonValue,
    });

    const publicUrl = this.config.get<string>('publicUrl.url')!;
    const inviteUrl = `${publicUrl}/partner-invite/${token}`;
    await this.notificationsService.createNotificationFromTemplate({
      companyId: callerCompanyId,
      code: 'partnership.invited.partner',
      channel: NotificationChannel.Email,
      recipientType: NotificationRecipientType.Employee,
      recipientEmail: dto.adminEmail,
      variables: {
        companyName: dto.companyName,
        distributorName: caller!.name,
        // Etap 6 — marki nie są już częścią zaproszenia; placeholder zostaje
        // puste (szablon dawnego tekstu może jeszcze wspominać {{brandNames}}
        // na środowiskach zasianych PRZED tą zmianą — `renderTemplate` po
        // prostu wstawia pusty string zamiast listy, bez wyjątku).
        brandNames: '',
        inviteUrl,
      },
    });

    return this.toEntityWithCaseCount(created);
  }

  /** `GET /partnerships/invite/:token` — publiczny, pokazuje zaproszonemu KTO/DO CZEGO, zanim założy konto. */
  async getInviteInfo(token: string): Promise<PartnerInviteInfoEntity> {
    const partnership = await this.findValidInviteOrThrow(token);
    return {
      companyName: partnership.shopCompany.name,
      distributorName: partnership.distributorCompany.name,
      email: partnership.inviteEmail!,
      brandNames: partnership.brands.map((b) => b.brand.name),
    };
  }

  /** Zaproszony zakłada SWOJE konto (pierwszy Administrator nowej firmy) i od razu dostaje sesję — jeden krok zamiast "załóż konto, potem osobno się zaloguj". Akceptacja partnerstwa = fakt założenia konta, nie osobna czynność. */
  async acceptPartnerInvite(token: string, dto: AcceptPartnerInviteDto): Promise<AuthTokensEntity> {
    const partnership = await this.findValidInviteOrThrow(token);

    const passwordHash = await this.passwordService.hash(dto.password);
    await this.partnershipsRepository.createAdminUser(
      partnership.shopCompanyId,
      dto.firstName,
      dto.lastName,
      partnership.inviteEmail!,
      passwordHash,
    );
    await this.partnershipsRepository.activateFromInvite(partnership.id);

    await this.auditRepository.create({
      companyId: partnership.shopCompanyId,
      userId: null,
      action: 'PARTNERSHIP_INVITE_ACCEPTED',
      entityType: 'Partnership',
      entityId: partnership.id,
    });

    const userWithRoles = await this.usersRepository.findPasswordAccountByEmail(
      partnership.inviteEmail!,
    );
    return this.authService.login(userWithRoles!);
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

  /**
   * Etap 5 — `IntakeService.submitBrandComplaint` (ścieżka Partner) — zwraca
   * WYŁĄCZNIE markiId, które ten konkretny partner wolno mu obsługiwać u TEGO
   * dystrybutora (`PartnershipBrand`), żeby formularz publiczny mógł zawęzić
   * listę marek/produktów PRZED wysyłką (UX), a `assertActivePartnerCoversBrand`
   * niżej wymusił to samo po stronie serwera (obrona w głąb — klient mógłby
   * ominąć zawężenie w UI).
   */
  async findAllowedBrandIdsForPartner(
    distributorCompanyId: string,
    shopCompanyId: string,
  ): Promise<string[]> {
    const partnership = await this.partnershipsRepository.findByCompanyPair(
      shopCompanyId,
      distributorCompanyId,
    );
    if (!partnership || partnership.status !== PartnershipStatus.Active) return [];
    const full = await this.partnershipsRepository.findById(partnership.id, shopCompanyId);
    return full?.brands.map((b) => b.brandId) ?? [];
  }

  /** PARTNERSHIP-005 — ten sam kod co przy przekazaniu (`assertActiveForShopWithBrand`), bo semantycznie to DOKŁADNIE ten sam warunek: partnerstwo aktywne i obejmujące wskazaną markę, niezależnie od tego, KTÓRA ścieżka (formularz marki czy przekazanie pracownika) próbuje go użyć. */
  async assertActivePartnerCoversBrand(
    distributorCompanyId: string,
    shopCompanyId: string,
    brandId: string,
  ): Promise<void> {
    const allowed = await this.findAllowedBrandIdsForPartner(distributorCompanyId, shopCompanyId);
    if (!allowed.includes(brandId)) {
      throw new AppException(
        ERROR_CODES.PARTNERSHIP_005.code,
        ERROR_CODES.PARTNERSHIP_005.message,
        ERROR_CODES.PARTNERSHIP_005.status,
      );
    }
  }

  private async toEntityWithCaseCount(row: PartnershipWithRelations): Promise<PartnershipEntity> {
    const caseCount = await this.partnershipsRepository.countCasesForPartnership(
      row.shopCompanyId,
      row.distributorCompanyId,
    );
    return PartnershipMapper.toEntity(row, caseCount);
  }

  private async findValidInviteOrThrow(token: string): Promise<PartnershipWithRelations> {
    const partnership = await this.partnershipsRepository.findByInviteTokenHash(
      hashPartnerInviteToken(token),
    );
    if (
      !partnership ||
      partnership.status !== PartnershipStatus.Invited ||
      !partnership.inviteTokenExpiresAt ||
      partnership.inviteTokenExpiresAt.getTime() < Date.now()
    ) {
      throw new AppException(
        ERROR_CODES.PARTNERSHIP_007.code,
        ERROR_CODES.PARTNERSHIP_007.message,
        ERROR_CODES.PARTNERSHIP_007.status,
      );
    }
    return partnership;
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
