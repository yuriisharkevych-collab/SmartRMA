import { CaseStatus } from '@prisma/client';

export interface CaseStatusTransition {
  to: CaseStatus;
  condition?: string;
  requiredCheck?: string;
  permission: string;
  automatic?: boolean;
}

/**
 * Transkrypcja dosłowna `STATE_MACHINE.md` ("Reprezentacja jako struktura
 * danych") — jedyne źródło prawdy dla dozwolonych przejść. `CasesService`
 * (przy implementacji) importuje **to**, nie duplikuje tabeli.
 *
 * TODO(CASE-014): warunek `Logistics(type=ShipToManufacturer).status=
 * Delivered` dla `OczekiwanieNaKuriera -> WyslanaDoProducenta` istnieje w
 * WORKFLOW.md §8 / STATE_MACHINE.md (tabela prozy), ale NIE ma tu
 * `requiredCheck` — sam STATE_MACHINE.md ma tę samą lukę (patrz raport
 * gotowości, Zadanie 7). Nie zgadywano kodu błędu tutaj — do domknięcia
 * najpierw w dokumentacji.
 */
export const CASE_STATE_MACHINE: Record<CaseStatus, CaseStatusTransition[]> = {
  Nowa: [
    { to: CaseStatus.Przyjeta, permission: 'cases.status.change' },
    { to: CaseStatus.Anulowana, permission: 'cases.cancel' },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: 'cases.infoRequest.send' },
  ],
  Przyjeta: [
    { to: CaseStatus.Weryfikacja, permission: 'cases.status.change' },
    { to: CaseStatus.Anulowana, permission: 'cases.cancel' },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: 'cases.infoRequest.send' },
  ],
  Weryfikacja: [
    {
      to: CaseStatus.GotowaDoWysylki,
      condition: 'complaintType=Warranty',
      requiredCheck: 'CASE-002',
      permission: 'cases.status.change',
    },
    {
      to: CaseStatus.WeryfikacjaWewnetrzna,
      condition: 'complaintType=StatutoryWarranty',
      requiredCheck: 'CASE-002',
      permission: 'cases.status.change',
    },
    { to: CaseStatus.Anulowana, permission: 'cases.cancel' },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: 'cases.infoRequest.send' },
  ],
  OczekiwanieNaKlienta: [
    // "to" ustalane dynamicznie w runtime = ostatni status sprzed wejścia (patrz CaseHistory, WORKFLOW.md §4)
    { to: CaseStatus.Weryfikacja, permission: 'cases.status.change', automatic: true },
    { to: CaseStatus.Anulowana, permission: 'cases.cancel' },
  ],
  GotowaDoWysylki: [
    { to: CaseStatus.OczekiwanieNaKuriera, condition: 'courierRequested=true', permission: 'cases.status.change' },
    { to: CaseStatus.WyslanaDoProducenta, permission: 'cases.status.change' },
    { to: CaseStatus.Anulowana, permission: 'cases.cancel' },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: 'cases.infoRequest.send' },
  ],
  OczekiwanieNaKuriera: [
    { to: CaseStatus.WyslanaDoProducenta, permission: 'cases.status.change', automatic: true },
    { to: CaseStatus.Anulowana, permission: 'cases.cancel' },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: 'cases.infoRequest.send' },
  ],
  WyslanaDoProducenta: [
    { to: CaseStatus.OczekiwanieNaDecyzjeProducenta, permission: 'cases.status.change', automatic: true },
    { to: CaseStatus.Anulowana, permission: 'cases.cancel' },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: 'cases.infoRequest.send' },
  ],
  OczekiwanieNaDecyzjeProducenta: [
    { to: CaseStatus.RealizacjaDecyzji, requiredCheck: 'CASE-009', permission: 'cases.decision.set' },
    { to: CaseStatus.Anulowana, permission: 'cases.cancel' },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: 'cases.infoRequest.send' },
  ],
  WeryfikacjaWewnetrzna: [
    { to: CaseStatus.OczekiwanieNaDecyzjeKierownika, permission: 'cases.status.change' },
    { to: CaseStatus.Anulowana, permission: 'cases.cancel' },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: 'cases.infoRequest.send' },
  ],
  OczekiwanieNaDecyzjeKierownika: [
    { to: CaseStatus.RealizacjaDecyzji, requiredCheck: 'CASE-009', permission: 'cases.decision.approve' },
    { to: CaseStatus.Anulowana, permission: 'cases.cancel' },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: 'cases.infoRequest.send' },
  ],
  RealizacjaDecyzji: [
    { to: CaseStatus.GotowaDoOdbioru, permission: 'cases.status.change' },
    { to: CaseStatus.Anulowana, permission: 'cases.cancel' },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: 'cases.infoRequest.send' },
  ],
  GotowaDoOdbioru: [
    { to: CaseStatus.Zamknieta, permission: 'cases.status.change', automatic: true },
    { to: CaseStatus.Anulowana, permission: 'cases.cancel' },
    { to: CaseStatus.OczekiwanieNaKlienta, permission: 'cases.infoRequest.send' },
  ],
  Zamknieta: [{ to: CaseStatus.Zarchiwizowana, permission: 'cases.archive', automatic: true }],
  Anulowana: [],
  Zarchiwizowana: [],
};
