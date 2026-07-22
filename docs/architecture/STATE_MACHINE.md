# STATE_MACHINE.md — SmartRMA AI

Maszynowo-czytelna reprezentacja automatu stanów `Case.status`. Bez opisów
narracyjnych — te są w `WORKFLOW.md`. Ten dokument to bezpośrednie źródło
dla `case-status.rules.ts` (lub odpowiednika w warstwie serwisów backendu).

`Permission` odwołuje się do kodów z `RBAC.md`. `Warunek` odwołuje się do
kodów z `ERROR_CODES.md` (co blokuje przejście, jeśli warunek niespełniony).

## Tabela przejść

| Status | Dozwolone przejścia | Warunek | Permission |
|---|---|---|---|
| `Nowa` | `Przyjeta`, `Anulowana`, `OczekiwanieNaKlienta` | — | `cases.status.change` |
| `Przyjeta` | `Weryfikacja`, `Anulowana`, `OczekiwanieNaKlienta` | — | `cases.status.change` |
| `Weryfikacja` | `GotowaDoWysylki` *(jeśli complaintType=Warranty)*, `WeryfikacjaWewnetrzna` *(jeśli complaintType=StatutoryWarranty)*, `Anulowana`, `OczekiwanieNaKlienta` | CASE-002 (dokumenty kompletne) | `cases.status.change` |
| `OczekiwanieNaKlienta` | *(status poprzedni sprzed wejścia — domyślnie `Weryfikacja`)*, `Anulowana` | — | `cases.status.change` *(lub automatyczne — patrz EVENTS.md `CustomerResponded`)* |
| `GotowaDoWysylki` | `OczekiwanieNaKuriera` *(jeśli courierRequested=true)*, `WyslanaDoProducenta` *(dostawa bez kuriera)*, `Anulowana`, `OczekiwanieNaKlienta` | — | `cases.status.change` |
| `OczekiwanieNaKuriera` | `WyslanaDoProducenta`, `Anulowana`, `OczekiwanieNaKlienta` | Logistics(type=ShipToManufacturer).status=Delivered | `cases.status.change` |
| `WyslanaDoProducenta` | `OczekiwanieNaDecyzjeProducenta`, `Anulowana`, `OczekiwanieNaKlienta` | — | `cases.status.change` *(lub automatyczne)* |
| `OczekiwanieNaDecyzjeProducenta` | `RealizacjaDecyzji`, `Anulowana`, `OczekiwanieNaKlienta` | CASE-009 (decision ustawione) | `cases.decision.set` |
| `WeryfikacjaWewnetrzna` | `OczekiwanieNaDecyzjeKierownika`, `Anulowana`, `OczekiwanieNaKlienta` | — | `cases.status.change` |
| `OczekiwanieNaDecyzjeKierownika` | `RealizacjaDecyzji`, `Anulowana`, `OczekiwanieNaKlienta` | CASE-009 (decision ustawione) | `cases.decision.approve` |
| `RealizacjaDecyzji` | `GotowaDoOdbioru`, `Anulowana`, `OczekiwanieNaKlienta` | — | `cases.status.change` |
| `GotowaDoOdbioru` | `Zamknieta`, `Anulowana`, `OczekiwanieNaKlienta` | — | `cases.status.change` *(lub automatyczne — `ManufacturerAutomation.autoCloseEnabled`)* |
| `Zamknieta` | `Zarchiwizowana` | — | `cases.archive` *(lub automatyczne — retencja)* |
| `Anulowana` | *(brak — stan końcowy)* | — | — |
| `Zarchiwizowana` | *(brak — stan końcowy)* | — | — |

## Reguła dodatkowa (nie mieści się w tabeli)

`ZwrotSrodkow` jako wartość `decision` wymaga `cases.decision.approve`
niezależnie od tego, z którego statusu następuje ustawienie decyzji
(CASE-010) — nadpisuje domyślny `cases.decision.set` dla tej jednej
wartości.

## Reprezentacja jako struktura danych (do bezpośredniego przeniesienia)

