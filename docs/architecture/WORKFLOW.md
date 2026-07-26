# WORKFLOW.md — SmartRMA AI

## Kompletny przepływ reklamacji (Case / Complaint)

Ten dokument opisuje automat stanów `Case.status` (`CaseStatus`) — od
utworzenia zgłoszenia do zamknięcia — wraz z warunkami przejść i akcjami
wykonywanymi automatycznie przez system. Model danych: `DATABASE.md`.
Uprawnienia wymagane do poszczególnych przejść: `RBAC.md`.

> **Zasada projektowa (niezmieniona od MVP):** dozwolone przejścia między
> statusami są walidowane w **warstwie aplikacji** (docelowo:
> `case-status.rules.ts` lub odpowiednik w warstwie usług NestJS), **nie**
> jako ograniczenie na poziomie bazy danych. `CaseStatus` w Prisma to
> zamknięty słownik wartości, ale sama logika "z jakiego statusu do jakiego
> wolno przejść" żyje w kodzie.

> **Warstwa techniczna:** mechanizm, przez który poniższe wyzwalacze
> propagują się do pozostałych modułów (kontrakty zdarzeń, koperta,
> idempotencja, obsługa błędów, wersjonowanie), opisuje `EVENTS.md`.
> Ten dokument pozostaje źródłem prawdy dla **procesu biznesowego** —
> `EVENTS.md` odsyła do niego i go nie powiela.

---

## 1. Dwa wymiary klasyfikacji sprawy

Każda sprawa ma **dwa niezależne wymiary**, które razem determinują jej
przepływ:

| Wymiar | Pole | Wartości | Co określa |
|---|---|---|---|
| Podstawa prawna | `complaintType` | `Warranty` (gwarancja) / `StatutoryWarranty` (rękojmia) | **kto merytorycznie decyduje** — producent (gwarancja) czy Kierownik sklepu (rękojmia, z mocy prawa) |
| Kanał obsługi | `submissionMode` | `PrzezSklep` / `BezposrednioDoProducenta` | **kto fizycznie prowadzi sprawę** — sklep prowadzi cały proces, czy klient zgłasza się bezpośrednio do producenta, a sklep (opcjonalnie) tylko monitoruje |

Te dwa wymiary **nie są ze sobą sprzężone**: rękojmia zawsze idzie przez
sklep (z mocy prawa — konsument dochodzi rękojmi od sprzedawcy, nie
producenta), ale gwarancja może iść **każdą** z dwóch ścieżek.

**Reguła walidacyjna:** `submissionMode = BezposrednioDoProducenta` jest
dopuszczalne **tylko** dla `complaintType = Warranty`. Próba utworzenia
sprawy `StatutoryWarranty` + `BezposrednioDoProducenta` powinna być
odrzucona przez warstwę aplikacji (walidacja przy tworzeniu sprawy).

---

## 2. Ścieżka „Przez sklep" — pełny automat stanów

### 2.1 Gwarancja (`Warranty` + `PrzezSklep`)

```
Nowa
 └─▶ Przyjeta
      └─▶ Weryfikacja
           └─▶ GotowaDoWysylki
                └─▶ OczekiwanieNaKuriera *(opcjonalny, jeśli courierRequested=true)*
                     └─▶ WyslanaDoProducenta
                          └─▶ OczekiwanieNaDecyzjeProducenta
                               └─▶ RealizacjaDecyzji
                                    └─▶ GotowaDoOdbioru
                                         └─▶ Zamknieta
                                              └─▶ Zarchiwizowana
```

### 2.2 Rękojmia (`StatutoryWarranty` + `PrzezSklep`, zawsze `PrzezSklep`)

```
Nowa
 └─▶ Przyjeta
      └─▶ Weryfikacja
           └─▶ WeryfikacjaWewnetrzna
                └─▶ OczekiwanieNaDecyzjeKierownika
                     └─▶ RealizacjaDecyzji
                          └─▶ GotowaDoOdbioru
                               └─▶ Zamknieta
                                    └─▶ Zarchiwizowana
```

### 2.3 Boczne stany dostępne z KAŻDEGO statusu aktywnego

```
[dowolny status aktywny] ──▶ Anulowana        (zdarzenie: anulowanie, patrz §5)
[dowolny status aktywny] ──▶ OczekiwanieNaKlienta ──▶ Weryfikacja  (patrz §4)
```

