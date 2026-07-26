import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CaseHistoryAction, DocumentStatus, DocumentVisibility, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditRepository } from '../audit/audit.repository';
import { CasesService } from '../cases/cases.service';
import { DocumentMarkedInvalidPayload, DocumentUploadedPayload } from '../../events/contracts/document.events';
import { DomainEvent } from '../../events/domain-event.base';
import { EVENT_BUS, IEventBus } from '../../events/event-bus.interface';
import { EVENT_NAMES } from '../../events/event-names.const';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentsRepository } from './documents.repository';
import { DocumentEntity } from './entities/document.entity';
import { DocumentMapper } from './mappers/document.mapper';

const DOCUMENT_AUDIT_FIELDS = ['fileName', 'fileType', 'mimeType', 'fileSize', 'storagePath', 'category', 'visibility'] as const;

function pick(obj: object, keys: readonly string[]): Prisma.InputJsonValue {
  const o = obj as Record<string, unknown>;
  return Object.fromEntries(keys.map((key) => [key, o[key] ?? null])) as Prisma.InputJsonValue;
}

/**
 * `attachToCase()` z zakresu zadania NIE jest osobną metodą — w tym
 * schemacie (`DATABASE.md` §25) `Document.caseId` jest polem WYMAGANYM,
 * ustawianym raz, przy tworzeniu. Nie istnieje stan "dokument bez sprawy",
 * do którego dało by się później "dołączyć" — upload JEST przypisaniem do
 * sprawy. Osobna metoda o identycznej treści byłaby duplikacją logiki
 * (dokładnie to, czego punkt 11 zadania każe unikać), więc `uploadDocument()`
 * poniżej pełni obie role jednocześnie — udokumentowane w jej komentarzu.
 *
 * `detachFromCase()` — NIE zaimplementowane: RBAC.md nie zna żadnego
 * uprawnienia do tego, `CaseHistoryAction` nie ma wartości dla takiej
 * operacji (zamknięty enum, DATABASE.md/EVENTS.md §10.2 — nowa wartość to
 * migracja schematu, zabroniona w tym zadaniu), a żaden dokument
 * architektury nie opisuje odpinania dokumentu od sprawy. Warunek zadania
 * ("tylko jeśli istnieje w dokumentacji") jest tu wprost niespełniony.
 *
 * `deleteDocument()` — NIE zaimplementowane jako fizyczne usunięcie: BR-020
 * i DATABASE.md §25 wprost zabraniają `DELETE` na `Document` ("dokumenty
 * błędne są oznaczane status=Bledny, nie usuwane"). Udokumentowanym
 * odpowiednikiem "usunięcia" jest WYŁĄCZNIE `markInvalid()` — już
 * zaimplementowane w scaffoldzie, tutaj podniesione do pełnego standardu
 * (Audit/CaseHistory/Events/transakcja). `document.deleted` z listy zdarzeń
 * zadania świadomie NIE jest publikowane z tego samego powodu —
 * `document.marked_invalid` (już w `EVENTS.md` §5.2) jest właściwym,
 * udokumentowanym odpowiednikiem i JEST publikowane.
 *
 * Checksum — brak pola w schemacie (`DATABASE.md` §25 nie wymienia go wcale)
 * — nie dodano (zmiana modelu danych, zabroniona w tym zadaniu).
 *
 * FILE-001/002/004 (rozmiar/limit zdjęć/min. 2 zdjęcia, `Manufacturer.
 * maxAttachmentSizeMb`/`maxPhotos`, `WORKFLOW.md` §8) świadomie NIE
 * egzekwowane tutaj — wymagają rozwiązania producenta danej pozycji
 * (`CaseItem.manufacturerId` → `Manufacturer`), co wykracza poza sekcję
 * "Walidacja" tego zadania (Case istnieje / dostęp do sprawy / typ
 * dokumentu poprawny — to trzecie już pokrywa `@IsEnum(DocumentType)` w
 * DTO). Ten sam zakres co CASE-002 pominięty w Zadaniu 16.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsRepository: DocumentsRepository,
    private readonly auditRepository: AuditRepository,
    private readonly casesService: CasesService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async listDocuments(caseId: string, companyId: string): Promise<DocumentEntity[]> {
    await this.assertCaseAccessible(caseId, companyId);
    return DocumentMapper.toEntityList(await this.documentsRepository.findAllForCase(caseId));
  }

  async getDocument(caseId: string, documentId: string, companyId: string): Promise<DocumentEntity> {
    await this.assertCaseAccessible(caseId, companyId);
    return DocumentMapper.toEntity(await this.findDocumentOrThrow(documentId, caseId));
  }

  /**
   * `documents.upload`. Weryfikuje: sprawa istnieje i należy do firmy
   * aktora ("dostęp do sprawy" — izolacja dzierżawy, BR-086), a
   * `caseItemId` (jeśli podane) należy do TEJ sprawy (reużywa
   * `CaseEntity.items` już pobrane przy weryfikacji sprawy — bez
   * dodatkowego zapytania/eksportu kolejnego repozytorium). Zapis
   * `Document` + `CaseHistory(DocumentAdded)` + `AuditLog` atomowo;
   * `document.uploaded` publikowane DOPIERO po commicie.
   */
  async uploadDocument(caseId: string, uploadedById: string, companyId: string, dto: CreateDocumentDto): Promise<DocumentEntity> {
    const caseEntity = await this.assertCaseAccessible(caseId, companyId);
    if (dto.caseItemId && !caseEntity.items.some((item) => item.id === dto.caseItemId)) {
      throw new NotFoundException();
    }

    const { document, historyEntry } = await this.prisma.$transaction(async (tx) => {
      const document = await this.documentsRepository.create(caseId, uploadedById, dto, tx);

      // WORKFLOW.md §6 poz. 18 — visibleForCustomer WYŁĄCZNIE gdy Document.visibility=Public (BR-079/BR-080).
      const historyEntry = await this.casesService.appendCaseHistory(
        caseId,
        { userId: uploadedById, action: CaseHistoryAction.DocumentAdded, newValue: document.fileName, visibleForCustomer: document.visibility === DocumentVisibility.Public },
        tx,
      );

      await this.auditRepository.create(
        { companyId, userId: uploadedById, action: 'DOCUMENT_UPLOADED', entityType: 'Document', entityId: document.id, newValue: pick(document, DOCUMENT_AUDIT_FIELDS) },
        tx,
      );

      return { document, historyEntry };
    });

    await this.eventBus.publish(
      new DomainEvent<DocumentUploadedPayload>({
        eventName: EVENT_NAMES.DOCUMENT_UPLOADED,
        companyId,
        aggregateType: 'Document',
        aggregateId: document.id,
        actorUserId: uploadedById,
        correlationId: randomUUID(),
        payload: { documentId: document.id, caseItemId: document.caseItemId, category: document.category, visibility: document.visibility, fileType: document.fileType, caseHistoryId: historyEntry.id },
      }),
    );

    return DocumentMapper.toEntity(document);
  }

  /**
   * `documents.markInvalid`. Odpowiednik "usunięcia" dozwolony przez BR-020
   * (patrz komentarz klasy). Idempotentne — jeśli dokument jest już
   * `Bledny`, zwraca go bez zmian (bez podwójnego wpisu audytu/historii/
   * zdarzenia), wzorzec z `CasesService.cancel/archive` (Zadanie 16).
   */
  async markInvalid(caseId: string, documentId: string, companyId: string, actorUserId: string, reason: string): Promise<DocumentEntity> {
    await this.assertCaseAccessible(caseId, companyId);
    const before = await this.findDocumentOrThrow(documentId, caseId);

    if (before.status === DocumentStatus.Bledny) {
      return DocumentMapper.toEntity(before);
    }

    const { document, historyEntry } = await this.prisma.$transaction(async (tx) => {
      const document = await this.documentsRepository.markInvalid(documentId, tx);

      const historyEntry = await this.casesService.appendCaseHistory(
        caseId,
        { userId: actorUserId, action: CaseHistoryAction.DocumentMarkedInvalid, previousValue: before.status, newValue: reason, visibleForCustomer: before.visibility === DocumentVisibility.Public },
        tx,
      );

      await this.auditRepository.create(
        { companyId, userId: actorUserId, action: 'DOCUMENT_MARKED_INVALID', entityType: 'Document', entityId: documentId, previousValue: { status: before.status } as Prisma.InputJsonValue, newValue: { status: document.status, reason } as Prisma.InputJsonValue },
        tx,
      );

      return { document, historyEntry };
    });

    await this.eventBus.publish(
      new DomainEvent<DocumentMarkedInvalidPayload>({
        eventName: EVENT_NAMES.DOCUMENT_MARKED_INVALID,
        companyId,
        aggregateType: 'Document',
        aggregateId: documentId,
        actorUserId,
        correlationId: randomUUID(),
        payload: { documentId, reason, caseHistoryId: historyEntry.id },
      }),
    );

    return DocumentMapper.toEntity(document);
  }

  /** CASE-012 (goły `NotFoundException`, patrz `CasesService`) jeśli sprawa nie istnieje; izolacja dzierżawy (BR-086) jeśli należy do innej firmy. Zwraca `CaseEntity`, żeby wołający mógł od razu zweryfikować `caseItemId` bez kolejnego zapytania. */
  private async assertCaseAccessible(caseId: string, companyId: string) {
    const caseEntity = await this.casesService.findById(caseId);
    if (caseEntity.companyId !== companyId) {
      throw new NotFoundException();
    }
    return caseEntity;
  }

  /** Goły `NotFoundException()` — brak kodu DOCUMENT-*/FILE-* dla "nie znaleziono" w ERROR_CODES.md (ten sam, już zaakceptowany brak co w innych modułach). Sprawdza też, że dokument należy do PODANEJ sprawy (spójność URL zagnieżdżonego `/cases/:caseId/documents/:documentId`). */
  private async findDocumentOrThrow(documentId: string, caseId: string) {
    const document = await this.documentsRepository.findById(documentId);
    if (!document || document.caseId !== caseId) {
      throw new NotFoundException();
    }
    return document;
  }
}
