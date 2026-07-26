import { CaseHistoryAction, CaseStatus, Decision } from '@prisma/client';
import { PERMISSIONS, PermissionCode } from '../../rbac/constants/permissions.const';

/**
 * Transkrypcja BEZPOŚREDNIA `STATE_MACHINE.md` ("Reprezentacja jako
 * struktura danych — do bezpośredniego przeniesienia"). Nie modyfikować bez
 * jednoczesnej zmiany tamtego dokumentu — to jest jedyne źródło prawdy dla
 * `CasesService`, żadna metoda serwisu nie sprawdza przejść inaczej.
 */
export interface CaseTransition {
  to: CaseStatus;
  condition?: 'complaintType=Warranty' | 'complaintType=StatutoryWarranty' | 'courierRequested=true';
  requiredCheck?: string;
  permission: PermissionCode;
  automatic?: boolean;
}

export const CASE_STATE_MACHINE: Record<CaseStatus, CaseTransition[]> = {
  Nowa: [
    { to: CaseStatus.Przyjeta, permission: PERMISSIONS.CASES_STATUS_CHANGE },
    { to: CaseStatus.Anulowana, permission: PERMISSIONS.CASES_CANCEL },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: PERMISSIONS.CASES_INFO_REQUEST_SEND },
  ],
  Przyjeta: [
    { to: CaseStatus.Weryfikacja, permission: PERMISSIONS.CASES_STATUS_CHANGE },
    { to: CaseStatus.Anulowana, permission: PERMISSIONS.CASES_CANCEL },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: PERMISSIONS.CASES_INFO_REQUEST_SEND },
  ],
  Weryfikacja: [
    { to: CaseStatus.GotowaDoWysylki, condition: 'complaintType=Warranty', requiredCheck: 'CASE-002', permission: PERMISSIONS.CASES_STATUS_CHANGE },
    { to: CaseStatus.WeryfikacjaWewnetrzna, condition: 'complaintType=StatutoryWarranty', requiredCheck: 'CASE-002', permission: PERMISSIONS.CASES_STATUS_CHANGE },
    { to: CaseStatus.Anulowana, permission: PERMISSIONS.CASES_CANCEL },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: PERMISSIONS.CASES_INFO_REQUEST_SEND },
  ],
  // "to" ustalane dynamicznie w runtime = ostatni status sprzed wejścia (patrz CaseHistory, WORKFLOW.md §4).
  // Wpis `{ to: Weryfikacja }` poniżej to placeholder z samego STATE_MACHINE.md — `findTransition()` niżej
  // podmienia `to` na faktyczny status odczytany z historii (domyślnie Weryfikacja, jeśli brak wpisu).
  OczekiwanieNaKlienta: [
    { to: CaseStatus.Weryfikacja, permission: PERMISSIONS.CASES_STATUS_CHANGE, automatic: true },
    { to: CaseStatus.Anulowana, permission: PERMISSIONS.CASES_CANCEL },
  ],
  GotowaDoWysylki: [
    { to: CaseStatus.OczekiwanieNaKuriera, condition: 'courierRequested=true', permission: PERMISSIONS.CASES_STATUS_CHANGE },
    { to: CaseStatus.WyslanaDoProducenta, permission: PERMISSIONS.CASES_STATUS_CHANGE },
    { to: CaseStatus.Anulowana, permission: PERMISSIONS.CASES_CANCEL },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: PERMISSIONS.CASES_INFO_REQUEST_SEND },
  ],
  OczekiwanieNaKuriera: [
    { to: CaseStatus.WyslanaDoProducenta, permission: PERMISSIONS.CASES_STATUS_CHANGE, automatic: true },
    { to: CaseStatus.Anulowana, permission: PERMISSIONS.CASES_CANCEL },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: PERMISSIONS.CASES_INFO_REQUEST_SEND },
  ],
  WyslanaDoProducenta: [
    { to: CaseStatus.OczekiwanieNaDecyzjeProducenta, permission: PERMISSIONS.CASES_STATUS_CHANGE, automatic: true },
    { to: CaseStatus.Anulowana, permission: PERMISSIONS.CASES_CANCEL },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: PERMISSIONS.CASES_INFO_REQUEST_SEND },
  ],
  OczekiwanieNaDecyzjeProducenta: [
    { to: CaseStatus.RealizacjaDecyzji, requiredCheck: 'CASE-009', permission: PERMISSIONS.CASES_DECISION_SET },
    { to: CaseStatus.Anulowana, permission: PERMISSIONS.CASES_CANCEL },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: PERMISSIONS.CASES_INFO_REQUEST_SEND },
  ],
  WeryfikacjaWewnetrzna: [
    { to: CaseStatus.OczekiwanieNaDecyzjeKierownika, permission: PERMISSIONS.CASES_STATUS_CHANGE },
    { to: CaseStatus.Anulowana, permission: PERMISSIONS.CASES_CANCEL },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: PERMISSIONS.CASES_INFO_REQUEST_SEND },
  ],
  OczekiwanieNaDecyzjeKierownika: [
    { to: CaseStatus.RealizacjaDecyzji, requiredCheck: 'CASE-009', permission: PERMISSIONS.CASES_DECISION_APPROVE },
    { to: CaseStatus.Anulowana, permission: PERMISSIONS.CASES_CANCEL },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: PERMISSIONS.CASES_INFO_REQUEST_SEND },
  ],
  RealizacjaDecyzji: [
    { to: CaseStatus.GotowaDoOdbioru, permission: PERMISSIONS.CASES_STATUS_CHANGE },
    { to: CaseStatus.Anulowana, permission: PERMISSIONS.CASES_CANCEL },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: PERMISSIONS.CASES_INFO_REQUEST_SEND },
  ],
  GotowaDoOdbioru: [
    { to: CaseStatus.Zamknieta, permission: PERMISSIONS.CASES_STATUS_CHANGE, automatic: true },
    { to: CaseStatus.Anulowana, permission: PERMISSIONS.CASES_CANCEL },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: PERMISSIONS.CASES_INFO_REQUEST_SEND },
  ],
  Zamknieta: [{ to: CaseStatus.Zarchiwizowana, permission: PERMISSIONS.CASES_ARCHIVE, automatic: true }],
  Anulowana: [],
  Zarchiwizowana: [],
};