"Status aktywny" = każdy poza `Zamknieta`, `Anulowana`, `Zarchiwizowana`.

---

## 3. Ścieżka „Bezpośrednio do producenta" (`BezposrednioDoProducenta`)

Klient zgłasza reklamację bezpośrednio producentowi; sklep **opcjonalnie**
monitoruje sprawę (`informStore` z kreatora zgłoszenia — pole decyzyjne w
warstwie aplikacji, nie osobna kolumna w bazie, patrz §3.3).

### 3.1 Klient NIE prosi o monitoring

**Żadna sprawa (`Case`) nie jest tworzona w systemie.** Klient otrzymuje na
ekranie (i opcjonalnie e-mailem) dane kontaktowe producenta i instrukcję
zgłoszenia (`Manufacturer.complaintProcedure` / `requiredDocumentsNote` /
`requiredPhotosNote` / `requiredVideosNote`). To świadoma decyzja
zachowana z prototypu kreatora zgłoszenia — sklep nie ma podstaw do
zakładania i przechowywania sprawy, o której monitoring klient wyraźnie
nie poprosił.

### 3.2 Klient prosi o monitoring

Tworzona jest sprawa **uproszczona** — bez fizycznego przepływu produktu
przez sklep, więc granularne statusy logistyczne (`GotowaDoWysylki`,
`OczekiwanieNaKuriera`, `WeryfikacjaWewnetrzna` itd.) **nie mają
zastosowania**. Dozwolony, węższy automat:

```
Nowa ──▶ RealizacjaDecyzji ──▶ Zamknieta ──▶ Zarchiwizowana
  └────────────────────────────▶ Anulowana
```

Pomiędzy `Nowa` a `RealizacjaDecyzji` sprawa żyje głównie przez `Message`
(komunikacja z klientem) i `Note` (wewnętrzne obserwacje pracownika) — nie
przez zmiany statusu. `RealizacjaDecyzji` jest ustawiane ręcznie przez
pracownika, gdy z relacji klienta wynika, że producent podjął decyzję.

> **Decyzja końcowa (Zadanie 9, patrz `DECISIONS.md`):** sprawa z tej
> ścieżki powstaje z `Case.description`/`requestedResolution` = `null` —
> producent zbiera szczegóły usterki bezpośrednio, sklep ich nie zna w
> momencie utworzenia sprawy. Oba pola są **wymagane warstwą aplikacji**
> dla każdej innej ścieżki (`BUSINESS_RULES.md` BR-105) — `null` nie jest
> tu wartością domyślną/błędem, tylko jedynym poprawnym stanem dla tego
> konkretnego, węższego automatu.

### 3.3 Uwaga implementacyjna

`informStore`/wybór "Tak/Nie" w kreatorze zgłoszenia to **decyzja podjęta
w warstwie formularza w momencie tworzenia sprawy**, nie osobne pole w
bazie — jeśli klient wybierze "Nie", żaden `Case` nie powstaje (patrz
§3.1), więc nie ma czego oznaczać. Jeśli wybierze "Tak", `Case` powstaje z
`submissionMode = BezposrednioDoProducenta` i normalnym `clientPortalEnabled
= true`.

---

## 4. Status boczny: `OczekiwanieNaKlienta`

**Domyka lukę** zidentyfikowaną podczas code review Portalu Klienta:
scenariusz "oczekiwanie na klienta" nie miał wcześniej odpowiednika w
modelu — istniało tylko powiadomienie o prośbie o uzupełnienie danych
(funkcja "Poproś o uzupełnienie danych", `CaseHistoryAction.InfoRequested`),
bez zmiany statusu sprawy.

**Przejście do `OczekiwanieNaKlienta`:**
- Wyzwalacz: pracownik używa akcji "Poproś o uzupełnienie danych".
- Warunek: sprawa musi być w statusie aktywnym (nie `Zamknieta`/`Anulowana`/
  `Zarchiwizowana`).
- Akcje automatyczne (patrz §6): zapis poprzedniego statusu (do powrotu),
  wpis `CaseHistory` (`InfoRequested`, `visibleForCustomer=true`), wysyłka
  `Notification` (e-mail) do klienta z treścią prośby, aktualizacja
  `nextAction`.

