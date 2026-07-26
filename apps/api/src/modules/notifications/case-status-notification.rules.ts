import { CaseStatus } from '@prisma/client';

/**
 * Transkrypcja WORKFLOW.md §7 (kolumna "Powiadom klienta?") + NOTIFICATIONS.md
 * §3 (dobór konkretnego `code` szablonu per status). `Nowa` i
 * `OczekiwanieNaKlienta` celowo mają `templateCode: null` tutaj mimo "Tak" w
 * WORKFLOW.md §7 — obsługiwane przez INNE zdarzenia (`case.created`,
 * `case.info_requested`), nie przez `case.status_changed`
 * (`CasesService.performTransition` publikuje `case.info_requested` zamiast
 * `case.status_changed` dla przejścia w `OczekiwanieNaKlienta`, patrz Zadanie
 * 16). `statusLabel` dla wariantu generycznego to "Publiczny etap (Portal
 * Klienta)" z tej samej tabeli WORKFLOW.md §7 — dokładnie to źródło prawdy,
 * o które prosi uwaga pod tabelą ("backend... powinien być
 * generowany/synchronizowane" z `public-status-mapper.js`).
 */
export type CaseStatusNotificationRule =
  | { templateCode: null }
  | { templateCode: 'case.status_changed.customer'; statusLabel: string }
  | { templateCode: 'case.ready_for_pickup.customer' }
  | { templateCode: 'case.closed.customer' }
  | { templateCode: 'case.cancelled.customer' };

export const CASE_STATUS_NOTIFICATION_RULES: Record<CaseStatus, CaseStatusNotificationRule> = {
  Nowa: { templateCode: null },
  Przyjeta: { templateCode: null },
  Weryfikacja: { templateCode: null },
  OczekiwanieNaKlienta: { templateCode: null },
  WeryfikacjaWewnetrzna: { templateCode: null },
  GotowaDoWysylki: { templateCode: null },
  OczekiwanieNaKuriera: { templateCode: null },
  WyslanaDoProducenta: { templateCode: 'case.status_changed.customer', statusLabel: 'W trakcie rozpatrywania' },
  OczekiwanieNaDecyzjeProducenta: { templateCode: null },
  OczekiwanieNaDecyzjeKierownika: { templateCode: null },
  RealizacjaDecyzji: { templateCode: 'case.status_changed.customer', statusLabel: 'Decyzja podjęta' },
  GotowaDoOdbioru: { templateCode: 'case.ready_for_pickup.customer' },
  Zamknieta: { templateCode: 'case.closed.customer' },
  Anulowana: { templateCode: 'case.cancelled.customer' },
  Zarchiwizowana: { templateCode: null },
};
