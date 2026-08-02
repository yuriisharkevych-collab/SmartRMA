import {
  CaseHistory,
  CaseItem,
  Logistics,
  Message,
  Note,
  Prisma,
  ReplacementProduct,
} from '@prisma/client';
import { CaseHistoryEntity } from '../entities/case-history.entity';
import { CaseItemEntity } from '../entities/case-item.entity';
import { CaseEntity } from '../entities/case.entity';
import { LogisticsEntity } from '../entities/logistics.entity';
import { MessageEntity } from '../entities/message.entity';
import { NoteEntity } from '../entities/note.entity';
import { ReplacementProductEntity } from '../entities/replacement-product.entity';

export type CaseWithItems = Prisma.CaseGetPayload<{ include: { items: true } }>;

export class CaseMapper {
  /**
   * Pola wyliczane JAWNIE, nigdy `{ ...caseRecord }`.
   *
   * Spread przepuszczał do odpowiedzi API `clientAccessCodeHash` i
   * `clientAccessTokenHash` — bcrypt-hashe kodu dostępu klienta do Portalu i
   * tokenu jednorazowego linku. TypeScript tego nie wyłapał, bo właściwości
   * pochodzące ze spreadu są zwolnione z kontroli nadmiarowych pól, więc
   * niezgodność z `CaseEntity` przechodziła bez błędu kompilacji.
   *
   * Skutek: każdy, kto mógł odczytać sprawę (łącznie z rolą „Odczyt"),
   * dostawał hash krótkiego kodu dostępu — materiał do ataku offline.
   * Wykryte przy porównaniu ekranu z prototypem, naprawione tutaj.
   */
  static toEntity(caseRecord: CaseWithItems): CaseEntity {
    return {
      id: caseRecord.id,
      companyId: caseRecord.companyId,
      shopId: caseRecord.shopId,
      caseNumber: caseRecord.caseNumber,
      customerId: caseRecord.customerId,
      ownerId: caseRecord.ownerId,

      complaintType: caseRecord.complaintType,
      submissionMode: caseRecord.submissionMode,
      source: caseRecord.source,

      requestedResolution: caseRecord.requestedResolution,
      description: caseRecord.description,
      customerStatement: caseRecord.customerStatement,

      status: caseRecord.status,
      priority: caseRecord.priority,

      decision: caseRecord.decision,
      decisionAt: caseRecord.decisionAt,
      decisionByUserId: caseRecord.decisionByUserId,

      nextAction: caseRecord.nextAction,
      nextActionDueDate: caseRecord.nextActionDueDate,

      requiresManagerApproval: caseRecord.requiresManagerApproval,
      isException: caseRecord.isException,

      clientPortalEnabled: caseRecord.clientPortalEnabled,
      clientLastLoginAt: caseRecord.clientLastLoginAt,

      createdAt: caseRecord.createdAt,
      closedAt: caseRecord.closedAt,
      cancelledAt: caseRecord.cancelledAt,
      archivedAt: caseRecord.archivedAt,

      items: caseRecord.items.map(CaseMapper.itemToEntity),
    };
  }

  static toEntityList(cases: CaseWithItems[]): CaseEntity[] {
    return cases.map(CaseMapper.toEntity);
  }

  static itemToEntity(item: CaseItem): CaseItemEntity {
    const {
      id,
      caseId,
      orderItemId,
      productId,
      manufacturerId,
      description,
      quantity,
      serialNumber,
      frameNumber,
      purchaseDate,
      purchaseProofNumber,
    } = item;
    return {
      id,
      caseId,
      orderItemId,
      productId,
      manufacturerId,
      description,
      quantity,
      serialNumber,
      frameNumber,
      purchaseDate,
      purchaseProofNumber,
    };
  }

  static historyToEntity(entry: CaseHistory): CaseHistoryEntity {
    const { id, caseId, userId, action, previousValue, newValue, visibleForCustomer, createdAt } =
      entry;
    return { id, caseId, userId, action, previousValue, newValue, visibleForCustomer, createdAt };
  }

  static historyToEntityList(entries: CaseHistory[]): CaseHistoryEntity[] {
    return entries.map(CaseMapper.historyToEntity);
  }

  static noteToEntity(note: Note): NoteEntity {
    const { id, caseId, userId, content, createdAt } = note;
    return { id, caseId, userId, content, createdAt };
  }

  static noteToEntityList(notes: Note[]): NoteEntity[] {
    return notes.map(CaseMapper.noteToEntity);
  }

  static messageToEntity(message: Message): MessageEntity {
    const {
      id,
      caseId,
      senderType,
      senderUserId,
      direction,
      channel,
      subject,
      content,
      sentAt,
      readAt,
    } = message;
    return {
      id,
      caseId,
      senderType,
      senderUserId,
      direction,
      channel,
      subject,
      content,
      sentAt,
      readAt,
    };
  }

  static messageToEntityList(messages: Message[]): MessageEntity[] {
    return messages.map(CaseMapper.messageToEntity);
  }

  static replacementToEntity(replacement: ReplacementProduct): ReplacementProductEntity {
    const {
      id,
      caseItemId,
      productIdentifier,
      issuedAt,
      plannedReturnAt,
      returnedAt,
      conditionOnReturn,
    } = replacement;
    return {
      id,
      caseItemId,
      productIdentifier,
      issuedAt,
      plannedReturnAt,
      returnedAt,
      conditionOnReturn,
    };
  }

  static logisticsToEntity(logistics: Logistics): LogisticsEntity {
    const { id, caseId, type, status, trackingNumber } = logistics;
    return { id, caseId, type, status, trackingNumber };
  }

  static logisticsToEntityList(entries: Logistics[]): LogisticsEntity[] {
    return entries.map(CaseMapper.logisticsToEntity);
  }
}