**Przejście z `OczekiwanieNaKlienta`:**
- Automatyczne: gdy klient odpowie wiadomością (`Message` z `direction=
  Inbound`) → powrót do zapisanego statusu poprzedniego (domyślnie
  `Weryfikacja`, jeśli status poprzedni nie został zapisany — np. dane
  historyczne sprzed tej funkcji).
- Ręczne: pracownik może wznowić sprawę bez czekania na odpowiedź klienta
  (np. gdy uzna, że ma już wystarczające dane inną drogą).

> **Uwaga:** przechowanie "statusu poprzedniego" wymaga pola aplikacyjnego
> (nie musi być kolumną w `Case` — można je odczytać z ostatniego wpisu
> `StatusChanged` w `CaseHistory` sprzed wejścia w `OczekiwanieNaKlienta`).
> To celowa decyzja, żeby nie dodawać do `Case` pola
> `statusBeforeWaiting`, które byłoby istotne tylko przez chwilę cyklu
> życia sprawy.

---

## 5. Anulowanie i archiwizacja

- **Anulowanie** (`Anulowana`) — dostępne z każdego statusu aktywnego.
  Wymaga podania powodu (zapisywanego jako `Note` lub `CaseHistory.
  newValue`). Nieodwracalne w UI (sprawa nie wraca automatycznie do
  aktywnego statusu — wznowienie to decyzja biznesowa wymagająca
  utworzenia nowej sprawy, jeśli klient jednak chce kontynuować).
- **Archiwizacja** (`Zarchiwizowana`) — wyłącznie z `Zamknieta`.
  Dwa wyzwalacze:
  1. **Automatyczny** — po okresie retencji operacyjnej (domyślnie 24
     miesiące od `closedAt`, konfigurowalne przez `Setting`
     `case.archival.retentionMonths`), zadanie cykliczne przenosi sprawy
     zamknięte dawno temu do statusu `Zarchiwizowana`.
  2. **Ręczny** — Administrator może zarchiwizować sprawę wcześniej.
  Archiwizacja **nie usuwa danych** — to zmiana statusu wpływająca na
  widoczność w domyślnych widokach listy spraw, nie na retencję fizyczną
  (patrz `docs/source/SECURITY_AND_GDPR.md` dla zasad retencji/usuwania
  danych osobowych, które działają niezależnie od tego statusu).

---

## 6. Akcje automatyczne — pełna lista

> Każda pozycja tej tabeli ma odpowiadający kontrakt zdarzenia w
> `EVENTS.md` §5 — z wyjątkiem pozycji 6, 12 i 22, dla których `EVENTS.md`
> §5.3 wyjaśnia, dlaczego zdarzenie nie powstaje. Dodanie pozycji do tej
> tabeli wymaga uzupełnienia `EVENTS.md` §5 albo §5.3.
>
> Pozycje 15–16 (produkt zastępczy) dodane w Zadaniu 5 — domykają lukę
> zgłoszoną w `BUSINESS_RULES.md` BR-073/BR-082 (produkt zastępczy jest
> częścią modelu i reguł biznesowych od dawna), które wcześniej nie miały
> odpowiednika w tej tabeli.
>
> Pozycje 17–20 dodane w Zadaniu 6 — domykają ostatnie cztery zdarzenia
> wymienione jako otwarte w `EVENTS.md` §13 poz. 2 (`case.owner_changed`,
> `document.uploaded`, `document.marked_invalid`, `logistics.status_changed`).
> Wszystkie miały już kontrakt zdarzenia (`EVENTS.md` §5) i wartość
> `CaseHistoryAction`, brakowało im wyłącznie miejsca na tej liście.
>
> Pozycje 21–22 dodane w Zadaniu 6 przy okazji pełnego audytu spójności:
> `PortalDisabled` (poz. 21) domyka asymetrię względem poz. 13 (istniała
> wartość enuma i uprawnienie `cases.portal.manage`, brakowało zdarzenia i
> wiersza tabeli); `NextActionUpdated` (poz. 22) domyka ostatnią wartość
> `CaseHistoryAction` bez żadnego odniesienia w tym dokumencie.
>
> **`NoteAdded` i `MessageSent` (kierunek `Outbound`, pracownik → klient)
> celowo NIE mają wiersza w tej tabeli** — to bezpośrednie akcje
> pracownika bez dodatkowych automatycznych konsekwencji poza samym
> zapisem (`Note`/`Message` **jest** już całością operacji, nie ma czego
> więcej "zautomatyzować"). `MessageSent` dla kierunku `Inbound` (klient
> odpowiada) ma odrębny wiersz — poz. 5 — bo tam istnieje realna
> automatyczna konsekwencja: powrót ze statusu `OczekiwanieNaKlienta`.
>
> **Zadanie 9 — Portal Klienta ma teraz konkretną implementację backendu.**
> Poz. 13/14/21 (strona pracownicza — generowanie/unieważnianie dostępu)
> mają odpowiadające endpointy `POST /cases/:id/portal/*` w
> `CasesController`. Strona kliencka (logowanie kodem/linkiem, podgląd
> statusu/historii/dokumentów, wysłanie wiadomości) to osobny moduł,
> `PortalModule` (`POST /portal/login`, `POST /portal/login/token`,
> `GET /portal/case`, `GET /portal/case/history`, `GET /portal/case/documents`,
> `POST /portal/case/messages`) — celowo poza tą tabelą, bo nie są to
> automatyczne KONSEKWENCJE zdarzeń z lewej kolumny, tylko odrębna,
> bezstanowa gałąź API z własnym mechanizmem dostępu (`PortalAccessGuard`,
> RBAC.md §1.2). Pełny opis: `RBAC.md` §1.2, `DECISIONS.md`
> ("Zadanie 9 — Zamrożenie architektury").