```ts
type CaseStatusValue =
  | 'Nowa' | 'Przyjeta' | 'Weryfikacja' | 'OczekiwanieNaKlienta'
  | 'GotowaDoWysylki' | 'OczekiwanieNaKuriera' | 'WyslanaDoProducenta'
  | 'OczekiwanieNaDecyzjeProducenta' | 'WeryfikacjaWewnetrzna'
  | 'OczekiwanieNaDecyzjeKierownika' | 'RealizacjaDecyzji'
  | 'GotowaDoOdbioru' | 'Zamknieta' | 'Anulowana' | 'Zarchiwizowana';

interface Transition {
  to: CaseStatusValue;
  condition?: 'complaintType=Warranty' | 'complaintType=StatutoryWarranty' | 'courierRequested=true';
  requiredCheck?: string;   // kod z ERROR_CODES.md, np. 'CASE-002'
  permission: string;       // kod z RBAC.md, np. 'cases.status.change'
  automatic?: boolean;      // true = może być wykonane przez system, nie tylko człowieka
}

const CASE_STATE_MACHINE: Record<CaseStatusValue, Transition[]> = {
  Nowa: [
    { to: 'Przyjeta', permission: 'cases.status.change' },
    { to: 'Anulowana', permission: 'cases.cancel' },
    { to: 'OczekiwanieNaKlienta', permission: 'cases.infoRequest.send' },
  ],
  Przyjeta: [
    { to: 'Weryfikacja', permission: 'cases.status.change' },
    { to: 'Anulowana', permission: 'cases.cancel' },
    { to: 'OczekiwanieNaKlienta', permission: 'cases.infoRequest.send' },
  ],
  Weryfikacja: [
    { to: 'GotowaDoWysylki', condition: 'complaintType=Warranty', requiredCheck: 'CASE-002', permission: 'cases.status.change' },
    { to: 'WeryfikacjaWewnetrzna', condition: 'complaintType=StatutoryWarranty', requiredCheck: 'CASE-002', permission: 'cases.status.change' },
    { to: 'Anulowana', permission: 'cases.cancel' },
    { to: 'OczekiwanieNaKlienta', permission: 'cases.infoRequest.send' },
  ],
  OczekiwanieNaKlienta: [
    // "to" ustalane dynamicznie w runtime = ostatni status sprzed wejścia (patrz CaseHistory)
    { to: 'Weryfikacja', permission: 'cases.status.change', automatic: true },
    { to: 'Anulowana', permission: 'cases.cancel' },
  ],
  GotowaDoWysylki: [
    { to: 'OczekiwanieNaKuriera', condition: 'courierRequested=true', permission: 'cases.status.change' },
    { to: 'WyslanaDoProducenta', permission: 'cases.status.change' },
    { to: 'Anulowana', permission: 'cases.cancel' },
    { to: 'OczekiwanieNaKlienta', permission: 'cases.infoRequest.send' },
  ],
  OczekiwanieNaKuriera: [
    { to: 'WyslanaDoProducenta', permission: 'cases.status.change', automatic: true },
    { to: 'Anulowana', permission: 'cases.cancel' },
    { to: 'OczekiwanieNaKlienta', permission: 'cases.infoRequest.send' },
  ],
  WyslanaDoProducenta: [
    { to: 'OczekiwanieNaDecyzjeProducenta', permission: 'cases.status.change', automatic: true },
    { to: 'Anulowana', permission: 'cases.cancel' },
    { to: 'OczekiwanieNaKlienta', permission: 'cases.infoRequest.send' },
  ],
  OczekiwanieNaDecyzjeProducenta: [
    { to: 'RealizacjaDecyzji', requiredCheck: 'CASE-009', permission: 'cases.decision.set' },
    { to: 'Anulowana', permission: 'cases.cancel' },
    { to: 'OczekiwanieNaKlienta', permission: 'cases.infoRequest.send' },
  ],
  WeryfikacjaWewnetrzna: [
    { to: 'OczekiwanieNaDecyzjeKierownika', permission: 'cases.status.change' },
    { to: 'Anulowana', permission: 'cases.cancel' },
    { to: 'OczekiwanieNaKlienta', permission: 'cases.infoRequest.send' },
  ],
  OczekiwanieNaDecyzjeKierownika: [
    { to: 'RealizacjaDecyzji', requiredCheck: 'CASE-009', permission: 'cases.decision.approve' },
    { to: 'Anulowana', permission: 'cases.cancel' },
    { to: 'OczekiwanieNaKlienta', permission: 'cases.infoRequest.send' },
  ],
  RealizacjaDecyzji: [
    { to: 'GotowaDoOdbioru', permission: 'cases.status.change' },
    { to: 'Anulowana', permission: 'cases.cancel' },
    { to: 'OczekiwanieNaKlienta', permission: 'cases.infoRequest.send' },
  ],
  GotowaDoOdbioru: [
    { to: 'Zamknieta', permission: 'cases.status.change', automatic: true },
    { to: 'Anulowana', permission: 'cases.cancel' },
    { to: 'OczekiwanieNaKlienta', permission: 'cases.infoRequest.send' },
  ],
  Zamknieta: [
    { to: 'Zarchiwizowana', permission: 'cases.archive', automatic: true },
  ],
  Anulowana: [],
  Zarchiwizowana: [],
};
```
