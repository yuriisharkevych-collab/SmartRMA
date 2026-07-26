import { CaseHistory, CaseStatus, Decision } from '@prisma/client';
import { CaseWithItems } from '../../cases/mappers/case.mapper';
import { DocumentEntity } from '../../documents/entities/document.entity';
import { PortalCaseViewEntity, PortalOwnerEntity, PortalStage, PORTAL_STAGE_LABELS } from '../entities/portal-case-view.entity';
import { PortalDocumentEntity } from '../entities/portal-document.entity';
import { PortalHistoryEntryEntity } from '../entities/portal-history-entry.entity';

const STAGE_BY_STATUS: Record<CaseStatus, PortalStage> = {
  Nowa: 'Zgloszona',
  Przyjeta: 'Przyjeta',
  Weryfikacja: 'Przyjeta',
  // Bez pola przechowującego "status poprzedni" (świadomie, WORKFLOW.md §4)
  // pokazujemy najczęstszy poprzedni etap — uproszczenie do rewizji, jeśli
  // okaże się mylące operacyjnie.
  OczekiwanieNaKlienta: 'Przyjeta',
  WeryfikacjaWewnetrzna: 'Przyjeta',
  GotowaDoWysylki: 'WTrakcie',
  OczekiwanieNaKuriera: 'WTrakcie',
  WyslanaDoProducenta: 'WTrakcie',
  OczekiwanieNaDecyzjeProducenta: 'WTrakcie',
  OczekiwanieNaDecyzjeKierownika: 'WTrakcie',
  RealizacjaDecyzji: 'Decyzja',
  GotowaDoOdbioru: 'Zakonczona',
  Zamknieta: 'Zakonczona',
  Anulowana: 'Anulowana',
  Zarchiwizowana: 'Zarchiwizowana',
};

const DECISION_LABELS: Record<Decision, string> = {
  Naprawa: 'Naprawa',
  WymianaCzesci: 'Wymiana części',
  WymianaProduktu: 'Wymiana produktu',
  ZwrotSrodkow: 'Zwrot środków',
  Odrzucenie: 'Reklamacja odrzucona',
};

export class PortalMapper {
  static toCaseView(caseRecord: CaseWithItems, owner: PortalOwnerEntity | null): PortalCaseViewEntity {
    const stage = STAGE_BY_STATUS[caseRecord.status];
    return {
      caseNumber: caseRecord.caseNumber,
      stage,
      stageLabel: PORTAL_STAGE_LABELS[stage],
      createdAt: caseRecord.createdAt,
      decisionLabel: caseRecord.decision ? DECISION_LABELS[caseRecord.decision] : null,
      owner,
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
    return { id: doc.id, fileName: doc.fileName, fileType: doc.fileType, category: doc.category, uploadedAt: doc.uploadedAt };
  }

  static toDocumentList(docs: DocumentEntity[]): PortalDocumentEntity[] {
    return docs.map(PortalMapper.toDocument);
  }
}
