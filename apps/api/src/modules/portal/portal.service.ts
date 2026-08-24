import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  CaseHistoryAction,
  DocumentCategory,
  DocumentStatus,
  DocumentType,
  DocumentVisibility,
  MessageChannel,
  MessageDirection,
  SenderType,
} from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { CaseStatusesService } from '../case-statuses/case-statuses.service';
import { CaseConsentRepository } from '../cases/case-consent.repository';
import { CaseHistoryRepository } from '../cases/case-history.repository';
import { CasesRepository } from '../cases/cases.repository';
import { CasesService } from '../cases/cases.service';
import { CaseCompletenessEntity } from '../cases/entities/case-completeness.entity';
import { MessagesRepository } from '../cases/messages.repository';
import { CompaniesService } from '../companies/companies.service';
import { DocumentsService } from '../documents/documents.service';
import { UsersRepository } from '../users/users.repository';
import { PortalLoginTokenDto } from './dto/portal-login-token.dto';
import { PortalLoginDto } from './dto/portal-login.dto';
import { RecordPortalConsentDto } from './dto/record-portal-consent.dto';
import { UpdatePortalCaseItemDto } from './dto/update-portal-case-item.dto';
import { PortalCaseViewEntity } from './entities/portal-case-view.entity';
import { PortalDocumentEntity } from './entities/portal-document.entity';
import { PortalHistoryEntryEntity } from './entities/portal-history-entry.entity';
import { PortalMessageEntity } from './entities/portal-message.entity';
import { PortalSessionEntity } from './entities/portal-session.entity';
import { PortalMapper } from './mappers/portal.mapper';
import { GDPR_CLAUSE_VERSION } from '../cases/gdpr.constants';
import { PortalLoginThrottleService } from './services/portal-login-throttle.service';

export interface PortalUploadedFileInfo {
  caseItemId?: string;
  category?: DocumentCategory;
  fileName: string;
  fileType: DocumentType;
  mimeType: string;
  fileSize: number;
  storagePath: string;
}