/** WORKFLOW.md §2.3 — "status aktywny" = każdy poza Zamknieta/Anulowana/Zarchiwizowana. */
export function isActiveStatus(status: CaseStatus): boolean {
  return status !== CaseStatus.Zamknieta && status !== CaseStatus.Anulowana && status !== CaseStatus.Zarchiwizowana;
}

/**
 * CASE-001 — legalność przejścia. Dla `OczekiwanieNaKlienta` (jedyny status
 * z dynamicznym targetem) `statusBeforeWaiting` musi być dostarczone przez
 * wołającego (odczytane z `CaseHistoryRepository.findLastStatusBeforeWaiting`,
 * WORKFLOW.md §4 — domyślnie `Weryfikacja`, jeśli historia go nie zawiera).
 */
export function findTransition(
  from: CaseStatus,
  to: CaseStatus,
  context: { statusBeforeWaiting?: CaseStatus | null } = {},
): CaseTransition | undefined {
  const transitions = CASE_STATE_MACHINE[from];
  if (from === CaseStatus.OczekiwanieNaKlienta) {
    const resolvedTarget = context.statusBeforeWaiting ?? CaseStatus.Weryfikacja;
    if (to === CaseStatus.Anulowana) return transitions.find((t) => t.to === CaseStatus.Anulowana);
    if (to !== resolvedTarget) return undefined;
    const template = transitions.find((t) => t.to === CaseStatus.Weryfikacja);
    return template ? { ...template, to: resolvedTarget } : undefined;
  }
  return transitions.find((t) => t.to === to);
}

