import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import {
  CaseHistoryAction,
  CaseOriginType,
  ComplaintType,
  DecisionFulfillmentMethod,
  DocumentCategory,
  DocumentStatus,
  Decision,
  MessageChannel,
  MessageDirection,
  NotificationChannel,
  NotificationRecipientType,
  Prisma,
  SenderType,
  SubmissionMode,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import {
  generatePortalAccessCode,
  generatePortalSecureToken,
} from '../../common/utils/portal-credentials.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditRepository } from '../audit/audit.repository';
import { CaseStatusesService } from '../case-statuses/case-statuses.service';
import { CompaniesService } from '../companies/companies.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { formatCaseNumber } from '../company-settings/case-numbering.util';
import { ContractorsService } from '../contractors/contractors.service';
import { PartnershipsService } from '../partnerships/partnerships.service';
import { CustomersService } from '../customers/customers.service';
import { DocumentsRepository } from '../documents/documents.repository';
import { ManufacturersService } from '../manufacturers/manufacturers.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CaseCreatedPayload,
  CaseDecisionSetPayload,
  CaseInfoRequestedPayload,
  CaseMessageAddedPayload,
  CaseNoteAddedPayload,
  CaseOwnerChangedPayload,
  CaseStatusChangedPayload,
  CaseUpdatedPayload,
} from '../../events/contracts/case.events';
import { DomainEvent } from '../../events/domain-event.base';
import { EVENT_BUS, IEventBus } from '../../events/event-bus.interface';
import { EVENT_NAMES } from '../../events/event-names.const';
import { OrdersService } from '../orders/orders.service';
import { ProductsService } from '../products/products.service';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { UsersService } from '../users/users.service';
import { CaseHistoryRepository } from './case-history.repository';
import { computeCaseAttention } from './case-attention.util';
import { CaseConsentRepository } from './case-consent.repository';
import { CaseItemsRepository } from './case-items.repository';
import { CasesRepository } from './cases.repository';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { UpdateCaseItemDto } from './dto/update-case-item.dto';
import {
  CaseCompletenessEntity,
  CaseCompletenessItemEntity,
} from './entities/case-completeness.entity';
import { CaseHistoryEntity } from './entities/case-history.entity';
import { CaseEntity } from './entities/case.entity';
import { MessageEntity } from './entities/message.entity';
import { NoteEntity } from './entities/note.entity';
import { PortalCredentialEntity } from './entities/portal-credential.entity';
import { CaseMapper, CaseWithItems } from './mappers/case.mapper';
import { MessagesRepository } from './messages.repository';
import { NotesRepository } from './notes.repository';

const BCRYPT_ROUNDS = 10;
const CASE_NUMBER_MAX_ATTEMPTS = 3;

/**
 * Status Workflow Refactor — jedyny kod z katalogu 9 domyślnych statusów, do
 * którego serwis odwołuje się WPROST (nie przez metadane wiersza), bo
 * `cancel()` musi wiedzieć, DOKĄD przejść. Ten kod jest identyczny dla
 * każdej firmy (seedowany przez `case-statuses` w `Checkpoint 1`, `isSystem:true`,
 * `code` niezmienny) — bezpieczne założenie, dopóki nikt nie usunie/przemianuje
 * wiersza systemowego (co dziś nie jest w ogóle możliwe z poziomu API).
 */
const WELL_KNOWN_STATUS_CODES = { ZAKONCZONA: 'Zakonczona' } as const;

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}

/** Tylko pola faktycznie przesłane w `patch` i różne od `before` — wzorzec z `CompaniesService` (pola `Case.update` są proste stringi/enum, bez Date/Decimal). */
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
 * Serce systemu (Zadanie 16, MVP + poprawki po code review). Świadomie POZA
 * zakresem:
 *  - CASE-002/004/005/006/FILE-00x (kompletność dokumentacji) — wymaga
 *    integracji z Documents i `Manufacturer.requiresXxx`.
 *  - Warunek `Logistics(...).status=Delivered` dla
 *    `OczekiwanieNaKuriera→WyslanaDoProducenta` — wymaga modułu Logistics.
 *  - `Notification` (wysyłka) — osobny moduł.
 *  - Portal Klienta (enable/disable/secure-link) i Replacement/Logistics —
 *    NIE podniesione do standardu Audit/CaseHistory/Events/transakcji (nie
 *    są wśród zamówionych repozytoriów/metod/zdarzeń).
 *
 * ATOMOWOŚĆ (poprawka po code review): każda mutacja wykonuje zapis
 * `Case`/`Note`/`Message` + `CaseHistory` + `AuditLog` w JEDNEJ
 * `prisma.$transaction`, zgodnie z EVENTS.md §1.2/§6.1 — zdarzenie domenowe
 * publikowane jest DOPIERO po zatwierdzeniu transakcji, nigdy w jej wnętrzu.
 * `performTransition`/`setDecision` DODATKOWO blokują wiersz `Case`
 * (`SELECT ... FOR UPDATE`, `CasesRepository.findByIdForUpdate`) na czas
 * transakcji — dwie równoczesne próby zmiany statusu/decyzji tej samej
 * sprawy serializują się na poziomie bazy zamiast obie operować na tym
 * samym, już nieaktualnym odczycie stanu.
 */