| # | Zdarzenie wyzwalające | Akcja automatyczna |
|---|---|---|
| 1 | Utworzenie sprawy (`Case` powstaje) | Wpis `CaseHistory` (`CaseCreated`), przypisanie domyślnego `nextAction` wg statusu `Nowa`, wysłanie `Notification` (e-mail potwierdzający) do klienta, jeśli `clientPortalEnabled=true` — dodatkowo wygenerowanie `clientAccessCodeHash` |
| 2 | Zmiana statusu (dowolne przejście) | Wpis `CaseHistory` (`StatusChanged`, `previousValue`/`newValue`), aktualizacja `nextAction`/`nextActionDueDate` wg mapy statusów (§7), wysłanie `Notification` do klienta **jeśli** nowy status jest oznaczony jako "istotny dla klienta" (§7, kolumna "Powiadom klienta") |
| 3 | Ustawienie decyzji (`Case.decision`) | Wpis `CaseHistory` (`DecisionSet`), wysłanie `Notification` do klienta z treścią decyzji |
| 4 | Akcja "Poproś o uzupełnienie danych" | Przejście do `OczekiwanieNaKlienta` (§4), wpis `CaseHistory` (`InfoRequested`), wysłanie `Notification` (e-mail) do klienta |
| 5 | Klient odpowiada w Portalu Klienta (`Message`, `direction=Inbound`) | Powrót ze statusu `OczekiwanieNaKlienta` do statusu poprzedniego (§4), wpis `CaseHistory` (`MessageSent`), `Notification` **systemowe** do właściciela sprawy (`ownerId`) — "klient odpowiedział" |
| 6 | Sprawa wchodzi w status `WyslanaDoProducenta` (I `ManufacturerSLA.responseDays` ustawione) LUB w status `RealizacjaDecyzji` (I `ManufacturerSLA.repairDays` ustawione) | Automatyczne wyliczenie `Case.nextActionDueDate = data wejścia w status + odpowiednio responseDays/repairDays` |
| 7 | Sprawa w `WyslanaDoProducenta`/`OczekiwanieNaDecyzjeProducenta` dłużej niż `ManufacturerSLA.reminderAfterDays` dni bez odpowiedzi producenta (I pole ustawione — `null` = przypomnienia wyłączone dla tego producenta) | Zadanie cykliczne wysyła `Notification` (przypomnienie) do producenta oraz `Notification` systemowe do właściciela sprawy |
| 8 | Sprawa aktywna dłużej niż `ManufacturerSLA.escalationAfterDays` dni od wejścia w status, którego dotyczy SLA (I pole ustawione — `null` = eskalacja wyłączona dla tego producenta) | Zadanie cykliczne podnosi `priority` do `Wysoki` (jeśli jeszcze nie), wysyła `Notification` systemowe do roli `Kierownik` danego `Shop` |
| 9 | Sprawa w `GotowaDoOdbioru` dłużej niż `ManufacturerAutomation.autoCloseDays` dni I `autoCloseEnabled=true` | Zadanie cykliczne przechodzi sprawę do `Zamknieta`, wpis `CaseHistory` (`CaseClosed`, z adnotacją "zamknięcie automatyczne") |
| 10 | Sprawa `Zamknieta` dłużej niż okres retencji (`Setting` `case.archival.retentionMonths`) | Zadanie cykliczne przechodzi sprawę do `Zarchiwizowana` (§5) |
| 11 | Wybór producenta z listy w formularzu zgłoszenia (pracownik lub kreator klienta) | Auto-uzupełnienie `CaseItem.manufacturerId` z `Product.manufacturerId`; jeśli wybrano markę zamiast producenta wprost — rozwiązanie `Brand.manufacturerId` (patrz prototyp: auto-rozpoznawanie producenta po marce) |
| 12 | Wpisanie numeru zamówienia w kreatorze zgłoszenia | Wyszukanie `Order`/`OrderItem` po numerze; jeśli znaleziono — auto-uzupełnienie danych produktu (`Product`, `serialNumber`, `invoiceNumber`) w formularzu |
| 13 | Włączenie Portalu Klienta dla sprawy (`clientPortalEnabled: false → true`) — `POST /cases/:id/portal/enable`, Zadanie 9 | Wygenerowanie `clientAccessCodeHash` (kod jawny pokazany pracownikowi **tylko raz**, w momencie generowania), wpis `CaseHistory` (`PortalEnabled`) |
| 14 | Wygenerowanie bezpiecznego linku (token) — `POST /cases/:id/portal/secure-link`, Zadanie 9 | Wygenerowanie `clientAccessTokenHash`, `clientAccessTokenUsed=false`; po pierwszym udanym użyciu tokenu do logowania: `clientAccessTokenUsed=true` (token jednorazowy) |
| 15 | Wydanie produktu zastępczego (`ReplacementProduct.issuedAt` ustawiane, zwykle w statusie `RealizacjaDecyzji` przy `decision=WymianaProduktu`) | Wpis `CaseHistory` (`ReplacementProductIssued`, `visibleForCustomer=true`), wysyłka `Notification` do klienta z informacją o wydanym produkcie zastępczym i (jeśli ustawiony) planowanym terminie zwrotu (`plannedReturnAt`) |
| 16 | Zwrot produktu zastępczego (`ReplacementProduct.returnedAt` ustawiane) | Wpis `CaseHistory` (`ReplacementProductReturned`, `visibleForCustomer=true`), zapis stanu zwracanego produktu (`conditionOnReturn`) |
| 17 | Zmiana opiekuna sprawy (`Case.ownerId` aktualizowane — akcja "Przenieś sprawę", `cases.assign`) | Wpis `CaseHistory` (`OwnerChanged`, `previousValue`/`newValue` = poprzedni/nowy `ownerId`, `visibleForCustomer=false` — wewnętrzne, patrz BR-079/BR-104), `Notification` systemowe do nowego opiekuna ("przypisano Ci sprawę") |
| 18 | Dodanie dokumentu do sprawy lub pozycji (`Document` powstaje, `documents.upload`) | Wpis `CaseHistory` (`DocumentAdded`, `visibleForCustomer` = `true` **wyłącznie** gdy `Document.visibility=Public`, zgodnie z BR-079/BR-080) |
| 19 | Oznaczenie dokumentu jako błędny (`Document.status → Bledny`, `documents.markInvalid`) | Wpis `CaseHistory` (`DocumentMarkedInvalid`, `newValue` = podany powód) — dokument **nie jest usuwany** (BR-020 z dokumentu źródłowego), pozostaje widoczny ze statusem błędnym |
| 20 | Zmiana statusu zdarzenia logistycznego (`Logistics.status` aktualizowane) | Wpis `CaseHistory` (`LogisticsStatusChanged`, `previousValue`/`newValue`); gdy `type=ShipToManufacturer` i nowy `status=Delivered` w statusie `OczekiwanieNaKuriera` — spełnia warunek blokujący przejście do `WyslanaDoProducenta` (patrz §8, `STATE_MACHINE.md`) |
| 21 | Wyłączenie Portalu Klienta dla sprawy (`clientPortalEnabled: true → false`, `cases.portal.manage`) — `POST /cases/:id/portal/disable`, Zadanie 9 | Unieważnienie `clientAccessCodeHash`/`clientAccessTokenHash` (ustawienie na `null` — dotychczasowy kod/link przestaje działać), wpis `CaseHistory` (`PortalDisabled`) — domyka asymetrię względem poz. 13 (BR-077) |
| 22 | Ręczna edycja `Case.nextAction`/`nextActionDueDate` przez pracownika, niezależna od zmiany statusu (`cases.edit`) | Wpis `CaseHistory` (`NextActionUpdated`, `previousValue`/`newValue`, `visibleForCustomer=false` — BR-104) — **nie emituje zdarzenia domenowego**, patrz `EVENTS.md` §5.3 |