/**
 * Integracja z `Cases`/`Documents`/`Companies` idzie przez wyeksportowane
 * providery tych modułów, nie przez duplikowanie zapytań Prisma tutaj.
 * Filtrowanie widoczności klienckiej (BR-079/BR-080) żyje WYŁĄCZNIE tutaj —
 * żadna z tych zależności nie wie o istnieniu Portalu.
 *
 * Rozszerzenie "Portal Klienta 1.0" (dokończenie modułu, patrz raport
 * gotowości SmartRMA 1.0) domyka historyczny TODO tego pliku:
 * `sendMessage`/uzupełnienie danych zapisują `CaseHistory` i pozwalają
 * klientowi realnie uzupełnić brakujące dane (pola + załączniki) zamiast
 * wyłącznie czytać stan sprawy. Cała logika "co jeszcze brakuje" żyje w
 * `CasesService` (`getCompleteness`/`updatePortalItemFields`) — ten serwis
 * tylko orkiestruje wywołania w kontekście zaufanego `caseId` z tokenu
 * portalu, nie duplikuje logiki biznesowej. Status Workflow Refactor —
 * dawny automatyczny powrót statusu z `OczekiwanieNaKlienta`
 * (`resumeIfComplete`) usunięty: nie ma już statusu "oczekiwania", z
 * którego trzeba by wracać.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly casesRepository: CasesRepository,
    private readonly casesService: CasesService,
    private readonly caseHistoryRepository: CaseHistoryRepository,
    private readonly messagesRepository: MessagesRepository,
    private readonly documentsService: DocumentsService,
    private readonly companiesService: CompaniesService,
    private readonly caseConsentRepository: CaseConsentRepository,
    private readonly caseStatusesService: CaseStatusesService,
    private readonly usersRepository: UsersRepository,
    private readonly throttle: PortalLoginThrottleService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** BR-077/078/BR-081 — PORTAL-001/002/003. */
  async loginWithAccessCode(dto: PortalLoginDto, ip: string): Promise<PortalSessionEntity> {
    await this.throttle.assertNotLocked(dto.caseNumber, ip);

    const caseRecord = await this.casesRepository.findByCaseNumber(dto.caseNumber);
    if (!caseRecord) {
      await this.throttle.recordFailure(dto.caseNumber, ip);
      throw new AppException(
        ERROR_CODES.PORTAL_001.code,
        ERROR_CODES.PORTAL_001.message,
        ERROR_CODES.PORTAL_001.status,
      );
    }
    if (!caseRecord.clientPortalEnabled) {
      await this.throttle.recordFailure(dto.caseNumber, ip);
      throw new AppException(
        ERROR_CODES.PORTAL_002.code,
        ERROR_CODES.PORTAL_002.message,
        ERROR_CODES.PORTAL_002.status,
      );
    }
    const codeMatches = caseRecord.clientAccessCodeHash
      ? await bcrypt.compare(dto.accessCode, caseRecord.clientAccessCodeHash)
      : false;
    if (!codeMatches) {
      await this.throttle.recordFailure(dto.caseNumber, ip);
      throw new AppException(
        ERROR_CODES.PORTAL_001.code,
        ERROR_CODES.PORTAL_001.message,
        ERROR_CODES.PORTAL_001.status,
      );
    }

    await this.throttle.reset(dto.caseNumber, ip);
    await this.casesRepository.touchPortalLastLogin(caseRecord.id);
    return this.issueSession(caseRecord.id);
  }

  /** BR-077 — logowanie bezpiecznym linkiem; token jednorazowy (PORTAL-004/005). */
  async loginWithSecureToken(dto: PortalLoginTokenDto, ip: string): Promise<PortalSessionEntity> {
    await this.throttle.assertNotLocked(dto.caseNumber, ip);

    const caseRecord = await this.casesRepository.findByCaseNumber(dto.caseNumber);
    if (!caseRecord || !caseRecord.clientAccessTokenHash) {
      await this.throttle.recordFailure(dto.caseNumber, ip);
      throw new AppException(
        ERROR_CODES.PORTAL_004.code,
        ERROR_CODES.PORTAL_004.message,
        ERROR_CODES.PORTAL_004.status,
      );
    }
    if (caseRecord.clientAccessTokenUsed) {
      throw new AppException(
        ERROR_CODES.PORTAL_005.code,
        ERROR_CODES.PORTAL_005.message,
        ERROR_CODES.PORTAL_005.status,
      );
    }
    const tokenMatches = await bcrypt.compare(dto.token, caseRecord.clientAccessTokenHash);
    if (!tokenMatches) {
      await this.throttle.recordFailure(dto.caseNumber, ip);
      throw new AppException(
        ERROR_CODES.PORTAL_004.code,
        ERROR_CODES.PORTAL_004.message,
        ERROR_CODES.PORTAL_004.status,
      );
    }

    await this.throttle.reset(dto.caseNumber, ip);
    await this.casesRepository.markPortalTokenUsed(caseRecord.id);
    return this.issueSession(caseRecord.id);
  }

  /** Ekspozycja `companyId` sprawy zaufanej z tokenu — wyłącznie do zorganizowania ścieżki zapisu pliku PRZED walidacją w `uploadDocument` (patrz `PortalController.uploadDocument`). */
  async resolveCompanyId(caseId: string): Promise<string> {
    const caseRecord = await this.getCaseOrThrow(caseId);
    return caseRecord.companyId;
  }

  async getCaseView(caseId: string): Promise<PortalCaseViewEntity> {
    const caseRecord = await this.getCaseOrThrow(caseId);
    const [owner, company, latestConsent, unreadMessagesCount, statusDef] = await Promise.all([
      caseRecord.ownerId ? this.usersRepository.findById(caseRecord.ownerId) : null,
      this.companiesService.findByIdTrusted(caseRecord.companyId),
      this.caseConsentRepository.findLatestForCase(caseId),
      this.messagesRepository.countUnread(caseId, MessageDirection.Outbound),
      this.caseStatusesService.findByCode(caseRecord.status, caseRecord.companyId),
    ]);
    return PortalMapper.toCaseView(
      caseRecord,
      statusDef?.portalStage ?? null,
      owner ? { firstName: owner.firstName, lastName: owner.lastName } : null,
      company,
      latestConsent !== null,
      unreadMessagesCount,
    );
  }

  /** Wołane, gdy klient otwiera zakładkę Wiadomości w Portalu — zeruje znacznik nieprzeczytanych wiadomości od pracownika (`Outbound`), analogicznie do `CasesService.markMessagesRead` po stronie pracownika. */
  async markMessagesRead(caseId: string): Promise<void> {
    await this.getCaseOrThrow(caseId);
    await this.messagesRepository.markAllReadForCase(caseId, MessageDirection.Outbound);
  }

  /** BR-079 — wyłącznie `visibleForCustomer=true`. */
  async getHistory(caseId: string): Promise<PortalHistoryEntryEntity[]> {
    await this.getCaseOrThrow(caseId);
    const entries = await this.caseHistoryRepository.findByCaseId(caseId);
    return PortalMapper.toHistoryList(entries.filter((entry) => entry.visibleForCustomer));
  }

  /** BR-080 + BR-020 — wyłącznie `visibility=Public` i `status=Aktywny` (dokument błędny nie powinien trafić do klienta). */
  async getDocuments(caseId: string): Promise<PortalDocumentEntity[]> {
    const caseRecord = await this.getCaseOrThrow(caseId);
    const documents = await this.documentsService.listDocuments(caseId, caseRecord.companyId);
    return PortalMapper.toDocumentList(
      documents.filter(
        (doc) =>
          doc.visibility === DocumentVisibility.Public && doc.status === DocumentStatus.Aktywny,
      ),
    );
  }

  async getMessages(caseId: string): Promise<PortalMessageEntity[]> {
    await this.getCaseOrThrow(caseId);
    const messages = await this.messagesRepository.findByCaseIdWithDocuments(caseId);
    return messages.map((m) => PortalMapper.toMessage(m, m.documents));
  }

  /**
   * RBAC.md §3a — tworzy `Message` + wpis w historii (`MessageSent`, widoczny dla
   * klienta — to JEGO wiadomość). Status Workflow Refactor — nie sprawdza już
   * "czy sprawa jest teraz kompletna"/nie wznawia automatycznie statusu
   * (dawny `resumeIfComplete`, usunięty z `CasesService`) — pracownik widzi
   * odpowiedź klienta i sam decyduje o dalszych krokach.
   */
  async sendMessage(
    caseId: string,
    content: string,
    documentIds?: string[],
  ): Promise<PortalMessageEntity> {
    const caseRecord = await this.getCaseOrThrow(caseId);

    const documents: { id: string; fileName: string }[] = [];
    for (const documentId of documentIds ?? []) {
      const document = await this.documentsService.getDocument(
        caseId,
        documentId,
        caseRecord.companyId,
      );
      documents.push({ id: document.id, fileName: document.fileName });
    }

    const message = await this.messagesRepository.create(caseId, {
      senderType: SenderType.Customer,
      direction: MessageDirection.Inbound,
      channel: MessageChannel.Portal,
      content,
      documentIds,
    });

    await this.casesService.appendCaseHistory(caseId, {
      userId: null,
      action: CaseHistoryAction.MessageSent,
      newValue: content.slice(0, 200),
      visibleForCustomer: true,
    });

    return PortalMapper.toMessage(message, documents);
  }

  /** Portal Klienta — "Uzupełnienie reklamacji": checklist braków wg wymagań producenta. */
  async getCompleteness(caseId: string): Promise<CaseCompletenessEntity> {
    const caseRecord = await this.getCaseOrThrow(caseId);
    return this.casesService.getCompleteness(caseId, caseRecord.companyId);
  }

  /** Uzupełnienie numeru seryjnego/ramy/dowodu zakupu (patrz `CasesService.updatePortalItemFields`). */
  async updateItemFields(
    caseId: string,
    itemId: string,
    dto: UpdatePortalCaseItemDto,
  ): Promise<PortalCaseViewEntity> {
    const caseRecord = await this.getCaseOrThrow(caseId);
    await this.casesService.updatePortalItemFields(caseId, caseRecord.companyId, itemId, dto);
    return this.getCaseView(caseId);
  }

  /**
   * Upload załącznika przez klienta — `visibility` ZAWSZE `Public` (klient widzi
   * własny plik, pracownik widzi wszystko niezależnie od widoczności), niezależnie od
   * tego, co ewentualnie podano w DTO (klientowi nie ufamy w tej decyzji).
   */
  async uploadDocument(
    caseId: string,
    file: PortalUploadedFileInfo,
  ): Promise<PortalDocumentEntity> {
    const caseRecord = await this.getCaseOrThrow(caseId);
    const document = await this.documentsService.uploadDocument(
      caseId,
      null,
      caseRecord.companyId,
      {
        caseItemId: file.caseItemId,
        category: file.category ?? DocumentCategory.Other,
        visibility: DocumentVisibility.Public,
        fileName: file.fileName,
        fileType: file.fileType,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        storagePath: file.storagePath,
      },
    );
    return PortalMapper.toDocument(document);
  }

  /**
   * Sekcja RODO — zapisuje zgodę WRAZ z metadanymi audytowymi (data/godzina z
   * `createdAt`, IP, wersja klauzuli, migawka linku/wersji polityki prywatności w
   * chwili wyrażenia zgody — patrz komentarz przy modelu `CaseConsent`).
   */
  async recordConsent(
    caseId: string,
    dto: RecordPortalConsentDto,
    ip: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const caseRecord = await this.getCaseOrThrow(caseId);
    const company = await this.companiesService.findByIdTrusted(caseRecord.companyId);
    await this.caseConsentRepository.create({
      caseId,
      companyId: caseRecord.companyId,
      requiredConsent: dto.requiredConsent,
      marketingConsent: dto.marketingConsent ?? false,
      documentSharingConsent: dto.documentSharingConsent ?? false,
      clauseVersion: GDPR_CLAUSE_VERSION,
      privacyPolicyUrl: company.privacyPolicyUrl,
      privacyPolicyVersion: company.privacyPolicyVersion,
      ipAddress: ip,
      userAgent,
    });
  }

  private async getCaseOrThrow(caseId: string) {
    const caseRecord = await this.casesRepository.findByIdTrusted(caseId);
    // Token ważny, ale sprawa zniknęła/portal wyłączono w międzyczasie — PORTAL-002,
    // nie CASE-012 (klient nie powinien dostać komunikatu formułowanego dla pracownika).
    if (!caseRecord || !caseRecord.clientPortalEnabled) {
      throw new AppException(
        ERROR_CODES.PORTAL_002.code,
        ERROR_CODES.PORTAL_002.message,
        ERROR_CODES.PORTAL_002.status,
      );
    }
    return caseRecord;
  }

  /**
   * Publiczne (nie `private`) — Publiczny Formularz Reklamacyjny (`IntakeService`)
   * wystawia sesję Portalu OD RAZU po utworzeniu sprawy, bez wymuszania na kliencie
   * ponownego logowania kodem, który dopiero co sam podał. `caseId` pochodzi tam z
   * właśnie utworzonego, zaufanego rekordu — ten sam poziom zaufania co logowanie
   * kodem/linkiem powyżej.
   */
  async issueSession(caseId: string): Promise<PortalSessionEntity> {
    const expiresIn = this.config.get<string>('portal.expiresIn')!;
    const accessToken = await this.jwtService.signAsync(
      { caseId, type: 'portal' },
      { secret: this.config.get<string>('portal.secret'), expiresIn },
    );
    return { accessToken, expiresIn: this.parseExpiresInSeconds(expiresIn) };
  }

  private parseExpiresInSeconds(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value);
    if (!match) return 1800;
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return Number(match[1]) * multipliers[match[2]];
  }
}