@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly casesRepository: CasesRepository,
    private readonly caseStatusesService: CaseStatusesService,
    private readonly caseHistoryRepository: CaseHistoryRepository,
    private readonly notesRepository: NotesRepository,
    private readonly messagesRepository: MessagesRepository,
    private readonly auditRepository: AuditRepository,
    private readonly customersService: CustomersService,
    private readonly companiesService: CompaniesService,
    private readonly productsService: ProductsService,
    private readonly ordersService: OrdersService,
    private readonly usersService: UsersService,
    private readonly manufacturersService: ManufacturersService,
    private readonly companySettingsService: CompanySettingsService,
    private readonly contractorsService: ContractorsService,
    private readonly partnershipsService: PartnershipsService,
    private readonly caseItemsRepository: CaseItemsRepository,
    private readonly caseConsentRepository: CaseConsentRepository,
    /** Tylko odczyt załączników dla CASE-002 — patrz `assertRequiredDocuments`. */
    @Inject(forwardRef(() => DocumentsRepository))
    private readonly documentsRepository: DocumentsRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    /** Moduł e-mail — `enablePortal` woła bezpośrednio (jednorazowy kod dostępu), patrz doc-comment `NotificationsService.createNotificationFromTemplate`. */
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async findAllForCompany(companyId: string): Promise<CaseEntity[]> {
    return this.attachAttention(
      companyId,
      CaseMapper.toEntityList(await this.casesRepository.findAllForCompany(companyId)),
    );
  }

  async search(companyId: string, query: string): Promise<CaseEntity[]> {
    return this.attachAttention(
      companyId,
      CaseMapper.toEntityList(await this.casesRepository.search(companyId, query)),
    );
  }

  async findById(id: string, companyId: string): Promise<CaseEntity> {
    const [entity] = await this.attachAttention(companyId, [
      CaseMapper.toEntity(await this.findCaseOrThrow(id, companyId)),
    ]);
    return entity;
  }

  /**
   * Przypomnienia o reakcji — dolicza `needsAttention`/`attentionReasons` PO
   * zmapowaniu (mapper nie zna ustawień firmy/producenta, patrz komentarz w
   * `CaseMapper.toEntity`). Trzy zapytania NIEZALEŻNE od liczby spraw (katalog
   * statusów, ustawienia firmy, nadpisania SLA producentów użytych w tej
   * liście) — bez N+1 per sprawę.
   */
  private async attachAttention(companyId: string, entities: CaseEntity[]): Promise<CaseEntity[]> {
    if (entities.length === 0) return entities;

    const [statusDefs, companyDefaults] = await Promise.all([
      this.caseStatusesService.findAllForCompany(companyId),
      this.companySettingsService.getSettings(companyId),
    ]);
    const isFinalByCode = new Map(statusDefs.map((s) => [s.code, s.isFinal]));

    // Etap 3 — nadpisanie progu "przypomnienia o reakcji" na poziomie marki, jeśli
    // ustawione, inaczej próg producenta — jeden resolver, patrz `requirements-resolver.ts`.
    const resolveSla = await this.manufacturersService.resolveAttentionOverridesResolver(
      entities.map((e) => ({
        manufacturerId: e.items[0]?.manufacturerId ?? null,
        brandId: e.items[0]?.brandId ?? null,
      })),
      companyId,
    );

    const now = new Date();
    for (const entity of entities) {
      const result = computeCaseAttention({
        isFinal: isFinalByCode.get(entity.status) ?? false,
        statusChangedAt: entity.statusChangedAt,
        createdAt: entity.createdAt,
        companyDefaults: {
          defaultStatusStaleDays: companyDefaults.defaultStatusStaleDays,
          defaultCaseAgeStaleDays: companyDefaults.defaultCaseAgeStaleDays,
        },
        manufacturerOverrides: resolveSla({
          manufacturerId: entity.items[0]?.manufacturerId ?? null,
          brandId: entity.items[0]?.brandId ?? null,
        }),
        now,
      });
      entity.needsAttention = result.needsAttention;
      entity.attentionReasons = result.reasons;
    }

    await this.attachWaitingForCustomer(companyId, entities, isFinalByCode);
    return entities;
  }

  /**
   * Etap 2 (Dashboard Producenta/Dystrybutora) — kafelek "Oczekujące na klienta".
   * NIE ma dedykowanego statusu do tego (Status Workflow Refactor świadomie
   * usunął "OczekiwanieNaKlienta" — patrz doc-comment `requestInfo`), więc
   * sygnał budujemy z dwóch REALNYCH, już istniejących faktów: (1) pracownik
   * FAKTYCZNIE poprosił o uzupełnienie (`CaseHistoryAction.InfoRequested`
   * kiedykolwiek na tej sprawie) i (2) sprawa NADAL ma niespełnione wymagania
   * (`getCompleteness` — te same, co zakładka "Uzupełnij" w Portalu Klienta).
   * Samo "niekompletna" NIE wystarczy — każda świeżo zgłoszona sprawa jest
   * niekompletna, zanim ktokolwiek ją obejrzy, więc bez warunku (1) ten
   * kafelek myliłby się z "Nowe". Dotyczy WYŁĄCZNIE B2C (`DirectCustomer`,
   * bez partnera) — B2B ma własny, ręcznie ustawiany status
   * `OczekiwanieNaPartnera`, bo tu nie ma odpowiednika "wymagań".
   *
   * Celowo małe zapytanie w pętli (`getCompleteness` per kandydat) — zbiór
   * kandydatów jest z definicji wąski (aktywna sprawa B2C, która MIAŁA
   * info-request), przy wolumenach tego produktu to pojedyncze sprawy, nie
   * setki — patrz podobne świadome uproszczenie w `DashboardService.
   * countCasesNeedingAttention`.
   */
  private async attachWaitingForCustomer(
    companyId: string,
    entities: CaseEntity[],
    isFinalByCode: Map<string, boolean>,
  ): Promise<void> {
    const candidates = entities.filter(
      (e) =>
        e.originType === CaseOriginType.DirectCustomer &&
        !e.reportedByPartnerCompanyId &&
        !(isFinalByCode.get(e.status) ?? false),
    );
    if (candidates.length === 0) return;

    const withInfoRequest = await this.caseHistoryRepository.findCaseIdsWithAction(
      candidates.map((c) => c.id),
      CaseHistoryAction.InfoRequested,
    );
    if (withInfoRequest.size === 0) return;

    for (const entity of candidates) {
      if (!withInfoRequest.has(entity.id)) continue;
      const completeness = await this.getCompleteness(entity.id, companyId);
      entity.waitingForCustomer = !completeness.complete;
    }
  }

  /**
   * `cases.delete` (RBAC.md §5) — TRWAŁE usunięcie sprawy, jedyny hard-delete
   * w całej aplikacji (każda inna encja jest wyłącznie dezaktywowana/
   * anulowana, nigdy skasowana). Świadomy wyjątek na wyraźne żądanie
   * właściciela produktu — do czyszczenia spraw testowych z panelu admina,
   * nie do obsługi realnych reklamacji klientów. Uprawnienie już istniało w
   * katalogu (`ALL_PERMISSION_CODES`, przypisane Administratorowi), ale nie
   * miało dotąd żadnej implementacji.
   *
   * Kasuje w JEDNEJ transakcji, przez metody `deleteAllForCase` odpowiednich
   * repozytoriów (nigdy `tx.model.*` bezpośrednio z serwisu — konwencja
   * "żadnych bezpośrednich wywołań Prisma poza repozytorium", patrz
   * `AuditRepository`), w kolejności zależności FK (dzieci przed rodzicem):
   * `ReplacementProduct`+`CaseItem` (`CaseItemsRepository`), `Document`
   * (musi być PRZED `Message` — `Document.messageId` → `Message`, odwrócone
   * względem poprzedniej wersji 1:1, patrz komentarz w schemacie), `Message`,
   * `Notification.relatedCaseId`, `CaseHistory`, `Note`,
   * `Logistics`, `CaseConsent`, na końcu `Case`. Wpis w `AuditLog` PRZED
   * skasowaniem — `entityId` w tej tabeli to zwykły string (nie FK), więc
   * ślad audytu przeżywa skasowanie sprawy, którego dotyczy (jedyny dowód,
   * że sprawa w ogóle istniała). Świadomie NIE usuwa plików `Document` z
   * dysku (`IStorageService` nie ma metody `delete` — nigdzie w aplikacji
   * nie istniała, poza zakresem tej zmiany).
   */
  async hardDelete(id: string, companyId: string, actorUserId: string): Promise<void> {
    const caseRecord = await this.casesRepository.findById(id, companyId);
    if (!caseRecord) throw new NotFoundException();

    await this.prisma.$transaction(async (tx) => {
      await this.documentsRepository.deleteAllForCase(id, tx);
      await this.messagesRepository.deleteAllForCase(id, tx);
      await this.notificationsService.deleteAllForCase(id, tx);
      await this.caseHistoryRepository.deleteAllForCase(id, tx);
      await this.notesRepository.deleteAllForCase(id, tx);
      await this.casesRepository.deleteLogisticsForCase(id, tx);
      await this.caseConsentRepository.deleteAllForCase(id, tx);
      await this.caseItemsRepository.deleteAllForCase(id, tx);

      await this.auditRepository.create(
        {
          companyId,
          userId: actorUserId,
          action: 'CASE_DELETED',
          entityType: 'Case',
          entityId: id,
          previousValue: {
            caseNumber: caseRecord.caseNumber,
            status: caseRecord.status,
            customerId: caseRecord.customerId,
          } as Prisma.InputJsonValue,
        },
        tx,
      );

      await this.casesRepository.hardDelete(id, tx);
    });
  }

  /**
   * BR-097/CASE-007, BR-105 (opis/rozwiązanie wymagane poza ścieżką
   * monitorowaną), walidacja referencji (Customer/Shop/Product/OrderItem/
   * ownerId — Company z JWT, Order tylko pośrednio przez OrderItem),
   * CASE-013 (retry numeru). Zapis Case+CaseItem+CaseHistory+AuditLog w
   * jednej transakcji (retry obejmuje całą transakcję, bo `@unique` na
   * `caseNumber` odkrywa się dopiero przy insert).
   */
  /** `actorUserId: string | null` — `null` = brak pracownika-inicjatora (Publiczny Formularz Reklamacyjny: klient zakłada sprawę samodzielnie, bez sesji pracownika). */
  async create(
    companyId: string,
    dto: CreateCaseDto,
    actorUserId: string | null,
  ): Promise<CaseEntity> {
    const submissionMode = dto.submissionMode ?? SubmissionMode.PrzezSklep;

    if (
      submissionMode === SubmissionMode.BezposrednioDoProducenta &&
      dto.complaintType !== ComplaintType.Warranty
    ) {
      throw new AppException(
        ERROR_CODES.CASE_007.code,
        ERROR_CODES.CASE_007.message,
        ERROR_CODES.CASE_007.status,
      );
    }

    // WORKFLOW.md §3.2 — ścieżka monitorowana: description/requestedResolution pozostają NULL (producent zbiera je bezpośrednio), nawet jeśli klient je podał.
    const isMinimalMonitoredCase = submissionMode === SubmissionMode.BezposrednioDoProducenta;
    if (!isMinimalMonitoredCase) {
      if (!dto.description?.trim()) {
        throw new AppException(
          ERROR_CODES.VALIDATION_001.code,
          ERROR_CODES.VALIDATION_001.message,
          ERROR_CODES.VALIDATION_001.status,
          { field: 'description' },
        );
      }
      if (!dto.requestedResolution?.trim()) {
        throw new AppException(
          ERROR_CODES.VALIDATION_001.code,
          ERROR_CODES.VALIDATION_001.message,
          ERROR_CODES.VALIDATION_001.status,
          { field: 'requestedResolution' },
        );
      }
    }

    // Każda referencja (klient/sklep/opiekun/produkt/zamówienie/producent) MUSI
    // należeć do TEJ SAMEJ firmy co tworzona sprawa — bez `companyId` tutaj sprawa
    // mogłaby powiązać dane innej firmy (IDOR na poziomie linkowania rekordów,
    // patrz audyt bezpieczeństwa, raport gotowości 1.0).
    await this.customersService.findById(dto.customerId, companyId);
    if (dto.shopId) await this.companiesService.findShopById(dto.shopId, companyId);
    if (dto.ownerId) await this.usersService.findById(dto.ownerId, companyId);
    if (dto.reportedByContractorId)
      await this.contractorsService.findById(dto.reportedByContractorId, companyId);
    if (dto.reportedByPartnerCompanyId) {
      await this.partnershipsService.assertActiveShopPartner(
        companyId,
        dto.reportedByPartnerCompanyId,
      );
    }

    // Rozwiązanie pozycji katalogu PRZED zapisem — `productId` istniejący od razu, `productName`
    // szuka dopasowania po nazwie+producencie albo tworzy nowy `Product` TUTAJ (serwis, nie
    // kontroler `POST /products`), więc `products.manage` nie jest wymagane. Rejestracja nowego
    // modelu jest nieodłącznym efektem ubocznym zgłoszenia reklamacji (pracownik ma `cases.create`),
    // nie samodzielnym zarządzaniem katalogiem — wcześniej frontend wołał `POST /products`
    // bezpośrednio, więc Pracownik (ma `cases.create`, celowo NIE ma `products.manage`, RBAC.md §3)
    // dostawał RBAC-001 przy każdej reklamacji na model spoza katalogu — patrz UAT.
    const resolvedItemIds = new Map<number, string>();
    for (const [index, item] of dto.items.entries()) {
      // `actorUserId!` — bezpieczne: `productName` (bez `productId`) to WYŁĄCZNIE ścieżka
      // pracownika z `CasesController` (`user.userId`, nigdy null); `IntakeService` (jedyny
      // wołający z `actorUserId=null`) rozwiązuje `productId` SAM, PRZED wywołaniem `create()`.
      const product = await this.resolveItemProduct(companyId, actorUserId!, item);
      resolvedItemIds.set(index, product.id);
      if (item.orderItemId) await this.ordersService.findOrderItemById(item.orderItemId, companyId);
      // CASE-004/005/006 — wymagania KONKRETNEGO producenta tej pozycji.
      // `manufacturerId` z DTO ma pierwszeństwo (pracownik mógł nadpisać sugestię, BR-072),
      // w przeciwnym razie producent wynika z pozycji katalogu.
      await this.assertManufacturerRequirements(
        item.manufacturerId ?? product.manufacturerId,
        companyId,
        item,
        product.brandId,
      );
    }

    // Status Workflow Refactor — status/nextAction początkowe pochodzą z
    // katalogu firmy (`isDefaultForNew:true`, seedowane jako "Nowa"), nie z
    // hardcodowanego enuma. Brak takiego wiersza jest błędem konfiguracji
    // firmy (katalog powinien zawsze mieć dokładnie jeden domyślny status),
    // nie czymś, co pracownik mógłby naprawić — stąd generyczny 500, nie
    // dedykowany kod błędu.
    const defaultStatus = (await this.caseStatusesService.findActiveForCompany(companyId)).find(
      (s) => s.isDefaultForNew,
    );
    if (!defaultStatus) {
      throw new Error(
        `Firma ${companyId} nie ma skonfigurowanego domyślnego statusu dla nowych spraw.`,
      );
    }

    const { caseRecord, historyEntry } = await this.createWithUniqueCaseNumber(
      companyId,
      {
        status: defaultStatus.code,
        shopId: dto.shopId ?? null,
        customerId: dto.customerId,
        ownerId: dto.ownerId ?? null,
        complaintType: dto.complaintType,
        submissionMode,
        source: dto.source,
        requestedResolution: isMinimalMonitoredCase ? null : (dto.requestedResolution ?? null),
        description: isMinimalMonitoredCase ? null : (dto.description ?? null),
        customerStatement: dto.customerStatement,
        deliveryAddress: dto.deliveryAddress,
        courierRequested: dto.courierRequested,
        preparationFeeAccepted: dto.preparationFeeAccepted,
        clientPortalEnabled: dto.clientPortalEnabled,
        nextAction: defaultStatus.defaultNextAction,
        reportedByContractorId: dto.reportedByContractorId ?? null,
        reportedByPartnerCompanyId: dto.reportedByPartnerCompanyId ?? null,
        contactPreference: dto.contactPreference ?? null,
        notificationSenderName: dto.notificationSenderName ?? null,
        // `purchaseDate` przychodzi jako string ISO (`@IsDateString`) — Prisma oczekuje `Date`.
        // `productId` zawsze rozwiązany wyżej (istniejący albo nowo utworzony) — `resolvedItemIds`.
        // Jawne wymienienie pól (nie `...item`) — `CreateCaseItemDto` niesie też `productName`/
        // `brandId`, które `CasesRepository.create` (Prisma `CaseItemCreateWithoutCaseInput`)
        // by odrzucił jako nieznane argumenty.
        items: dto.items.map((item, index) => ({
          orderItemId: item.orderItemId,
          productId: resolvedItemIds.get(index)!,
          manufacturerId: item.manufacturerId,
          description: item.description,
          serialNumber: item.serialNumber,
          frameNumber: item.frameNumber,
          purchaseProofNumber: item.purchaseProofNumber,
          purchaseDate: item.purchaseDate ? new Date(item.purchaseDate) : null,
        })),
      },
      actorUserId,
    );

    await this.eventBus.publish(
      new DomainEvent<CaseCreatedPayload>({
        eventName: EVENT_NAMES.CASE_CREATED,
        companyId,
        aggregateType: 'Case',
        aggregateId: caseRecord.id,
        actorUserId,
        correlationId: randomUUID(),
        payload: {
          caseNumber: caseRecord.caseNumber,
          complaintType: caseRecord.complaintType,
          submissionMode: caseRecord.submissionMode,
          source: caseRecord.source,
          customerId: caseRecord.customerId,
          ownerId: caseRecord.ownerId,
          itemCount: caseRecord.items.length,
          caseHistoryId: historyEntry.id,
        },
      }),
    );

    return CaseMapper.toEntity(caseRecord);
  }

  /**
   * `cases.edit` — pola opisowe (WORKFLOW.md §8, nie status/decyzja). CASE-008
   * jeśli sprawa w statusie końcowym. CASE-014 dla `complaintType`: pole
   * decyduje o gałęzi automatu stanów przy wyjściu z `Weryfikacja`
   * (`complaintType=Warranty`→`GotowaDoWysylki`,
   * `complaintType=StatutoryWarranty`→`WeryfikacjaWewnetrzna`,
   * `case-status.rules.ts`) — zmiana dozwolona wyłącznie, dopóki ta gałąź
   * jeszcze nie zapadła (Nowa/Przyjeta/Weryfikacja/OczekiwanieNaKlienta).
   * Formularz publiczny nie pyta o to klienta — pracownik ustawia tu
   * podczas weryfikacji.
   */
  async update(
    id: string,
    companyId: string,
    dto: UpdateCaseDto,
    actorUserId: string,
  ): Promise<CaseEntity> {
    const { updated, changedFields } = await this.withLockedCase(
      id,
      companyId,
      async (tx, before) => {
        await this.assertCaseIsActive(before, companyId);

        if (dto.complaintType !== undefined && dto.complaintType !== before.complaintType) {
          // Status Workflow Refactor — dawne 4 nazwy statusów "przed rozgałęzieniem"
          // (Nowa/Przyjeta/Weryfikacja/OczekiwanieNaKlienta) zastąpione progiem `order<=2`
          // (Nowa/Przyjęta) w nowym, 9-statusowym katalogu — ten sam zamysł: rodzaj
          // zgłoszenia edytowalny tylko, dopóki sprawa nie ruszyła dalej w proces.
          const currentStatusDef = await this.caseStatusesService.findActiveByCode(
            before.status,
            companyId,
          );
          if (!currentStatusDef || currentStatusDef.order > 2) {
            throw new AppException(
              ERROR_CODES.CASE_014.code,
              ERROR_CODES.CASE_014.message,
              ERROR_CODES.CASE_014.status,
            );
          }
        }

        const updated = await this.casesRepository.update(id, dto, tx);
        const changedFields = diffChangedFields(before, dto);

        if (changedFields.includes('priority')) {
          await this.caseHistoryRepository.addEntry(
            id,
            {
              userId: actorUserId,
              action: CaseHistoryAction.PriorityChanged,
              previousValue: before.priority,
              newValue: updated.priority,
              visibleForCustomer: false,
            },
            tx,
          );
        }

        if (changedFields.length > 0) {
          await this.auditRepository.create(
            {
              companyId: before.companyId,
              userId: actorUserId,
              action: 'CASE_UPDATED',
              entityType: 'Case',
              entityId: id,
              previousValue: pick(before, changedFields),
              newValue: pick(updated, changedFields),
            },
            tx,
          );
        }

        return { updated, changedFields };
      },
    );

    if (changedFields.length > 0) {
      await this.eventBus.publish(
        new DomainEvent<CaseUpdatedPayload>({
          eventName: EVENT_NAMES.CASE_UPDATED,
          companyId: updated.companyId,
          aggregateType: 'Case',
          aggregateId: id,
          actorUserId,
          correlationId: randomUUID(),
          payload: { changedFields },
        }),
      );
    }

    return CaseMapper.toEntity(updated);
  }

  /**
   * `cases.edit` — poprawa danych POJEDYNCZEJ pozycji po utworzeniu sprawy
   * (BR-072/BR-074). `UpdateCaseDto` (`update()` powyżej) obejmuje wyłącznie
   * pola opisowe całej sprawy — pracownik nie miał dotąd ŻADNEJ drogi
   * poprawienia błędnie wpisanego modelu/producenta/numeru seryjnego/ramy po
   * zapisaniu sprawy. CASE-008 jeśli sprawa w statusie końcowym (ta sama
   * reguła co `update()`) — trzeba ją najpierw cofnąć ze statusu końcowego.
   * CASE-004/005/006 sprawdzane ponownie WYŁĄCZNIE gdy pracownik faktycznie
   * dotyka pól, których dotyczą — nie blokuje niezwiązanych edycji starych
   * spraw, które mogłyby nie spełniać wymagań dopisanych producentowi później.
   */
  async updateItem(
    caseId: string,
    itemId: string,
    companyId: string,
    dto: UpdateCaseItemDto,
    actorUserId: string,
  ): Promise<CaseEntity> {
    await this.withLockedCase(caseId, companyId, async (tx, before) => {
      await this.assertCaseIsActive(before, companyId);

      const item = before.items.find((i) => i.id === itemId);
      if (!item) {
        throw new AppException(
          ERROR_CODES.CASE_012.code,
          ERROR_CODES.CASE_012.message,
          ERROR_CODES.CASE_012.status,
        );
      }

      const touchesProduct = dto.productId !== undefined || dto.productName !== undefined;
      const resolvedManufacturerId =
        dto.manufacturerId !== undefined ? dto.manufacturerId : item.manufacturerId;

      let productId = item.productId;
      let resolvedBrandId = item.product?.brandId ?? null;
      if (touchesProduct) {
        const product = await this.resolveItemProduct(companyId, actorUserId, {
          productId: dto.productId,
          productName: dto.productName,
          manufacturerId: resolvedManufacturerId ?? undefined,
          brandId: dto.brandId,
        });
        productId = product.id;
        resolvedBrandId = product.brandId;
      }

      const touchesRequirementFields =
        touchesProduct ||
        dto.manufacturerId !== undefined ||
        dto.serialNumber !== undefined ||
        dto.frameNumber !== undefined ||
        dto.purchaseProofNumber !== undefined;

      if (touchesRequirementFields) {
        await this.assertManufacturerRequirements(
          resolvedManufacturerId,
          companyId,
          {
            serialNumber:
              (dto.serialNumber !== undefined ? dto.serialNumber : item.serialNumber) ?? undefined,
            frameNumber:
              (dto.frameNumber !== undefined ? dto.frameNumber : item.frameNumber) ?? undefined,
            purchaseProofNumber:
              (dto.purchaseProofNumber !== undefined
                ? dto.purchaseProofNumber
                : item.purchaseProofNumber) ?? undefined,
          },
          resolvedBrandId,
        );
      }

      const data: Partial<{
        productId: string;
        manufacturerId: string | null;
        description: string;
        serialNumber: string | null;
        frameNumber: string | null;
        purchaseDate: Date | null;
        purchaseProofNumber: string | null;
      }> = {};
      if (touchesProduct) data.productId = productId;
      if (dto.manufacturerId !== undefined) data.manufacturerId = dto.manufacturerId;
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.serialNumber !== undefined) data.serialNumber = dto.serialNumber;
      if (dto.frameNumber !== undefined) data.frameNumber = dto.frameNumber;
      if (dto.purchaseDate !== undefined) data.purchaseDate = new Date(dto.purchaseDate);
      if (dto.purchaseProofNumber !== undefined) data.purchaseProofNumber = dto.purchaseProofNumber;

      if (Object.keys(data).length === 0) return;

      await this.caseItemsRepository.updateFields(itemId, data, tx);

      // JSON-bezpieczna kopia do historii/audytu — `data.purchaseDate` to `Date`,
      // `Prisma.InputJsonValue` przyjmuje wyłącznie prymitywy/ISO string.
      const auditData = {
        ...data,
        purchaseDate: data.purchaseDate ? data.purchaseDate.toISOString() : data.purchaseDate,
      };

      await this.caseHistoryRepository.addEntry(
        caseId,
        {
          userId: actorUserId,
          action: CaseHistoryAction.CaseItemUpdated,
          previousValue: null,
          newValue: `Poprawiono pozycję sprawy — zmienione pola: ${Object.keys(data).join(', ')}.`,
          visibleForCustomer: false,
        },
        tx,
      );

      await this.auditRepository.create(
        {
          companyId: before.companyId,
          userId: actorUserId,
          action: 'CASE_ITEM_UPDATED',
          entityType: 'CaseItem',
          entityId: itemId,
          previousValue: pick(item, Object.keys(data)),
          newValue: auditData,
        },
        tx,
      );
    });

    return this.findById(caseId, companyId);
  }

  /** `cases.status.change` — Status Workflow Refactor: pracownik może wybrać KAŻDY aktywny status katalogu firmy, w dowolnym momencie (patrz `performTransition`). */
  async changeStatus(
    id: string,
    companyId: string,
    status: string,
    actorUserId: string,
    actorPermissions: string[],
    notifyCustomer?: boolean,
  ): Promise<CaseEntity> {
    return this.performTransition(id, companyId, status, actorUserId, actorPermissions, {
      notifyCustomer,
    });
  }

  /**
   * `cases.cancel`. CASE-011 (powód wymagany). Status Workflow Refactor —
   * "Anulowana" nie jest już osobnym statusem: anulowanie to przejście do
   * `Zakonczona` + `Case.cancelledAt` + `CaseHistoryAction.CaseCancelled`
   * (`options.cancelling`, patrz `performTransition`), rozróżnialne od
   * zwykłego zamknięcia mimo tego samego statusu docelowego. Idempotentne —
   * jeśli sprawa jest już zakończona I anulowana (`cancelledAt` ustawione),
   * zwraca ją bez zmian.
   */
  async cancel(
    id: string,
    companyId: string,
    reason: string,
    actorUserId: string,
    actorPermissions: string[],
  ): Promise<CaseEntity> {
    return this.performTransition(
      id,
      companyId,
      WELL_KNOWN_STATUS_CODES.ZAKONCZONA,
      actorUserId,
      actorPermissions,
      {
        reason,
        cancelling: true,
      },
    );
  }

  /**
   * `cases.archive` — Status Workflow Refactor: archiwizacja NIE zmienia
   * statusu (nie ma już osobnej "Zarchiwizowana"), tylko ustawia
   * `Case.archivedAt` na sprawie już będącej w statusie finalnym. Osobna
   * metoda (nie `performTransition`) — nie jest przejściem statusu.
   * Idempotentne: jeśli `archivedAt` jest już ustawione, zwraca sprawę bez zmian.
   */
  async archive(
    id: string,
    companyId: string,
    actorUserId: string,
    actorPermissions: string[],
  ): Promise<CaseEntity> {
    if (!actorPermissions.includes(PERMISSIONS.CASES_ARCHIVE)) {
      throw new AppException(
        ERROR_CODES.RBAC_001.code,
        ERROR_CODES.RBAC_001.message,
        ERROR_CODES.RBAC_001.status,
      );
    }

    // Brak publikacji zdarzenia domenowego — archiwizacja nie ma dziś żadnego
    // subskrybenta (nie wysyła e-maila do klienta, nic nie reaguje na
    // "archived"), inaczej niż zmiana statusu. Wpis `CaseHistory`/`AuditLog`
    // to trwały ślad, wystarczający dla tej wyłącznie-wewnętrznej akcji.
    const { updated } = await this.withLockedCase(id, companyId, async (tx, caseRecord) => {
      if (caseRecord.archivedAt) {
        return { updated: caseRecord };
      }

      const statusDef = await this.caseStatusesService.findByCode(caseRecord.status, companyId);
      if (!statusDef?.isFinal) {
        throw new AppException(
          ERROR_CODES.CASE_017.code,
          ERROR_CODES.CASE_017.message,
          ERROR_CODES.CASE_017.status,
        );
      }

      const updated = await this.casesRepository.updateStatus(
        id,
        caseRecord.status,
        { archivedAt: new Date() },
        tx,
      );
      await this.caseHistoryRepository.addEntry(
        id,
        {
          userId: actorUserId,
          action: CaseHistoryAction.CaseArchived,
          visibleForCustomer: false,
        },
        tx,
      );
      await this.auditRepository.create(
        {
          companyId: caseRecord.companyId,
          userId: actorUserId,
          action: 'CASE_ARCHIVED',
          entityType: 'Case',
          entityId: id,
        },
        tx,
      );
      return { updated };
    });

    return CaseMapper.toEntity(updated);
  }

  /**
   * `cases.infoRequest.send` (WORKFLOW.md §4, §6 poz. 4). Status Workflow
   * Refactor — przestaje być przejściem statusu: sprawa zostaje w BIEŻĄCYM
   * statusie, tylko dostaje wiadomość (Portal/Wiadomości) + wpis historii
   * `InfoRequested`. Pracownik nadal może ręcznie zmienić status w
   * dowolnym momencie w międzyczasie (żadnej specjalnej blokady) — to
   * świadome uproszczenie względem poprzedniego mechanizmu auto-wznowienia
   * (`resumeIfComplete`, usunięty — nie ma już statusu "oczekiwania", z
   * którego trzeba by wracać).
   */
  async requestInfo(
    id: string,
    companyId: string,
    dto: { requestedItems: string[]; messageText: string },
    actorUserId: string,
    actorPermissions: string[],
  ): Promise<CaseEntity> {
    if (!actorPermissions.includes(PERMISSIONS.CASES_INFO_REQUEST_SEND)) {
      throw new AppException(
        ERROR_CODES.RBAC_001.code,
        ERROR_CODES.RBAC_001.message,
        ERROR_CODES.RBAC_001.status,
      );
    }

    const { updated, historyEntry } = await this.withLockedCase(
      id,
      companyId,
      async (tx, caseRecord) => {
        await this.assertCaseIsActive(caseRecord, companyId);

        const historyEntry = await this.caseHistoryRepository.addEntry(
          id,
          {
            userId: actorUserId,
            action: CaseHistoryAction.InfoRequested,
            visibleForCustomer: true,
          },
          tx,
        );

        // Prośba o uzupełnienie danych trafia jako `Message` (Wiadomości/Portal Klienta) —
        // bez tego klient bez odczytania maila nie widziałby ani listy braków, ani treści
        // prośby w rozmowie.
        await this.messagesRepository.create(
          id,
          {
            senderType: SenderType.Employee,
            senderUserId: actorUserId,
            direction: MessageDirection.Outbound,
            channel: MessageChannel.Portal,
            content: `Prosimy o uzupełnienie: ${dto.requestedItems.join(', ')}.\n\n${dto.messageText}`,
          },
          tx,
        );

        await this.auditRepository.create(
          {
            companyId: caseRecord.companyId,
            userId: actorUserId,
            action: 'CASE_INFO_REQUESTED',
            entityType: 'Case',
            entityId: id,
          },
          tx,
        );

        return { updated: caseRecord, historyEntry };
      },
    );

    await this.eventBus.publish(
      new DomainEvent<CaseInfoRequestedPayload>({
        eventName: EVENT_NAMES.CASE_INFO_REQUESTED,
        companyId: updated.companyId,
        aggregateType: 'Case',
        aggregateId: id,
        actorUserId,
        correlationId: randomUUID(),
        payload: {
          requestedItems: dto.requestedItems,
          messageText: dto.messageText,
          caseHistoryId: historyEntry.id,
        },
      }),
    );

    return CaseMapper.toEntity(updated);
  }

  /**
   * `cases.decision.set`/`cases.decision.approve` — USTAWIA `Case.decision`
   * BEZ zmiany statusu (WORKFLOW.md §6 poz. 3, odrębne od poz. 2). Kolejna
   * zmiana statusu to osobne wywołanie `changeStatus` (CASE-009 tam
   * sprawdza, że decyzja jest już ustawiona). Blokuje wiersz `Case` —
   * ustawienie decyzji i zmiana statusu tej samej sprawy nie mogą
   * przeplatać się nieprzewidywalnie.
   *
   * Status Workflow Refactor — uprawnienie wymagane do ustawienia decyzji
   * przestaje zależeć od BIEŻĄCEGO STATUSU sprawy (dawniej:
   * `OczekiwanieNaDecyzjeKierownika` zawsze wymagał `.approve`, bo status
   * sam w sobie ujawniał ścieżkę rękojmi/Kierownika) — statusy są teraz
   * generyczne/branch-agnostyczne, więc jedyna pozostała reguła to WARTOŚĆ
   * decyzji: `ZwrotSrodkow` zawsze wymaga `cases.decision.approve`,
   * pozostałe wystarczają z `cases.decision.set`.
   */
  async setDecision(
    id: string,
    companyId: string,
    decision: Decision,
    actorUserId: string,
    actorPermissions: string[],
    extra: {
      decisionContractorId?: string;
      decisionJustification?: string;
      decisionFulfillmentMethod?: DecisionFulfillmentMethod;
      decisionManufacturerResponse?: string;
    } = {},
  ): Promise<CaseEntity> {
    const requiredPermission =
      decision === Decision.ZwrotSrodkow
        ? PERMISSIONS.CASES_DECISION_APPROVE
        : PERMISSIONS.CASES_DECISION_SET;
    const hasRequired =
      requiredPermission === PERMISSIONS.CASES_DECISION_APPROVE
        ? actorPermissions.includes(PERMISSIONS.CASES_DECISION_APPROVE)
        : actorPermissions.includes(PERMISSIONS.CASES_DECISION_SET) ||
          actorPermissions.includes(PERMISSIONS.CASES_DECISION_APPROVE);

    if (!hasRequired) {
      throw requiredPermission === PERMISSIONS.CASES_DECISION_APPROVE
        ? new AppException(
            ERROR_CODES.CASE_010.code,
            ERROR_CODES.CASE_010.message,
            ERROR_CODES.CASE_010.status,
          )
        : new AppException(
            ERROR_CODES.RBAC_001.code,
            ERROR_CODES.RBAC_001.message,
            ERROR_CODES.RBAC_001.status,
          );
    }

    const { updated, historyEntry, requiresManagerApproval } = await this.withLockedCase(
      id,
      companyId,
      async (tx, before) => {
        await this.assertCaseIsActive(before, companyId);

        // STATE_MACHINE.md (reguła dodatkowa) — ZwrotSrodkow wymaga zawsze approve; `requiresManagerApproval` odzwierciedla to trwale na rekordzie (WORKFLOW.md §8).
        const requiresManagerApproval = decision === Decision.ZwrotSrodkow;
        const decisionIsPositive = decision !== Decision.Odrzucenie;
        // Status-agnostyczna, płaska podpowiedź (dawniej `NEXT_ACTION_AFTER_DECISION_SET`
        // kluczowane per-status — teraz zbędne, bo decyzję można ustawić z dowolnego
        // aktywnego statusu, nie tylko dwóch dedykowanych "oczekiwania na decyzję").
        const nextAction = 'Zmień status zgodnie z podjętą decyzją.';
        const updated = await this.casesRepository.setDecision(
          id,
          decision,
          actorUserId,
          requiresManagerApproval,
          nextAction,
          { decisionIsPositive, ...extra },
          tx,
        );

        const historyEntry = await this.caseHistoryRepository.addEntry(
          id,
          {
            userId: actorUserId,
            action: CaseHistoryAction.DecisionSet,
            previousValue: before.decision,
            newValue: decision,
            visibleForCustomer: true,
          },
          tx,
        );

        await this.auditRepository.create(
          {
            companyId: before.companyId,
            userId: actorUserId,
            action: 'CASE_DECISION_SET',
            entityType: 'Case',
            entityId: id,
            previousValue: { decision: before.decision } as Prisma.InputJsonValue,
            newValue: { decision, requiresManagerApproval } as Prisma.InputJsonValue,
          },
          tx,
        );

        return { updated, historyEntry, requiresManagerApproval };
      },
    );

    await this.eventBus.publish(
      new DomainEvent<CaseDecisionSetPayload>({
        eventName: EVENT_NAMES.CASE_DECISION_SET,
        companyId: updated.companyId,
        aggregateType: 'Case',
        aggregateId: id,
        actorUserId,
        correlationId: randomUUID(),
        payload: {
          decision,
          decisionByUserId: actorUserId,
          requiresManagerApproval,
          caseHistoryId: historyEntry.id,
        },
      }),
    );

    return CaseMapper.toEntity(updated);
  }

  /**
   * `cases.assign` (WORKFLOW.md §6 poz. 17). Weryfikuje istnienie `ownerId`
   * (`UsersService.findById`, USER-002 jeśli brak) — dostępne od poprawki po
   * code review Zadania 16 (`forwardRef` między `CasesModule`/`UsersModule`,
   * patrz komentarz w `cases.module.ts`).
   */
  async assignOwner(
    id: string,
    companyId: string,
    ownerId: string,
    actorUserId: string,
  ): Promise<CaseEntity> {
    await this.usersService.findById(ownerId, companyId);

    const { updated, historyEntry, previousOwnerId } = await this.withLockedCase(
      id,
      companyId,
      async (tx, before) => {
        await this.assertCaseIsActive(before, companyId);

        const updated = await this.casesRepository.assignOwner(id, ownerId, tx);

        const historyEntry = await this.caseHistoryRepository.addEntry(
          id,
          {
            userId: actorUserId,
            action: CaseHistoryAction.OwnerChanged,
            previousValue: before.ownerId,
            newValue: ownerId,
            visibleForCustomer: false,
          },
          tx,
        );

        await this.auditRepository.create(
          {
            companyId: before.companyId,
            userId: actorUserId,
            action: 'CASE_OWNER_CHANGED',
            entityType: 'Case',
            entityId: id,
            previousValue: { ownerId: before.ownerId } as Prisma.InputJsonValue,
            newValue: { ownerId } as Prisma.InputJsonValue,
          },
          tx,
        );

        return { updated, historyEntry, previousOwnerId: before.ownerId };
      },
    );

    await this.eventBus.publish(
      new DomainEvent<CaseOwnerChangedPayload>({
        eventName: EVENT_NAMES.CASE_OWNER_CHANGED,
        companyId: updated.companyId,
        aggregateType: 'Case',
        aggregateId: id,
        actorUserId,
        correlationId: randomUUID(),
        payload: { previousOwnerId, newOwnerId: ownerId, caseHistoryId: historyEntry.id },
      }),
    );

    return CaseMapper.toEntity(updated);
  }

  async findHistory(caseId: string, companyId: string): Promise<CaseHistoryEntity[]> {
    await this.findCaseOrThrow(caseId, companyId);
    return CaseMapper.historyToEntityList(await this.caseHistoryRepository.findByCaseId(caseId));
  }

  /**
   * Zadanie 17 (Documents) — cienki publiczny wrapper nad `CaseHistoryRepository`,
   * żeby `DocumentsService` mógł zapisać `CaseHistory` (`DocumentAdded`/
   * `DocumentMarkedInvalid`, WORKFLOW.md §6 poz. 18/19) ATOMOWO razem z
   * mutacją `Document` — bez konieczności eksportowania `CaseHistoryRepository`
   * z `CasesModule` (usługi wołają usługi, nie cudze repozytoria bezpośrednio;
   * jedyny istniejący wyjątek, `CasesRepository` dla Users, jest już
   * ugruntowanym precedensem, ale nie mnożymy go bez potrzeby). Przyjmuje ten
   * sam `tx`, którym `DocumentsService` otworzył własną transakcję.
   */
  async appendCaseHistory(
    caseId: string,
    data: {
      userId?: string | null;
      action: CaseHistoryAction;
      previousValue?: string | null;
      newValue?: string | null;
      visibleForCustomer?: boolean;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string }> {
    const entry = await this.caseHistoryRepository.addEntry(caseId, data, tx);
    return { id: entry.id };
  }

  /** `notes.create`. CASE-008 jeśli sprawa w statusie końcowym. */
  async addNote(
    caseId: string,
    companyId: string,
    userId: string,
    content: string,
  ): Promise<NoteEntity> {
    const { note, historyEntry } = await this.withLockedCase(
      caseId,
      companyId,
      async (tx, caseRecord) => {
        await this.assertCaseIsActive(caseRecord, companyId);

        const note = await this.notesRepository.create(caseId, userId, content, tx);

        const historyEntry = await this.caseHistoryRepository.addEntry(
          caseId,
          { userId, action: CaseHistoryAction.NoteAdded, visibleForCustomer: false },
          tx,
        );

        await this.auditRepository.create(
          {
            companyId: caseRecord.companyId,
            userId,
            action: 'CASE_NOTE_ADDED',
            entityType: 'Note',
            entityId: note.id,
          },
          tx,
        );

        return { note, historyEntry, companyId: caseRecord.companyId };
      },
    );

    await this.eventBus.publish(
      new DomainEvent<CaseNoteAddedPayload>({
        eventName: EVENT_NAMES.CASE_NOTE_ADDED,
        companyId,
        aggregateType: 'Case',
        aggregateId: caseId,
        actorUserId: userId,
        correlationId: randomUUID(),
        payload: { noteId: note.id, caseHistoryId: historyEntry.id },
      }),
    );

    return CaseMapper.noteToEntity(note);
  }

  async findNotes(caseId: string, companyId: string): Promise<NoteEntity[]> {
    await this.findCaseOrThrow(caseId, companyId);
    return CaseMapper.noteToEntityList(await this.notesRepository.findByCaseId(caseId));
  }

  async findMessages(caseId: string, companyId: string): Promise<MessageEntity[]> {
    await this.findCaseOrThrow(caseId, companyId);
    return CaseMapper.messageToEntityList(
      await this.messagesRepository.findByCaseIdWithDocuments(caseId),
    );
  }

  /** `messages.view` — wołane, gdy pracownik otwiera zakładkę Wiadomości; zeruje czerwoną kropkę na liście spraw i kafelek "Nieodczytane wiadomości" na dashboardzie (oba liczą `readAt=null`). `findCaseOrThrow` jako bramka dzierżawy (IDOR), tak jak `findMessages` wyżej. */
  async markMessagesRead(caseId: string, companyId: string): Promise<void> {
    await this.findCaseOrThrow(caseId, companyId);
    await this.messagesRepository.markAllReadForCase(caseId, MessageDirection.Inbound);
  }

  /**
   * `messages.send`. Kierunek/nadawca stałe dla wiadomości wysyłanej przez
   * pracownika (DATABASE.md §24). CASE-008 jeśli sprawa w statusie
   * końcowym. `documentIds` opcjonalne — każdy załącznik musi być wcześniej
   * wgrany (`POST /cases/:id/documents`) i należeć do TEJ sprawy, ten sam
   * wzorzec walidacji co `PortalService.sendMessage`. Bez wysyłki
   * e-mail/Portal — to reakcja na zdarzenie (Notifications), poza zakresem
   * tego serwisu.
   */
  async sendMessage(
    caseId: string,
    companyId: string,
    senderUserId: string,
    dto: { channel: MessageChannel; subject?: string; content: string; documentIds?: string[] },
  ): Promise<MessageEntity> {
    const { message, historyEntry, documents } = await this.withLockedCase(
      caseId,
      companyId,
      async (tx, caseRecord) => {
        await this.assertCaseIsActive(caseRecord, companyId);

        const documents: { id: string; fileName: string }[] = [];
        for (const documentId of dto.documentIds ?? []) {
          const document = await this.documentsRepository.findById(documentId);
          if (!document || document.caseId !== caseId) {
            throw new NotFoundException();
          }
          documents.push({ id: document.id, fileName: document.fileName });
        }

        const message = await this.messagesRepository.create(
          caseId,
          {
            senderType: SenderType.Employee,
            senderUserId,
            direction: MessageDirection.Outbound,
            channel: dto.channel,
            subject: dto.subject,
            content: dto.content,
            documentIds: dto.documentIds,
          },
          tx,
        );

        const historyEntry = await this.caseHistoryRepository.addEntry(
          caseId,
          {
            userId: senderUserId,
            action: CaseHistoryAction.MessageSent,
            visibleForCustomer: false,
          },
          tx,
        );

        await this.auditRepository.create(
          {
            companyId: caseRecord.companyId,
            userId: senderUserId,
            action: 'CASE_MESSAGE_ADDED',
            entityType: 'Message',
            entityId: message.id,
          },
          tx,
        );

        return { message, historyEntry, companyId: caseRecord.companyId, documents };
      },
    );

    await this.eventBus.publish(
      new DomainEvent<CaseMessageAddedPayload>({
        eventName: EVENT_NAMES.CASE_MESSAGE_ADDED,
        companyId,
        aggregateType: 'Case',
        aggregateId: caseId,
        actorUserId: senderUserId,
        correlationId: randomUUID(),
        payload: {
          messageId: message.id,
          channel: message.channel,
          direction: message.direction,
          caseHistoryId: historyEntry.id,
        },
      }),
    );

    return CaseMapper.messageToEntity(message, documents);
  }

  /**
   * Wiadomość systemowa widoczna dla klienta w Portalu (`SenderType.System`,
   * `MessageChannel.Portal`) — dziś jedyny wywołujący: `CaseStatusChangedNotificationHandler`
   * po wysłaniu e-maila klientowi (`TEMPLATE_CODES_MIRRORED_TO_PORTAL`:
   * zamknięcie sprawy `case.closed.customer` oraz gotowość do odbioru
   * `case.ready_for_pickup.customer` — właściciel poprosił o oba wprost),
   * TĄ SAMĄ treścią co e-mail. Celowo BEZ `assertCaseIsActive` — w
   * przeciwieństwie do `sendMessage()` (pracownik odpowiada na aktywną
   * sprawę), tutaj wołający NIE gwarantuje statusu końcowego (przy "gotowości
   * do odbioru" sprawa zwykle jeszcze NIE jest zamknięta) — bramka byłaby
   * więc niepotrzebna, a przy zamknięciu i tak zablokowałaby jedyny realny
   * przypadek użycia. Bez publikacji `CASE_MESSAGE_ADDED` —
   * `CaseMessageAddedNotificationHandler` i tak ignoruje wiadomości spoza
   * `SenderType.Employee`, a druga wysyłka e-maila "nowa wiadomość" byłaby tu
   * zwyczajnie zbędna (klient już dostał e-mail o statusie chwilę wcześniej,
   * w tym samym handlerze).
   */
  async appendSystemMessage(caseId: string, companyId: string, content: string): Promise<void> {
    const caseRecord = await this.casesRepository.findById(caseId, companyId);
    if (!caseRecord) throw new NotFoundException();

    await this.prisma.$transaction(async (tx) => {
      await this.messagesRepository.create(
        caseId,
        {
          senderType: SenderType.System,
          direction: MessageDirection.Outbound,
          channel: MessageChannel.Portal,
          content,
        },
        tx,
      );
      await this.caseHistoryRepository.addEntry(
        caseId,
        { userId: null, action: CaseHistoryAction.MessageSent, visibleForCustomer: false },
        tx,
      );
    });
  }

  // --- Portal Klienta / Replacement / Logistics — POZA zakresem Zadania 16, patrz raport końcowy (nie wśród zamówionych repo/metod/zdarzeń) ---

  /**
   * `options.sendEmail` (domyślnie `true`) — jedyny sposób uzyskania dostępu
   * Portalu poza Publicznym Formularzem: pracownik generuje kod dla sprawy
   * założonej innym kanałem (telefon/e-mail), więc TU e-mail z kodem ma
   * pójść automatycznie. `IntakeService.submitComplaint` przekazuje
   * `sendEmail:false`, bo sam wysyła jeden, połączony e-mail
   * (`case.created.public.customer`) — bez tego klient z formularza
   * dostałby kod dostępu dwa razy. Ponowne wywołanie na sprawie z już
   * włączonym Portalem to jednocześnie "utrata dostępu → nowy kod, stary
   * unieważniony" (nadpisuje hash) — z nowym e-mailem informującym o tym
   * klienta.
   */
  async enablePortal(
    id: string,
    companyId: string,
    options: { sendEmail?: boolean } = {},
  ): Promise<PortalCredentialEntity> {
    const caseRecord = await this.findCaseOrThrow(id, companyId);
    const accessCode = generatePortalAccessCode();
    const accessCodeHash = await bcrypt.hash(accessCode, BCRYPT_ROUNDS);
    const updated = await this.casesRepository.enablePortalWithAccessCode(id, accessCodeHash);

    const sendEmail = options.sendEmail ?? true;
    if (sendEmail) {
      const customer = await this.customersService.findById(caseRecord.customerId, companyId);
      if (customer.email) {
        const company = await this.companiesService.findById(companyId);
        const portalUrl = `${this.config.get<string[]>('cors.origin')![0]}/portal/login?case=${encodeURIComponent(updated.caseNumber)}&code=${encodeURIComponent(accessCode)}`;
        await this.notificationsService.createNotificationFromTemplate({
          companyId,
          code: 'case.portal_access.customer',
          channel: NotificationChannel.Email,
          recipientType: NotificationRecipientType.Customer,
          recipientEmail: customer.email,
          relatedCaseId: id,
          variables: {
            caseNumber: updated.caseNumber,
            customerName: `${customer.firstName} ${customer.lastName}`,
            portalUrl,
            accessCode,
            companyName: company.name,
          },
        });
      }
    }

    return { case: CaseMapper.toEntity(updated), value: accessCode };
  }

  async disablePortal(id: string, companyId: string): Promise<CaseEntity> {
    await this.findCaseOrThrow(id, companyId);
    return CaseMapper.toEntity(await this.casesRepository.disablePortal(id));
  }

  async generateSecureLink(id: string, companyId: string): Promise<PortalCredentialEntity> {
    await this.findCaseOrThrow(id, companyId);
    const token = generatePortalSecureToken();
    const tokenHash = await bcrypt.hash(token, BCRYPT_ROUNDS);
    const caseRecord = await this.casesRepository.generateSecureToken(id, tokenHash);
    return { case: CaseMapper.toEntity(caseRecord), value: token };
  }

  async issueReplacement(
    caseItemId: string,
    companyId: string,
    productIdentifier: string,
    plannedReturnAt?: Date,
  ) {
    await this.assertCaseItemAccessible(caseItemId, companyId);
    return CaseMapper.replacementToEntity(
      await this.casesRepository.issueReplacement(caseItemId, productIdentifier, plannedReturnAt),
    );
  }

  async returnReplacement(caseItemId: string, companyId: string, conditionOnReturn?: string) {
    await this.assertCaseItemAccessible(caseItemId, companyId);
    return CaseMapper.replacementToEntity(
      await this.casesRepository.returnReplacement(caseItemId, conditionOnReturn),
    );
  }

  async findLogistics(caseId: string, companyId: string) {
    await this.findCaseOrThrow(caseId, companyId);
    return CaseMapper.logisticsToEntityList(await this.casesRepository.findLogistics(caseId));
  }

  // --- Portal Klienta — "Uzupełnienie reklamacji" ---

  /** Odczyt (bez rzucania) — checklist braków dla Portalu Klienta, patrz `computeCompleteness`. */
  async getCompleteness(caseId: string, companyId: string): Promise<CaseCompletenessEntity> {
    const caseRecord = await this.findCaseOrThrow(caseId, companyId);
    return this.computeCompleteness(caseRecord);
  }

  /**
   * Portal Klienta — klient uzupełnia numer seryjny/ramy/dowodu zakupu KONKRETNEJ
   * pozycji sprawy. `caseId` w sygnaturze (nie tylko `itemId`) — token portalu niesie
   * `caseId`, więc to jest zaufana granica dostępu (analogiczna do `companyId` gdzie
   * indziej), sprawdzana PRZEZ `CaseItemsRepository.findByIdForCase`.
   *
   * Status Workflow Refactor — NIE sprawdza już kompletności/nie wznawia
   * automatycznie statusu po zapisie (dawny `resumeIfComplete`, usunięty):
   * nie ma już statusu "oczekiwania", z którego trzeba by wracać — pracownik
   * widzi uzupełnione dane i sam decyduje o zmianie statusu w dowolnym
   * momencie. Sprawdzanie kompletności (`getCompleteness`,
   * `computeCompleteness`) zostaje w pełni zachowane jako odczyt "czego
   * jeszcze brakuje" dla checklisty Portalu — tylko przestało mieć efekt
   * uboczny w postaci auto-przełączenia statusu.
   */
  async updatePortalItemFields(
    caseId: string,
    companyId: string,
    itemId: string,
    data: { serialNumber?: string; frameNumber?: string; purchaseProofNumber?: string },
  ): Promise<CaseEntity> {
    const item = await this.caseItemsRepository.findByIdForCase(itemId, caseId);
    if (!item) {
      throw new AppException(
        ERROR_CODES.CASE_012.code,
        ERROR_CODES.CASE_012.message,
        ERROR_CODES.CASE_012.status,
      );
    }
    await this.caseItemsRepository.updatePortalFields(itemId, data);
    return this.findById(caseId, companyId);
  }

  // --- Wewnętrzne ---

  /**
   * Blokuje wiersz `Case` (`FOR UPDATE`) i wykonuje `work` w tej samej
   * transakcji — wspólny rdzeń atomowości/serializacji dla WSZYSTKICH
   * mutacji pojedynczej sprawy (status, decyzja, edycja, opiekun, notatka,
   * wiadomość). CASE-012, jeśli sprawa nie istnieje.
   */
  private async withLockedCase<T>(
    caseId: string,
    companyId: string,
    work: (tx: Prisma.TransactionClient, caseRecord: CaseWithItems) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const caseRecord = await this.casesRepository.findByIdForUpdate(caseId, companyId, tx);
      if (!caseRecord) {
        throw new AppException(
          ERROR_CODES.CASE_012.code,
          ERROR_CODES.CASE_012.message,
          ERROR_CODES.CASE_012.status,
        );
      }
      return work(tx, caseRecord);
    });
  }

  /**
   * Rdzeń WSZYSTKICH przejść statusu — jedyne miejsce wołające
   * `findTransition`/`resolveTransitionPermission` (`case-status.rules.ts`).
   * `changeStatus`/`cancel`/`archive`/`requestInfo` to cienkie wrappery nad
   * tą metodą. `idempotentIfAlready` (używane przez `cancel`/`archive`) —
   * jeśli sprawa jest już w statusie docelowym, zwraca ją bez zmian zamiast
   * CASE-001: bezpieczne dla klientów, którzy ponawiają żądanie po timeout/
   * utracie odpowiedzi (retry-safe), bez podwójnego wpisu audytu/zdarzenia.
   */
  private async performTransition(
    caseId: string,
    companyId: string,
    targetStatusCode: string,
    actorUserId: string,
    actorPermissions: string[],
    options: {
      reason?: string;
      /** `cancel()` — cel jest ten sam `Zakonczona` co zwykłe zamknięcie, ale wymaga `cases.cancel` (nie `cases.status.change`), ustawia `cancelledAt`, zapisuje powód jako Note, i `CaseHistoryAction.CaseCancelled` zamiast `CaseClosed`/`StatusChanged`. */
      cancelling?: boolean;
      /** `changeStatus` — pracownik może zrezygnować z automatycznego e-maila do klienta przy tym konkretnym przejściu (np. status jest gotowy technicznie, ale sklep chce zadzwonić, nie mailować). Domyślnie `true`. */
      notifyCustomer?: boolean;
    } = {},
  ): Promise<CaseEntity> {
    const result = await this.withLockedCase(caseId, companyId, async (tx, caseRecord) => {
      // Status Workflow Refactor — wybór TEGO SAMEGO statusu jest zawsze
      // no-opem (bez CASE-001, bez podwójnego audytu/zdarzenia) — nie tylko
      // dla cancel/archive jak dawniej, dla KAŻDEGO przejścia (retry-safe).
      if (caseRecord.status === targetStatusCode) {
        return { noop: true as const, entity: caseRecord };
      }

      const targetStatus = await this.caseStatusesService.findActiveByCode(
        targetStatusCode,
        companyId,
      );
      if (!targetStatus) {
        throw new AppException(
          ERROR_CODES.CASE_016.code,
          ERROR_CODES.CASE_016.message,
          ERROR_CODES.CASE_016.status,
        );
      }

      // Status Workflow Refactor — bez tabeli przejść: jedyna permission-gate
      // to "czy w ogóle wolno zmieniać status", plus osobne, silniejsze
      // `cases.cancel` dla ścieżki anulowania (wymuszone przez kontroler na
      // `POST /cancel`, powtórzone tu jako defense-in-depth, bo `actorPermissions`
      // to PEŁNY zestaw uprawnień użytkownika, nie tylko te z trafionego endpointu).
      const requiredPermission = options.cancelling
        ? PERMISSIONS.CASES_CANCEL
        : PERMISSIONS.CASES_STATUS_CHANGE;
      if (!actorPermissions.includes(requiredPermission)) {
        throw new AppException(
          ERROR_CODES.RBAC_001.code,
          ERROR_CODES.RBAC_001.message,
          ERROR_CODES.RBAC_001.status,
          { meta: { requiredPermission } },
        );
      }

      if (targetStatus.requiredCheck === 'CASE-009' && !caseRecord.decision) {
        throw new AppException(
          ERROR_CODES.CASE_009.code,
          ERROR_CODES.CASE_009.message,
          ERROR_CODES.CASE_009.status,
        );
      }
      // CASE-002 — kompletność dokumentacji wymaganej przez producenta.
      // Sprawdzane WYŁĄCZNIE gdy CEL przejścia tak oznacza (`requiredCheck ===
      // 'CASE-002'` na wierszu `CaseStatusDefinition`) — logika w 100%
      // zachowana z poprzedniej wersji, zmienia się tylko WYZWALACZ (dawniej:
      // kształt konkretnego przejścia w tabeli; dziś: metadana statusu docelowego).
      if (targetStatus.requiredCheck === 'CASE-002') {
        await this.assertRequiredDocuments(caseRecord, tx);
      }

      if (options.cancelling && !options.reason?.trim()) {
        throw new AppException(
          ERROR_CODES.CASE_011.code,
          ERROR_CODES.CASE_011.message,
          ERROR_CODES.CASE_011.status,
        );
      }

      // Status Workflow Refactor §17/§18 — przejście do statusu NIEKOŃCOWEGO (np.
      // Zakończona → Przyjęta, ponowne otwarcie sprawy) musi wyczyścić znaczniki
      // "sprawa była zamknięta/anulowana/zarchiwizowana" z POPRZEDNIEGO zamknięcia,
      // inaczej UI (i przyszłe raporty) pokazywałyby "Zamknięto"/baner Anulowana na
      // aktywnej sprawie. `archivedAt` czyszczone tu też — archiwizacja ma sens
      // wyłącznie dla sprawy w statusie końcowym (CASE-017), więc reaktywacja
      // sprawy unieważnia poprzednią archiwizację.
      const timestamps: {
        closedAt?: Date | null;
        cancelledAt?: Date | null;
        archivedAt?: Date | null;
      } = targetStatus.isFinal
        ? { closedAt: new Date() }
        : { closedAt: null, cancelledAt: null, archivedAt: null };
      if (options.cancelling) timestamps.cancelledAt = new Date();

      const updated = await this.casesRepository.updateStatus(
        caseId,
        targetStatus.code,
        {
          ...timestamps,
          nextAction: targetStatus.defaultNextAction,
          // Przypomnienia o reakcji — świeży zegar na KAŻDĄ realną zmianę statusu
          // (ta gałąź nigdy nie wykonuje się dla no-opu wyboru tego samego statusu,
          // patrz sprawdzenie na początku tej metody), i wyzerowanie znacznika
          // ostatniego powiadomienia, żeby kolejny epizod bezczynności mógł
          // ponownie wygenerować alert (`CaseAttentionScannerService`).
          statusChangedAt: new Date(),
          attentionNotifiedAt: null,
        },
        tx,
      );

      // WORKFLOW.md §5 — powód anulowania zapisany jako Note (druga z dwóch udokumentowanych opcji); CaseHistory.newValue niesie spójnie kod statusu docelowego we wszystkich przejściach, nie powód.
      if (options.cancelling && options.reason) {
        await this.notesRepository.create(
          caseId,
          actorUserId,
          `Powód anulowania: ${options.reason}`,
          tx,
        );
      }

      const historyAction = options.cancelling
        ? CaseHistoryAction.CaseCancelled
        : targetStatus.isFinal
          ? CaseHistoryAction.CaseClosed
          : CaseHistoryAction.StatusChanged;
      const historyEntry = await this.caseHistoryRepository.addEntry(
        caseId,
        {
          userId: actorUserId,
          action: historyAction,
          previousValue: caseRecord.status,
          newValue: targetStatus.code,
          visibleForCustomer: true,
        },
        tx,
      );

      await this.auditRepository.create(
        {
          companyId: caseRecord.companyId,
          userId: actorUserId,
          action: 'CASE_STATUS_CHANGED',
          entityType: 'Case',
          entityId: caseId,
          previousValue: { status: caseRecord.status } as Prisma.InputJsonValue,
          newValue: { status: targetStatus.code } as Prisma.InputJsonValue,
        },
        tx,
      );

      return {
        noop: false as const,
        entity: updated,
        historyEntry,
        previousStatus: caseRecord.status,
        complaintType: caseRecord.complaintType,
        companyId: caseRecord.companyId,
      };
    });

    if (result.noop) {
      return CaseMapper.toEntity(result.entity);
    }

    await this.eventBus.publish(
      new DomainEvent<CaseStatusChangedPayload>({
        eventName: EVENT_NAMES.CASE_STATUS_CHANGED,
        companyId: result.companyId,
        aggregateType: 'Case',
        aggregateId: caseId,
        actorUserId,
        correlationId: randomUUID(),
        payload: {
          previousStatus: result.previousStatus,
          newStatus: targetStatusCode,
          complaintType: result.complaintType,
          caseHistoryId: result.historyEntry.id,
          notifyCustomer: options.notifyCustomer ?? true,
          cancelled: !!options.cancelling,
        },
      }),
    );

    return CaseMapper.toEntity(result.entity);
  }

  /**
   * CASE-013 — retry na `@unique` (`Case.caseNumber`); każda próba to osobna
   * transakcja (Case+CaseHistory+AuditLog atomowo). Prefiks/format/reset
   * roczny konfigurowalne w Ustawieniach (`CompanySettingsService`), patrz
   * `formatCaseNumber`.
   *
   * Producent/Dystrybutor + Partnerzy B2B (Faza 5) — kandydat na numer
   * bazuje na `CasesRepository.findMaxSequence{InYear,Total}` (GLOBALNE
   * maksimum, świeżo odczytane na KAŻDĄ próbę), nie na liczniku TEJ firmy
   * (`countCreatedInYear`/`countCreatedTotal` — pozostają wykorzystywane
   * gdzie indziej, ale już nie tutaj) — `Case.caseNumber` jest unikalny
   * globalnie, więc licznik per-firmowy gwarantowanie koliduje, gdy więcej
   * niż jedna firma tworzy sprawy w tym samym roku (zaobserwowane na żywo:
   * DAWIDAM i TekstylPro wygenerowały ten sam numer, licząc każda wyłącznie
   * własne sprawy).
   */
  private async createWithUniqueCaseNumber(
    companyId: string,
    data: Parameters<CasesRepository['create']>[2],
    actorUserId: string | null,
  ): Promise<{ caseRecord: CaseWithItems; historyEntry: { id: string } }> {
    const year = new Date().getFullYear();
    const numberingConfig = await this.companySettingsService.getSettings(companyId);
    for (let attempt = 0; attempt < CASE_NUMBER_MAX_ATTEMPTS; attempt += 1) {
      const maxSequence = await (numberingConfig.caseNumberResetYearly
        ? this.casesRepository.findMaxSequenceInYear(numberingConfig.caseNumberPrefix, year)
        : this.casesRepository.findMaxSequenceTotal(numberingConfig.caseNumberPrefix));
      const caseNumber = formatCaseNumber(numberingConfig, year, maxSequence + 1);
      try {
        return await this.prisma.$transaction(async (tx) => {
          const caseRecord = await this.casesRepository.create(companyId, caseNumber, data, tx);
          const historyEntry = await this.caseHistoryRepository.addEntry(
            caseRecord.id,
            {
              userId: actorUserId,
              action: CaseHistoryAction.CaseCreated,
              newValue: caseRecord.status,
              visibleForCustomer: true,
            },
            tx,
          );
          await this.auditRepository.create(
            {
              companyId,
              userId: actorUserId,
              action: 'CASE_CREATED',
              entityType: 'Case',
              entityId: caseRecord.id,
              newValue: {
                caseNumber: caseRecord.caseNumber,
                complaintType: caseRecord.complaintType,
                submissionMode: caseRecord.submissionMode,
                status: caseRecord.status,
              } as Prisma.InputJsonValue,
            },
            tx,
          );
          return { caseRecord, historyEntry };
        });
      } catch (error) {
        if (!isUniqueConstraintViolation(error) || attempt === CASE_NUMBER_MAX_ATTEMPTS - 1) {
          if (isUniqueConstraintViolation(error)) {
            throw new AppException(
              ERROR_CODES.CASE_013.code,
              ERROR_CODES.CASE_013.message,
              ERROR_CODES.CASE_013.status,
            );
          }
          throw error;
        }
      }
    }
    throw new AppException(
      ERROR_CODES.CASE_013.code,
      ERROR_CODES.CASE_013.message,
      ERROR_CODES.CASE_013.status,
    );
  }

  /**
   * BR-103/CASE-008 — sprawa w statusie końcowym (`isFinal`) nie może być
   * dalej modyfikowana (edycja/decyzja/opiekun/notatka/wiadomość). Zmiana
   * statusu SAMA w sobie nie jest tu policzona — `performTransition` nigdy
   * nie woła tej bramki, bo status musi móc wyjść z/wrócić do stanu
   * finalnego (np. Zakończona→Reklamacja zgłoszona ponownie).
   */
  private async assertCaseIsActive(caseRecord: CaseWithItems, companyId: string): Promise<void> {
    const statusDef = await this.caseStatusesService.findByCode(caseRecord.status, companyId);
    if (statusDef?.isFinal) {
      throw new AppException(
        ERROR_CODES.CASE_008.code,
        ERROR_CODES.CASE_008.message,
        ERROR_CODES.CASE_008.status,
      );
    }
  }

  /**
   * CASE-002 — komplet załączników wymaganych przez producenta pozycji:
   * minimalna liczba zdjęć (`minPhotos`), film (`requiresVideo`) oraz dowód
   * zakupu jako PLIK, gdy producent go wymaga, a przy pozycji nie ma numeru
   * faktury/paragonu.
   *
   * Liczone są wyłącznie dokumenty AKTYWNE — plik oznaczony jako błędny
   * (BR-020) nie może „zaliczać" wymogu. Komunikat wylicza konkretne braki,
   * żeby pracownik wiedział, czego dołożyć, zamiast dostać samo „brak
   * wymaganych dokumentów".
   */
  private async assertRequiredDocuments(
    caseRecord: CaseWithItems,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const documents = (await this.documentsRepository.findAllForCase(caseRecord.id, tx)).filter(
      (d) => d.status === DocumentStatus.Aktywny,
    );
    const photos = documents.filter((d) => d.category === DocumentCategory.Photo).length;
    const videos = documents.filter((d) => d.category === DocumentCategory.Video).length;
    const proofs = documents.filter((d) => d.category === DocumentCategory.PurchaseProof).length;

    const missing: string[] = [];

    for (const item of caseRecord.items) {
      if (!item.manufacturerId) continue;
      const requirements = await this.manufacturersService.resolveRequirementsForItem(
        item.manufacturerId,
        item.product?.brandId,
        caseRecord.companyId,
      );
      if (!requirements) continue;

      if (requirements.minPhotos > 0 && photos < requirements.minPhotos) {
        missing.push(`zdjęcia (wymagane ${requirements.minPhotos}, dołączono ${photos})`);
      }
      if (requirements.requiresVideo && videos === 0) {
        missing.push('film z prezentacją usterki');
      }
      if (
        requirements.requiresProofOfPurchase &&
        proofs === 0 &&
        !item.purchaseProofNumber?.trim()
      ) {
        missing.push('dowód zakupu (numer faktury lub skan)');
      }
    }

    if (missing.length > 0) {
      const unique = Array.from(new Set(missing));
      throw new AppException(
        ERROR_CODES.CASE_002.code,
        `${ERROR_CODES.CASE_002.message} Brakuje: ${unique.join(', ')}.`,
        ERROR_CODES.CASE_002.status,
        { meta: { missing: unique } },
      );
    }
  }

  /**
   * Rozwiązanie pozycji katalogu — `productId` istniejący od razu, `productName`
   * szuka dopasowania po nazwie+producencie albo tworzy nowy `Product` TUTAJ
   * (serwis, nie kontroler `POST /products`), więc `products.manage` nie jest
   * wymagane (BR-072/BR-074, patrz doc-comment przy wywołaniu w `create()`).
   * Wydzielone z `create()`, reużywane też przez `updateItem()` — poprawa
   * błędnie wpisanego modelu ma działać identycznie jak jego pierwszy zapis.
   */
  private async resolveItemProduct(
    companyId: string,
    actorUserId: string,
    input: { productId?: string; productName?: string; manufacturerId?: string; brandId?: string },
  ) {
    if (input.productId) {
      return this.productsService.findById(input.productId, companyId);
    }
    if (!input.productName?.trim()) {
      throw new AppException(
        ERROR_CODES.VALIDATION_001.code,
        ERROR_CODES.VALIDATION_001.message,
        ERROR_CODES.VALIDATION_001.status,
        { field: 'items.productId' },
      );
    }
    if (!input.manufacturerId) {
      throw new AppException(
        ERROR_CODES.VALIDATION_001.code,
        ERROR_CODES.VALIDATION_001.message,
        ERROR_CODES.VALIDATION_001.status,
        { field: 'items.manufacturerId' },
      );
    }
    const candidates = await this.productsService.searchProducts(
      companyId,
      input.productName.trim(),
    );
    const existing = candidates.find(
      (p) =>
        p.manufacturerId === input.manufacturerId &&
        p.name.trim().toLowerCase() === input.productName!.trim().toLowerCase(),
    );
    return (
      existing ??
      (await this.productsService.createProduct(
        companyId,
        {
          manufacturerId: input.manufacturerId,
          brandId: input.brandId,
          name: input.productName.trim(),
        },
        actorUserId,
      ))
    );
  }

  /**
   * CASE-004/005/006 — wymagania producenta dotyczące DANYCH pozycji,
   * sprawdzalne już w momencie rejestracji sprawy.
   *
   * Do tej pory te kody istniały wyłącznie w `ERROR_CODES.md`: ustawienia
   * `Manufacturer.requiresXxx` dawało się zapisać, ale nic ich nie
   * egzekwowało — walidacja żyła tylko w formularzu, więc wystarczyło
   * ominąć UI, żeby założyć sprawę bez wymaganego numeru seryjnego.
   * Reguła biznesowa musi żyć na serwerze, tak samo jak maszyna stanów.
   */
  private async assertManufacturerRequirements(
    manufacturerId: string | null | undefined,
    companyId: string,
    item: { serialNumber?: string; frameNumber?: string; purchaseProofNumber?: string },
    brandId?: string | null,
  ): Promise<void> {
    if (!manufacturerId) return;
    // Etap 3 — wymagania producenta Z OPCJONALNYM nadpisaniem marki (`brandId`, z
    // rozwiązanej pozycji katalogu), zawsze przez jeden resolver, nigdy przez odczyt
    // `manufacturer.requiresX` wprost — patrz `requirements-resolver.ts`.
    const requirements = await this.manufacturersService.resolveRequirementsForItem(
      manufacturerId,
      brandId,
      companyId,
    );
    if (!requirements) return;

    if (requirements.requiresSerialNumber && !item.serialNumber?.trim()) {
      throw new AppException(
        ERROR_CODES.CASE_004.code,
        ERROR_CODES.CASE_004.message,
        ERROR_CODES.CASE_004.status,
        {
          field: 'serialNumber',
        },
      );
    }
    if (requirements.requiresFrameNumber && !item.frameNumber?.trim()) {
      throw new AppException(
        ERROR_CODES.CASE_005.code,
        ERROR_CODES.CASE_005.message,
        ERROR_CODES.CASE_005.status,
        {
          field: 'frameNumber',
        },
      );
    }
    // Dowód zakupu można udokumentować numerem faktury ALBO załącznikiem — na etapie
    // tworzenia sprawy załączników jeszcze nie ma, więc tutaj wystarcza numer; brak
    // jednego i drugiego domyka kontrola dokumentów przy zmianie statusu (CASE-002).
    if (requirements.requiresProofOfPurchase && !item.purchaseProofNumber?.trim()) {
      throw new AppException(
        ERROR_CODES.CASE_006.code,
        ERROR_CODES.CASE_006.message,
        ERROR_CODES.CASE_006.status,
        {
          field: 'purchaseProofNumber',
        },
      );
    }
  }

  /**
   * Portal Klienta — checklist "czego jeszcze brakuje", licząc PO POZYCJI wszystkie
   * wymagania producenta naraz (numer seryjny/ramy/dowodu zakupu jako pole ORAZ
   * zdjęcia/wideo/dowód zakupu jako załącznik — w przeciwieństwie do
   * `assertManufacturerRequirements`/`assertRequiredDocuments`, które sprawdzają te
   * dwie grupy osobno, w osobnych momentach procesu). Struktura odpowiedzi (kod +
   * etykieta + `satisfied`) jest celowo płaska i opisowa, żeby przyszły moduł
   * SmartRMA AI mógł podmienić same etykiety na wygenerowane komunikaty bez zmiany
   * kontraktu API — "Nie implementuj jeszcze AI, przygotuj architekturę".
   */
  private async computeCompleteness(caseRecord: CaseWithItems): Promise<CaseCompletenessEntity> {
    const documents = (await this.documentsRepository.findAllForCase(caseRecord.id)).filter(
      (d) => d.status === DocumentStatus.Aktywny,
    );
    const photos = documents.filter((d) => d.category === DocumentCategory.Photo).length;
    const videos = documents.filter((d) => d.category === DocumentCategory.Video).length;
    const proofs = documents.filter((d) => d.category === DocumentCategory.PurchaseProof).length;

    const requirements: CaseCompletenessItemEntity[] = [];
    for (const item of caseRecord.items) {
      if (!item.manufacturerId) continue;
      const resolved = await this.manufacturersService.resolveRequirementsForItem(
        item.manufacturerId,
        item.product?.brandId,
        caseRecord.companyId,
      );
      if (!resolved) continue;

      if (resolved.requiresSerialNumber) {
        requirements.push({
          code: 'serialNumber',
          itemId: item.id,
          label: 'Numer seryjny',
          satisfied: !!item.serialNumber?.trim(),
          kind: 'field',
          field: 'serialNumber',
        });
      }
      if (resolved.requiresFrameNumber) {
        requirements.push({
          code: 'frameNumber',
          itemId: item.id,
          label: 'Numer ramy',
          satisfied: !!item.frameNumber?.trim(),
          kind: 'field',
          field: 'frameNumber',
        });
      }
      if (resolved.requiresProofOfPurchase) {
        requirements.push({
          code: 'purchaseProof',
          itemId: item.id,
          label: 'Dowód zakupu',
          satisfied: !!item.purchaseProofNumber?.trim() || proofs > 0,
          kind: 'document',
          category: DocumentCategory.PurchaseProof,
        });
      }
      if (resolved.minPhotos > 0) {
        requirements.push({
          code: 'photos',
          itemId: item.id,
          label: `Zdjęcia usterki (min. ${resolved.minPhotos}, dołączono ${photos})`,
          satisfied: photos >= resolved.minPhotos,
          kind: 'document',
          category: DocumentCategory.Photo,
        });
      }
      if (resolved.requiresVideo) {
        requirements.push({
          code: 'video',
          itemId: item.id,
          label: 'Film przedstawiający usterkę',
          satisfied: videos > 0,
          kind: 'document',
          category: DocumentCategory.Video,
        });
      }
    }

    return { requirements, complete: requirements.every((r) => r.satisfied) };
  }

  private async findCaseOrThrow(id: string, companyId: string): Promise<CaseWithItems> {
    const caseRecord = await this.casesRepository.findById(id, companyId);
    if (!caseRecord) {
      throw new AppException(
        ERROR_CODES.CASE_012.code,
        ERROR_CODES.CASE_012.message,
        ERROR_CODES.CASE_012.status,
      );
    }
    return caseRecord;
  }

  /** Produkt zastępczy jest kluczowany po `CaseItem.id`, nie `Case.id` — sprawdzenie idzie przez relację do `Case`, patrz `CaseItemsRepository.findByIdForCompany`. */
  private async assertCaseItemAccessible(caseItemId: string, companyId: string): Promise<void> {
    const caseItem = await this.caseItemsRepository.findByIdForCompany(caseItemId, companyId);
    if (!caseItem) {
      throw new AppException(
        ERROR_CODES.CASE_012.code,
        ERROR_CODES.CASE_012.message,
        ERROR_CODES.CASE_012.status,
      );
    }
  }
}
