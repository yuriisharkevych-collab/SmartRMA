import { CaseHistory, Decision, Message, PortalStage as PrismaPortalStage } from '@prisma/client';
import { CaseWithItems } from '../../cases/mappers/case.mapper';
import { CompanyEntity } from '../../companies/entities/company.entity';
import { DocumentEntity } from '../../documents/entities/document.entity';
import { PortalCompanyInfoEntity } from '../entities/portal-company-info.entity';
import {
  PortalCaseViewEntity,
  PortalOwnerEntity,
  PortalStage,
  PORTAL_STAGE_LABELS,
  PORTAL_STAGE_SEQUENCE,
} from '../entities/portal-case-view.entity';
import { PortalDocumentEntity } from '../entities/portal-document.entity';
import { PortalHistoryEntryEntity } from '../entities/portal-history-entry.entity';
import { PortalMessageEntity } from '../entities/portal-message.entity';
import {
  buildGdprInfoText,
  GDPR_CLAUSE_VERSION,
  GDPR_DOCUMENT_SHARING_CONSENT_TEXT,
  GDPR_MARKETING_CONSENT_TEXT,
  GDPR_REQUIRED_CONSENT_TEXT,
} from '../../cases/gdpr.constants';

const DECISION_LABELS: Record<Decision, string> = {
  Naprawa: 'Naprawa',
  WymianaCzesci: 'Wymiana części',
  WymianaProduktu: 'Wymiana produktu',
  ZwrotSrodkow: 'Zwrot środków',
  Odrzucenie: 'Reklamacja odrzucona',
};

export class PortalMapper {
  /**
   * Status Workflow Refactor — dawny `STAGE_BY_STATUS: Record<CaseStatus,
   * PortalStage>` (5 etapów głównych zaszyte 1:1 w hardcodowanym enumie)
   * zastąpiony polem `CaseStatusDefinition.portalStage` (`statusPortalStage`,
   * odczytane przez `PortalService.getCaseView` z katalogu firmy) — "Anulowana"/
   * "Zarchiwizowana" nie są już osobnymi statusami, więc te dwa banery
   * specjalne wynikają teraz z `Case.cancelledAt`/`archivedAt` (kontrakt API
   * bez zmian — `PortalCaseViewEntity.stage` ma dokładnie ten sam kształt).
   */
  static toCaseView(
    caseRecord: CaseWithItems,
    statusPortalStage: PrismaPortalStage | null,
    owner: PortalOwnerEntity | null,
    company: CompanyEntity,
    consentGiven: boolean,
    unreadMessagesCount: number,
  ): PortalCaseViewEntity {
    const stage: PortalStage = caseRecord.cancelledAt
      ? 'Anulowana'
      : caseRecord.archivedAt
        ? 'Zarchiwizowana'
        : (statusPortalStage ?? 'Zgloszona');
    const sequenceIndex = PORTAL_STAGE_SEQUENCE.indexOf(stage);
    return {
      caseNumber: caseRecord.caseNumber,
      stage,
      stageLabel: PORTAL_STAGE_LABELS[stage],
      stageIndex: sequenceIndex === -1 ? 0 : sequenceIndex + 1,
      stageCount: PORTAL_STAGE_SEQUENCE.length,
      createdAt: caseRecord.createdAt,
      decisionLabel: caseRecord.decision ? DECISION_LABELS[caseRecord.decision] : null,
      owner,
      companyInfo: PortalMapper.toCompanyInfo(company),
      consentGiven,
      gdprClauseVersion: GDPR_CLAUSE_VERSION,
      gdprInfoText: buildGdprInfoText(company.name),
      gdprRequiredConsentText: GDPR_REQUIRED_CONSENT_TEXT,
      gdprMarketingConsentText: GDPR_MARKETING_CONSENT_TEXT,
      gdprDocumentSharingConsentText: GDPR_DOCUMENT_SHARING_CONSENT_TEXT,
      unreadMessagesCount,
    };
  }

  static toCompanyInfo(company: CompanyEntity): PortalCompanyInfoEntity {
    return {
      name: company.name,
      address: company.address,
      nip: company.nip,
      email: company.email,
      phone: company.phone,
      privacyPolicyUrl: company.privacyPolicyUrl,
    };
  }

  static toMessage(
    message: Message,
    documents: { id: string; fileName: string }[] = [],
  ): PortalMessageEntity {
    return {
      id: message.id,
      senderType: message.senderType,
      content: message.content,
      sentAt: message.sentAt,
      documents,
    };
  }

  static toHistoryEntry(entry: CaseHistory): PortalHistoryEntryEntity {
    return { action: entry.action, newValue: entry.newValue, createdAt: entry.createdAt };
  }

  static toHistoryList(entries: CaseHistory[]): PortalHistoryEntryEntity[] {
    // BR-079 — filtr `visibleForCustomer` stosowany w `PortalService`, nie tutaj (mapper tylko kształtuje dane).
    return entries.map(PortalMapper.toHistoryEntry);
  }

  static toDocument(doc: DocumentEntity): PortalDocumentEntity {
    return {
      id: doc.id,
      fileName: doc.fileName,
      fileType: doc.fileType,
      category: doc.category,
      uploadedAt: doc.uploadedAt,
    };
  }

  static toDocumentList(docs: DocumentEntity[]): PortalDocumentEntity[] {
    return docs.map(PortalMapper.toDocument);
  }
}
