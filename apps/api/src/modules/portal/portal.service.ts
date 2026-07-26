import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DocumentStatus, DocumentVisibility, MessageChannel, MessageDirection, SenderType } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { CasesRepository } from '../cases/cases.repository';
import { DocumentsService } from '../documents/documents.service';
import { UsersRepository } from '../users/users.repository';
import { PortalLoginTokenDto } from './dto/portal-login-token.dto';
import { PortalLoginDto } from './dto/portal-login.dto';
import { PortalCaseViewEntity } from './entities/portal-case-view.entity';
import { PortalDocumentEntity } from './entities/portal-document.entity';
import { PortalHistoryEntryEntity } from './entities/portal-history-entry.entity';
import { PortalMessageEntity } from './entities/portal-message.entity';
import { PortalSessionEntity } from './entities/portal-session.entity';
import { PortalMapper } from './mappers/portal.mapper';
import { PortalLoginThrottleService } from './services/portal-login-throttle.service';

/**
 * Integracja z `Cases`/`Documents` (Zadanie 9 pkt 1) idzie przez wyeksportowane
 * providery tych modułów, nie przez duplikowanie zapytań Prisma tutaj —
 * `PortalModule` importuje `CasesModule` (korzysta z `CasesRepository`) i
 * `DocumentsModule` (korzysta z `DocumentsService` — jedyne, co ten moduł
 * eksportuje, patrz `documents.module.ts`). Filtrowanie widoczności klienckiej
 * (BR-079/BR-080) żyje WYŁĄCZNIE tutaj — żadna z tych zależności nie wie
 * o istnieniu Portalu.
 *
 * TODO przy implementacji logiki biznesowej: `CaseHistory` (`MessageSent`)
 * i zdarzenie `case.customer_replied` dla `sendMessage` (WORKFLOW.md §6
 * poz. 5) — dziś wyłącznie zapis `Message`, bez powrotu ze statusu
 * `OczekiwanieNaKlienta` i bez `Notification` do właściciela.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly casesRepository: CasesRepository,
    private readonly documentsService: DocumentsService,
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
      throw new AppException(ERROR_CODES.PORTAL_001.code, ERROR_CODES.PORTAL_001.message, ERROR_CODES.PORTAL_001.status);
    }
    if (!caseRecord.clientPortalEnabled) {
      await this.throttle.recordFailure(dto.caseNumber, ip);
      throw new AppException(ERROR_CODES.PORTAL_002.code, ERROR_CODES.PORTAL_002.message, ERROR_CODES.PORTAL_002.status);
    }
    const codeMatches = caseRecord.clientAccessCodeHash
      ? await bcrypt.compare(dto.accessCode, caseRecord.clientAccessCodeHash)
      : false;
    if (!codeMatches) {
      await this.throttle.recordFailure(dto.caseNumber, ip);
      throw new AppException(ERROR_CODES.PORTAL_001.code, ERROR_CODES.PORTAL_001.message, ERROR_CODES.PORTAL_001.status);
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
      throw new AppException(ERROR_CODES.PORTAL_004.code, ERROR_CODES.PORTAL_004.message, ERROR_CODES.PORTAL_004.status);
    }
    if (caseRecord.clientAccessTokenUsed) {
      throw new AppException(ERROR_CODES.PORTAL_005.code, ERROR_CODES.PORTAL_005.message, ERROR_CODES.PORTAL_005.status);
    }
    const tokenMatches = await bcrypt.compare(dto.token, caseRecord.clientAccessTokenHash);
    if (!tokenMatches) {
      await this.throttle.recordFailure(dto.caseNumber, ip);
      throw new AppException(ERROR_CODES.PORTAL_004.code, ERROR_CODES.PORTAL_004.message, ERROR_CODES.PORTAL_004.status);
    }

    await this.throttle.reset(dto.caseNumber, ip);
    await this.casesRepository.markPortalTokenUsed(caseRecord.id);
    return this.issueSession(caseRecord.id);
  }

  async getCaseView(caseId: string): Promise<PortalCaseViewEntity> {
    const caseRecord = await this.getCaseOrThrow(caseId);
    const owner = caseRecord.ownerId ? await this.usersRepository.findById(caseRecord.ownerId) : null;
    return PortalMapper.toCaseView(caseRecord, owner ? { firstName: owner.firstName, lastName: owner.lastName } : null);
  }

  /** BR-079 — wyłącznie `visibleForCustomer=true`. */
  async getHistory(caseId: string): Promise<PortalHistoryEntryEntity[]> {
    await this.getCaseOrThrow(caseId);
    const entries = await this.casesRepository.findHistory(caseId);
    return PortalMapper.toHistoryList(entries.filter((entry) => entry.visibleForCustomer));
  }

  /** BR-080 + BR-020 — wyłącznie `visibility=Public` i `status=Aktywny` (dokument błędny nie powinien trafić do klienta). */
  async getDocuments(caseId: string): Promise<PortalDocumentEntity[]> {
    await this.getCaseOrThrow(caseId);
    const documents = await this.documentsService.findAllForCase(caseId);
    return PortalMapper.toDocumentList(
      documents.filter((doc) => doc.visibility === DocumentVisibility.Public && doc.status === DocumentStatus.Aktywny),
    );
  }

  /** RBAC.md §3a — tworzy WYŁĄCZNIE `Message`, nigdy nie zmienia innych danych sprawy. */
  async sendMessage(caseId: string, content: string): Promise<PortalMessageEntity> {
    await this.getCaseOrThrow(caseId);
    const message = await this.casesRepository.addMessage(caseId, {
      senderType: SenderType.Customer,
      direction: MessageDirection.Inbound,
      channel: MessageChannel.Portal,
      content,
    });
    return { id: message.id, content: message.content, sentAt: message.sentAt };
  }

  private async getCaseOrThrow(caseId: string) {
    const caseRecord = await this.casesRepository.findById(caseId);
    // Token ważny, ale sprawa zniknęła/portal wyłączono w międzyczasie — PORTAL-002,
    // nie CASE-012 (klient nie powinien dostać komunikatu formułowanego dla pracownika).
    if (!caseRecord || !caseRecord.clientPortalEnabled) {
      throw new AppException(ERROR_CODES.PORTAL_002.code, ERROR_CODES.PORTAL_002.message, ERROR_CODES.PORTAL_002.status);
    }
    return caseRecord;
  }

  private async issueSession(caseId: string): Promise<PortalSessionEntity> {
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