/**
 * Reguła dodatkowa (STATE_MACHINE.md, poza tabelą główną): `ZwrotSrodkow`
 * jako `decision` wymaga `cases.decision.approve` niezależnie od statusu,
 * z którego następuje przejście — nadpisuje permission wiersza tabeli dla
 * przejścia w `RealizacjaDecyzji`.
 */
export function resolveTransitionPermission(transition: CaseTransition, decision?: Decision | null): PermissionCode {
  if (transition.to === CaseStatus.RealizacjaDecyzji && decision === Decision.ZwrotSrodkow) {
    return PERMISSIONS.CASES_DECISION_APPROVE;
  }
  return transition.permission;
}

/**
 * Uprawnienie wymagane do SAMEGO ustawienia `Case.decision` (`PUT
 * /cases/:id/decision`, oddzielne od przejścia statusu, patrz
 * `CasesService.setDecision`) — ta sama reguła dodatkowa (ZwrotSrodkow) plus
 * `OczekiwanieNaDecyzjeKierownika` (ścieżka rękojmi, zawsze `.approve` wg
 * wiersza tabeli dla tego statusu).
 */
export function resolveDecisionPermission(currentStatus: CaseStatus, decision: Decision): PermissionCode {
  if (decision === Decision.ZwrotSrodkow) return PERMISSIONS.CASES_DECISION_APPROVE;
  if (currentStatus === CaseStatus.OczekiwanieNaDecyzjeKierownika) return PERMISSIONS.CASES_DECISION_APPROVE;
  return PERMISSIONS.CASES_DECISION_SET;
}

/**
 * EVENTS.md §10.2 — mapowanie `case.status_changed` → `CaseHistoryAction`:
 * `StatusChanged` ogólnie, ale `CaseClosed`/`CaseCancelled`/`CaseArchived`
 * dla przejść w stany końcowe.
 */
export function historyActionForStatusChange(to: CaseStatus): CaseHistoryAction {
  switch (to) {
    case CaseStatus.Zamknieta:
      return CaseHistoryAction.CaseClosed;
    case CaseStatus.Anulowana:
      return CaseHistoryAction.CaseCancelled;
    case CaseStatus.Zarchiwizowana:
      return CaseHistoryAction.CaseArchived;
    default:
      return CaseHistoryAction.StatusChanged;
  }
}

/**
 * Transkrypcja WORKFLOW.md §7 (kolumna "Domyślny nextAction (pracownik)") —
 * zastosowana przy tworzeniu sprawy (status `Nowa`) i przy każdej zmianie
 * statusu (WORKFLOW.md §6 poz. 2). `nextActionDueDate` NIE jest tu liczone —
 * zależy od `ManufacturerSLA` (poz. 6, BR-096), integracja poza zakresem
 * Zadania 16 (patrz raport końcowy).
 */
export const DEFAULT_NEXT_ACTION: Record<CaseStatus, string | null> = {
  Nowa: 'Zweryfikuj kompletność zgłoszenia i przyjmij produkt od klienta',
  Przyjeta: 'Sprawdź stan produktu i udokumentuj zdjęciami',
  Weryfikacja: 'Zweryfikuj kompletność dokumentacji',
  OczekiwanieNaKlienta: 'Oczekiwanie na odpowiedź klienta',
  WeryfikacjaWewnetrzna: 'Przygotuj wewnętrzną ocenę sprawy (rękojmia)',
  GotowaDoWysylki: 'Przekaż produkt do wysyłki / kuriera',
  OczekiwanieNaKuriera: 'Oczekiwanie na odbiór produktu przez kuriera',
  WyslanaDoProducenta: 'Monitoruj odpowiedź producenta',
  OczekiwanieNaDecyzjeProducenta: 'Sprawdź termin SLA producenta',
  OczekiwanieNaDecyzjeKierownika: 'Kierownik: podejmij decyzję w sprawie',
  RealizacjaDecyzji: 'Zrealizuj podjętą decyzję',
  GotowaDoOdbioru: 'Powiadom klienta o możliwości odbioru',
  Zamknieta: null,
  Anulowana: null,
  Zarchiwizowana: null,
};