> **SLA producenta (`ManufacturerSLA`, patrz `DATABASE.md` §14a) zastąpiło
> wcześniejszy placeholder** "SLA do zdefiniowania per Manufacturer,
> Setting `manufacturer.sla.days`" oraz booleany `ManufacturerAutomation.
> autoReminders`/`autoEscalation` — teraz to konkretne, niezależnie
> nullable progi dniowe per producent (`responseDays`/`repairDays`/
> `reminderAfterDays`/`escalationAfterDays`), zgodnie z przykładem z
> code review: Producent A (14/21/10/14 dni) vs. Producent B (30 dni
> odpowiedzi, brak przypomnień/eskalacji). Wiersze 6–8 wyżej to pełna
> logika egzekwowania tych progów.

---

## 7. Mapa statusów → domyślny `nextAction` i powiadomienia klienta

| Status | Domyślny `nextAction` (pracownik) | Powiadom klienta? | Publiczny etap (Portal Klienta) |
|---|---|---|---|
| Nowa | Zweryfikuj kompletność zgłoszenia i przyjmij produkt od klienta | Tak (potwierdzenie zgłoszenia) | Zgłoszona |
| Przyjeta | Sprawdź stan produktu i udokumentuj zdjęciami | Nie | Przyjęta do realizacji |
| Weryfikacja | Zweryfikuj kompletność dokumentacji | Nie | Przyjęta do realizacji |
| OczekiwanieNaKlienta | Oczekiwanie na odpowiedź klienta | Tak (treść prośby) | *(bez zmiany etapu publicznego)* |
| WeryfikacjaWewnetrzna | Przygotuj wewnętrzną ocenę sprawy (rękojmia) | Nie | Przyjęta do realizacji |
| GotowaDoWysylki | Przekaż produkt do wysyłki / kuriera | Nie | W trakcie rozpatrywania |
| OczekiwanieNaKuriera | Oczekiwanie na odbiór produktu przez kuriera | Nie | W trakcie rozpatrywania |
| WyslanaDoProducenta | Monitoruj odpowiedź producenta | Tak | W trakcie rozpatrywania |
| OczekiwanieNaDecyzjeProducenta | Sprawdź termin SLA producenta | Nie | W trakcie rozpatrywania |
| OczekiwanieNaDecyzjeKierownika | Kierownik: podejmij decyzję w sprawie | Nie | W trakcie rozpatrywania |
| RealizacjaDecyzji | Zrealizuj podjętą decyzję | Tak (treść decyzji) | Decyzja podjęta |
| GotowaDoOdbioru | Powiadom klienta o możliwości odbioru | Tak | Zakończona |
| Zamknieta | — | Tak (podsumowanie) | Zakończona |
| Anulowana | — | Tak | *(stan specjalny)* |
| Zarchiwizowana | — | Nie | *(stan specjalny)* |

> Mapowanie statusów wewnętrznych na 5 uproszczonych etapów publicznych
> (Zgłoszona / Przyjęta / W trakcie / Decyzja / Zakończona) jest już
> zaimplementowane w prototypie jako `public-status-mapper.js` — jedyne
> miejsce znające `CaseStatus` po stronie Portalu Klienta (patrz
> `docs/DECISIONS.md`, code review Portalu Klienta pkt 1). Ta tabela jest
> źródłem prawdy, z którego backend i `public-status-mapper.js` powinny
> być generowane/synchronizowane.

---

## 8. Warunki blokujące przejścia (walidacja biznesowa)

| Przejście | Warunek wymagany |
|---|---|
| `OczekiwanieNaDecyzjeProducenta` → `RealizacjaDecyzji` | `Case.decision` musi być ustawione |
| `OczekiwanieNaDecyzjeKierownika` → `RealizacjaDecyzji` | `Case.decision` musi być ustawione **przez użytkownika z rolą Kierownik lub Administrator** (patrz `RBAC.md`, `cases.decision.approve`) |
| Dowolne → `RealizacjaDecyzji`, gdy `decision = ZwrotSrodkow` | `Case.requiresManagerApproval` musi być `true`, a decyzję musiał ustawić Kierownik/Administrator — zwrot środków nigdy nie jest jednoosobową decyzją Pracownika |
| `GotowaDoOdbioru` → `Zamknieta` (ręcznie) | Brak twardego warunku — decyzja pracownika, że klient odebrał produkt |
| Dowolny aktywny → `Anulowana` | Wymaga podania powodu (Note lub `CaseHistory.newValue`) |
| Tworzenie sprawy z `submissionMode=BezposrednioDoProducenta` | `complaintType` musi być `Warranty` (§1, `BUSINESS_RULES.md` BR-097, `ERROR_CODES.md` CASE-007) |
| Tworzenie sprawy z `complaintType=StatutoryWarranty` | `submissionMode` musi być `PrzezSklep` (§1, `BUSINESS_RULES.md` BR-097, `ERROR_CODES.md` CASE-007) |
| Dowolna zmiana statusu | Musi być zgodna z automatem stanów właściwej ścieżki (§2, `STATE_MACHINE.md`) — przejście nieosiągalne z bieżącego statusu jest odrzucane (`BUSINESS_RULES.md` BR-098, `ERROR_CODES.md` CASE-001) |
| `Weryfikacja` → `GotowaDoWysylki` (`Warranty`) / `WeryfikacjaWewnetrzna` (`StatutoryWarranty`) | Dokumentacja pozycji reklamacji kompletna: numer seryjny jeśli `Manufacturer.requiresSerialNumber=true`, numer ramy jeśli `requiresFrameNumber=true`, dowód zakupu jeśli `requiresProofOfPurchase=true` i brak dopasowania do `OrderItem`, minimum 2 zdjęcia uszkodzenia, liczba/rozmiar załączników w granicach `Manufacturer.maxPhotos`/`maxAttachmentSizeMb` (`BUSINESS_RULES.md` BR-102, `ERROR_CODES.md` CASE-002/CASE-004–006/FILE-001/002/004) |
| `OczekiwanieNaKuriera` → `WyslanaDoProducenta` | Istnieje `Logistics` z `type=ShipToManufacturer` i `status=Delivered` dla tej sprawy (§6 poz. 20, `STATE_MACHINE.md`) |
| Dowolna modyfikacja sprawy (status, decyzja, dokumenty, notatki) | Sprawa nie może być w statusie końcowym — `Zamknieta`/`Anulowana`/`Zarchiwizowana` (§2.3 "status aktywny", `BUSINESS_RULES.md` BR-103, `ERROR_CODES.md` CASE-008) |

---

## 9. Diagram całościowy (uproszczony, obie ścieżki + stany boczne)

```
                              ┌─────────────────────────────┐
                              │     OczekiwanieNaKlienta      │◀──── (z dowolnego statusu aktywnego)
                              └───────────────┬───────────────┘
                                              │ (klient odpowiada)
                                              ▼
Nowa ──▶ Przyjeta ──▶ Weryfikacja ──┬──▶ GotowaDoWysylki ──▶ OczekiwanieNaKuriera ──▶ WyslanaDoProducenta ──▶ OczekiwanieNaDecyzjeProducenta ──┐
                                     │                                                    (ścieżka: Warranty)                                    │
                                     └──▶ WeryfikacjaWewnetrzna ──▶ OczekiwanieNaDecyzjeKierownika ────────────────────────────────────────────┤
                                          (ścieżka: StatutoryWarranty)                                                                           │
                                                                                                                                                   ▼
                                                                                                                          RealizacjaDecyzji ──▶ GotowaDoOdbioru ──▶ Zamknieta ──▶ Zarchiwizowana

[dowolny status aktywny] ──▶ Anulowana  (stan końcowy, poza powyższym przepływem)
```
