import { forwardRef, Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  CaseHistoryAction,
  CaseStatus,
  ComplaintType,
  DocumentCategory,
  DocumentStatus,
  Decision,
  MessageChannel,
  MessageDirection,
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
import { CompaniesService } from '../companies/companies.service';
import { CustomersService } from '../customers/customers.service';
import { DocumentsRepository } from '../documents/documents.repository';
import { ManufacturersService } from '../manufacturers/manufacturers.service';
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
import {
  DEFAULT_NEXT_ACTION,
  findTransition,
  historyActionForStatusChange,
  isActiveStatus,
  resolveDecisionPermission,
  resolveTransitionPermission,
} from './case-status.rules';
import { CaseHistoryRepository } from './case-history.repository';
import { CasesRepository } from './cases.repository';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
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
    /** Tylko odczyt załączników dla CASE-002 — patrz `assertRequiredDocuments`. */
    @Inject(forwardRef(() => DocumentsRepository))
    private readonly documentsRepository: DocumentsRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async findAllForCompany(companyId: string): Promise<CaseEntity[]> {
    return CaseMapper.toEntityList(await this.casesRepository.findAllForCompany(companyId));
  }

  async search(companyId: string, query: string): Promise<CaseEntity[]> {
    return CaseMapper.toEntityList(await this.casesRepository.search(companyId, query));
  }

  async findById(id: string): Promise<CaseEntity> {
    return CaseMapper.toEntity(await this.findCaseOrThrow(id));
  }

  /**
   * BR-097/CASE-007, BR-105 (opis/rozwiązanie wymagane poza ścieżką
   * monitorowaną), walidacja referencji (Customer/Shop/Product/OrderItem/
   * ownerId — Company z JWT, Order tylko pośrednio przez OrderItem),
   * CASE-013 (retry numeru). Zapis Case+CaseItem+CaseHistory+AuditLog w
   * jednej transakcji (retry obejmuje całą transakcję, bo `@unique` na
   * `caseNumber` odkrywa się dopiero przy insert).
   */
  async create(companyId: string, dto: CreateCaseDto, actorUserId: string): Promise<CaseEntity> {
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

    await this.customersService.findById(dto.customerId);
    if (dto.shopId) await this.companiesService.findShopById(dto.shopId);
    if (dto.ownerId) await this.usersService.findById(dto.ownerId);
    for (const item of dto.items) {
      const product = await this.productsService.findById(item.productId);
      if (item.orderItemId) await this.ordersService.findOrderItemById(item.orderItemId);
      // CASE-004/005/006 — wymagania KONKRETNEGO producenta tej pozycji.
      // `manufacturerId` z DTO ma pierwszeństwo (pracownik mógł nadpisać sugestię, BR-072),
      // w przeciwnym razie producent wynika z pozycji katalogu.
      await this.assertManufacturerRequirements(
        item.manufacturerId ?? product.manufacturerId,
        item,
      );
    }

    const { caseRecord, historyEntry } = await this.createWithUniqueCaseNumber(
      companyId,
      {
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
        nextAction: DEFAULT_NEXT_ACTION[CaseStatus.Nowa],
        // `purchaseDate` przychodzi jako string ISO (`@IsDateString`) — Prisma oczekuje `Date`.
        items: dto.items.map((item) => ({
          ...item,
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

  /** `cases.edit` — pola opisowe (WORKFLOW.md §8, nie status/decyzja). CASE-008 jeśli sprawa w statusie końcowym. */
  async update(id: string, dto: UpdateCaseDto, actorUserId: string): Promise<CaseEntity> {
    const { updated, changedFields } = await this.withLockedCase(id, async (tx, before) => {
      this.assertCaseIsActive(before);

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
    });

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

  /** `cases.status.change` (bramka generyczna — legalność/permission per-przejście z `case-status.rules.ts`, patrz `performTransition`). */
  async changeStatus(
    id: string,
    status: CaseStatus,
    actorUserId: string,
    actorPermissions: string[],
  ): Promise<CaseEntity> {
    return this.performTransition(id, status, actorUserId, actorPermissions);
  }

  /** `cases.cancel`. CASE-011 (powód wymagany). Idempotentne: jeśli sprawa jest już Anulowana, zwraca ją bez zmian (bez CASE-001, bez podwójnego audytu/zdarzenia). */
  async cancel(
    id: string,
    reason: string,
    actorUserId: string,
    actorPermissions: string[],
  ): Promise<CaseEntity> {
    return this.performTransition(id, CaseStatus.Anulowana, actorUserId, actorPermissions, {
      reason,
      idempotentIfAlready: true,
    });
  }

  /** `cases.archive` — wyłącznie z `Zamknieta`. Idempotentne: jeśli sprawa jest już Zarchiwizowana, zwraca ją bez zmian. */
  async archive(id: string, actorUserId: string, actorPermissions: string[]): Promise<CaseEntity> {
    return this.performTransition(id, CaseStatus.Zarchiwizowana, actorUserId, actorPermissions, {
      idempotentIfAlready: true,
    });
  }

  /** `cases.infoRequest.send` (WORKFLOW.md §4, §6 poz. 4) — wariant przejścia w `OczekiwanieNaKlienta` z wpisem `InfoRequested` zamiast generycznego `StatusChanged`. */
  async requestInfo(
    id: string,
    dto: { requestedItems: string[]; messageText: string },
    actorUserId: string,
    actorPermissions: string[],
  ): Promise<CaseEntity> {
    return this.performTransition(
      id,
      CaseStatus.OczekiwanieNaKlienta,
      actorUserId,
      actorPermissions,
      dto,
    );
  }

  /**
   * `cases.decision.set`/`cases.decision.approve` — USTAWIA `Case.decision`
   * BEZ zmiany statusu (WORKFLOW.md §6 poz. 3, odrębne od poz. 2). Przejście
   * do `RealizacjaDecyzji` to osobne, kolejne wywołanie `changeStatus`
   * (CASE-009 tam sprawdza, że decyzja jest już ustawiona). Blokuje wiersz
   * `Case` — ustawienie decyzji i zmiana statusu tej samej sprawy nie mogą
   * przeplatać się nieprzewidywalnie.
   */
  async setDecision(
    id: string,
    decision: Decision,
    actorUserId: string,
    actorPermissions: string[],
  ): Promise<CaseEntity> {
    const { updated, historyEntry, requiresManagerApproval } = await this.withLockedCase(
      id,
      async (tx, before) => {
        this.assertCaseIsActive(before);

        const requiredPermission = resolveDecisionPermission(before.status, decision);
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

        // STATE_MACHINE.md (reguła dodatkowa) — ZwrotSrodkow wymaga zawsze approve; `requiresManagerApproval` odzwierciedla to trwale na rekordzie (WORKFLOW.md §8).
        const requiresManagerApproval = decision === Decision.ZwrotSrodkow;
        const updated = await this.casesRepository.setDecision(
          id,
          decision,
          actorUserId,
          requiresManagerApproval,
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
  async assignOwner(id: string, ownerId: string, actorUserId: string): Promise<CaseEntity> {
    await this.usersService.findById(ownerId);

    const { updated, historyEntry, previousOwnerId } = await this.withLockedCase(
      id,
      async (tx, before) => {
        this.assertCaseIsActive(before);

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

  async findHistory(caseId: string): Promise<CaseHistoryEntity[]> {
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
  async addNote(caseId: string, userId: string, content: string): Promise<NoteEntity> {
    const { note, historyEntry, companyId } = await this.withLockedCase(
      caseId,
      async (tx, caseRecord) => {
        this.assertCaseIsActive(caseRecord);

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

  async findNotes(caseId: string): Promise<NoteEntity[]> {
    return CaseMapper.noteToEntityList(await this.notesRepository.findByCaseId(caseId));
  }

  async findMessages(caseId: string): Promise<MessageEntity[]> {
    return CaseMapper.messageToEntityList(await this.messagesRepository.findByCaseId(caseId));
  }

  /**
   * `messages.send`. Kierunek/nadawca stałe dla wiadomości wysyłanej przez
   * pracownika (DATABASE.md §24). CASE-008 jeśli sprawa w statusie
   * końcowym. Bez wysyłki e-mail/Portal — to reakcja na zdarzenie
   * (Notifications), poza zakresem tego serwisu.
   */
  async sendMessage(
    caseId: string,
    senderUserId: string,
    dto: { channel: MessageChannel; subject?: string; content: string },
  ): Promise<MessageEntity> {
    const { message, historyEntry, companyId } = await this.withLockedCase(
      caseId,
      async (tx, caseRecord) => {
        this.assertCaseIsActive(caseRecord);

        const message = await this.messagesRepository.create(
          caseId,
          {
            senderType: SenderType.Employee,
            senderUserId,
            direction: MessageDirection.Outbound,
            channel: dto.channel,
            subject: dto.subject,
            content: dto.content,
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

        return { message, historyEntry, companyId: caseRecord.companyId };
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

    return CaseMapper.messageToEntity(message);
  }

  // --- Portal Klienta / Replacement / Logistics — POZA zakresem Zadania 16, patrz raport końcowy (nie wśród zamówionych repo/metod/zdarzeń) ---

  async enablePortal(id: string): Promise<PortalCredentialEntity> {
    const accessCode = generatePortalAccessCode();
    const accessCodeHash = await bcrypt.hash(accessCode, BCRYPT_ROUNDS);
    const caseRecord = await this.casesRepository.enablePortalWithAccessCode(id, accessCodeHash);
    return { case: CaseMapper.toEntity(caseRecord), value: accessCode };
  }

  async disablePortal(id: string): Promise<CaseEntity> {
    return CaseMapper.toEntity(await this.casesRepository.disablePortal(id));
  }

  async generateSecureLink(id: string): Promise<PortalCredentialEntity> {
    const token = generatePortalSecureToken();
    const tokenHash = await bcrypt.hash(token, BCRYPT_ROUNDS);
    const caseRecord = await this.casesRepository.generateSecureToken(id, tokenHash);
    return { case: CaseMapper.toEntity(caseRecord), value: token };
  }

  async issueReplacement(caseItemId: string, productIdentifier: string, plannedReturnAt?: Date) {
    return CaseMapper.replacementToEntity(
      await this.casesRepository.issueReplacement(caseItemId, productIdentifier, plannedReturnAt),
    );
  }

  async returnReplacement(caseItemId: string, conditionOnReturn?: string) {
    return CaseMapper.replacementToEntity(
      await this.casesRepository.returnReplacement(caseItemId, conditionOnReturn),
    );
  }

  async findLogistics(caseId: string) {
    return CaseMapper.logisticsToEntityList(await this.casesRepository.findLogistics(caseId));
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
    work: (tx: Prisma.TransactionClient, caseRecord: CaseWithItems) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const caseRecord = await this.casesRepository.findByIdForUpdate(caseId, tx);
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
    targetStatus: CaseStatus,
    actorUserId: string,
    actorPermissions: string[],
    options: {
      reason?: string;
      requestedItems?: string[];
      messageText?: string;
      idempotentIfAlready?: boolean;
    } = {},
  ): Promise<CaseEntity> {
    const result = await this.withLockedCase(caseId, async (tx, caseRecord) => {
      if (options.idempotentIfAlready && caseRecord.status === targetStatus) {
        return { noop: true as const, entity: caseRecord };
      }

      let statusBeforeWaiting: CaseStatus | null = null;
      if (caseRecord.status === CaseStatus.OczekiwanieNaKlienta) {
        statusBeforeWaiting = await this.caseHistoryRepository.findLastStatusBeforeWaiting(
          caseRecord.id,
          tx,
        );
      }

      const transition = findTransition(caseRecord.status, targetStatus, { statusBeforeWaiting });
      if (!transition) {
        throw new AppException(
          ERROR_CODES.CASE_001.code,
          ERROR_CODES.CASE_001.message,
          ERROR_CODES.CASE_001.status,
        );
      }

      const requiredPermission = resolveTransitionPermission(transition, caseRecord.decision);
      if (!actorPermissions.includes(requiredPermission)) {
        throw new AppException(
          ERROR_CODES.RBAC_001.code,
          ERROR_CODES.RBAC_001.message,
          ERROR_CODES.RBAC_001.status,
          { meta: { requiredPermission } },
        );
      }

      if (transition.requiredCheck === 'CASE-009' && !caseRecord.decision) {
        throw new AppException(
          ERROR_CODES.CASE_009.code,
          ERROR_CODES.CASE_009.message,
          ERROR_CODES.CASE_009.status,
        );
      }
      // CASE-002 — kompletność dokumentacji wymaganej przez producenta.
      // Sprawdzane WYŁĄCZNIE na przejściach, które `STATE_MACHINE.md` tak oznacza
      // (`requiredCheck === 'CASE-002'`) — czyli tam, gdzie sprawa faktycznie rusza
      // dalej w proces. Wcześniej ta kontrola nie istniała: ustawienia producenta
      // dawało się zapisać, ale nic nie pilnowało, czy komplet dokumentów jest.
      if (transition.requiredCheck === 'CASE-002') {
        await this.assertRequiredDocuments(caseRecord, tx);
      }

      if (targetStatus === CaseStatus.Anulowana && !options.reason?.trim()) {
        throw new AppException(
          ERROR_CODES.CASE_011.code,
          ERROR_CODES.CASE_011.message,
          ERROR_CODES.CASE_011.status,
        );
      }

      const timestamps: { closedAt?: Date; cancelledAt?: Date; archivedAt?: Date } = {};
      if (targetStatus === CaseStatus.Zamknieta) timestamps.closedAt = new Date();
      if (targetStatus === CaseStatus.Anulowana) timestamps.cancelledAt = new Date();
      if (targetStatus === CaseStatus.Zarchiwizowana) timestamps.archivedAt = new Date();

      const isInfoRequest =
        targetStatus === CaseStatus.OczekiwanieNaKlienta &&
        !!options.requestedItems &&
        !!options.messageText;
      const nextAction = DEFAULT_NEXT_ACTION[targetStatus];

      const updated = await this.casesRepository.updateStatus(
        caseId,
        targetStatus,
        { ...timestamps, nextAction },
        tx,
      );

      // WORKFLOW.md §5 — powód anulowania zapisany jako Note (druga z dwóch udokumentowanych opcji); CaseHistory.newValue niesie spójnie nazwę statusu docelowego we wszystkich przejściach, nie powód.
      if (targetStatus === CaseStatus.Anulowana && options.reason) {
        await this.notesRepository.create(
          caseId,
          actorUserId,
          `Powód anulowania: ${options.reason}`,
          tx,
        );
      }

      const historyAction = isInfoRequest
        ? CaseHistoryAction.InfoRequested
        : historyActionForStatusChange(targetStatus);
      const historyEntry = await this.caseHistoryRepository.addEntry(
        caseId,
        {
          userId: actorUserId,
          action: historyAction,
          previousValue: caseRecord.status,
          newValue: targetStatus,
          visibleForCustomer: targetStatus !== CaseStatus.Zarchiwizowana,
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
          newValue: { status: targetStatus } as Prisma.InputJsonValue,
        },
        tx,
      );

      return {
        noop: false as const,
        entity: updated,
        historyEntry,
        isInfoRequest,
        previousStatus: caseRecord.status,
        complaintType: caseRecord.complaintType,
        companyId: caseRecord.companyId,
      };
    });

    if (result.noop) {
      return CaseMapper.toEntity(result.entity);
    }

    if (result.isInfoRequest) {
      await this.eventBus.publish(
        new DomainEvent<CaseInfoRequestedPayload>({
          eventName: EVENT_NAMES.CASE_INFO_REQUESTED,
          companyId: result.companyId,
          aggregateType: 'Case',
          aggregateId: caseId,
          actorUserId,
          correlationId: randomUUID(),
          payload: {
            requestedItems: options.requestedItems!,
            messageText: options.messageText!,
            caseHistoryId: result.historyEntry.id,
          },
        }),
      );
    } else {
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
            newStatus: targetStatus,
            complaintType: result.complaintType,
            automatic: false,
            caseHistoryId: result.historyEntry.id,
          },
        }),
      );
    }

    return CaseMapper.toEntity(result.entity);
  }

  /** CASE-013 — retry na `@unique` (`Case.caseNumber`); każda próba to osobna transakcja (Case+CaseHistory+AuditLog atomowo). */
  private async createWithUniqueCaseNumber(
    companyId: string,
    data: Parameters<CasesRepository['create']>[2],
    actorUserId: string,
  ): Promise<{ caseRecord: CaseWithItems; historyEntry: { id: string } }> {
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < CASE_NUMBER_MAX_ATTEMPTS; attempt += 1) {
      const sequence =
        (await this.casesRepository.countCreatedInYear(companyId, year)) + 1 + attempt;
      const caseNumber = `RMA/${year}/${String(sequence).padStart(5, '0')}`;
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

  /** BR-103/CASE-008 — sprawa w statusie końcowym nie może być dalej modyfikowana. Przejścia statusu SAME są policzone przez tabelę przejść (Zamknieta→Zarchiwizowana jest legalny), więc ta bramka NIE jest wołana w `performTransition`. */
  private assertCaseIsActive(caseRecord: CaseWithItems): void {
    if (!isActiveStatus(caseRecord.status)) {
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
      const manufacturer = await this.manufacturersService.findById(item.manufacturerId);

      if (manufacturer.minPhotos > 0 && photos < manufacturer.minPhotos) {
        missing.push(`zdjęcia (wymagane ${manufacturer.minPhotos}, dołączono ${photos})`);
      }
      if (manufacturer.requiresVideo && videos === 0) {
        missing.push('film z prezentacją usterki');
      }
      if (
        manufacturer.requiresProofOfPurchase &&
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
    item: { serialNumber?: string; frameNumber?: string; purchaseProofNumber?: string },
  ): Promise<void> {
    if (!manufacturerId) return;
    const manufacturer = await this.manufacturersService.findById(manufacturerId);

    if (manufacturer.requiresSerialNumber && !item.serialNumber?.trim()) {
      throw new AppException(
        ERROR_CODES.CASE_004.code,
        ERROR_CODES.CASE_004.message,
        ERROR_CODES.CASE_004.status,
        {
          field: 'serialNumber',
        },
      );
    }
    if (manufacturer.requiresFrameNumber && !item.frameNumber?.trim()) {
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
    if (manufacturer.requiresProofOfPurchase && !item.purchaseProofNumber?.trim()) {
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

  private async findCaseOrThrow(id: string): Promise<CaseWithItems> {
    const caseRecord = await this.casesRepository.findById(id);
    if (!caseRecord) {
      throw new AppException(
        ERROR_CODES.CASE_012.code,
        ERROR_CODES.CASE_012.message,
        ERROR_CODES.CASE_012.status,
      );
    }
    return caseRecord;
  }
}
