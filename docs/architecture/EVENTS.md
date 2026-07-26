markdown
# EVENTS.md — SmartRMA AI

## System zdarzeń domenowych (dokumentacja techniczna)

Ten dokument opisuje **mechanizm** zdarzeń domenowych: kontrakty, koperty,
zasady publikowania, kolejność, idempotencję, obsługę błędów i wersjonowanie.

**Granica dokumentu — czytaj zanim cokolwiek tu dopiszesz:**


|
 Pytanie 
|
 Dokument 
|
|
---
|
---
|
|
*
Kiedy biznesowo coś się dzieje?
*
 (wyzwalacze, warunki przejść, kogo powiadamiamy) 
|
`WORKFLOW.md`
 §6, §7, §8 — 
**
jedyne źródło prawdy
**
|
|
*
Jak technicznie zdarzenie przepływa przez system?
*
|
 ten dokument 
|
|
*
Jakie pola ma encja?
*
|
`DATABASE.md`
 / 
`schema.prisma`
|
|
*
Kto ma prawo wywołać operację?
*
|
`RBAC.md`
|
|
*
Jaka reguła biznesowa za tym stoi?
*
|
`docs/source/BUSINESS_RULES.md`
 + 
`BUSINESS_RULES.md`
|

Katalog w §5 **nie powtarza** warunków biznesowych — odsyła do numeru wiersza
w `WORKFLOW.md` §6. Jeśli warunek wyzwolenia się zmienia, zmienia się
`WORKFLOW.md`; tutaj zmienia się wyłącznie kontrakt techniczny.

---

# 1. Model zdarzeń

## 1.1 Czym zdarzenie jest, a czym nie jest

Zdarzenie domenowe to **nazwany fakt, który już zaszedł i został utrwalony**.
Nigdy rozkaz (`case.close` — źle), zawsze czas przeszły (`case.closed` — dobrze).

Zdarzenia służą **wyłącznie** do luźnego wiązania modułów. Nie odpowiadają za
poprawność biznesową.

## 1.2 Niezmienniki vs reakcje — podział rozstrzygający

Najważniejsza zasada tego dokumentu. Dla każdej operacji trzeba rozstrzygnąć,
po której stronie leży dana czynność:

**Niezmienniki — wykonywane w tej samej transakcji co mutacja stanu, w
`*.service.ts`, NIE jako subskrybent:**
- walidacja dozwolonego przejścia (`case-status.rules.ts`, `WORKFLOW.md` §2, §8),
- wpis `CaseHistory` (`docs/source/BUSINESS_RULES.md` BR-002),
- aktualizacja `Case.nextAction` / `nextActionDueDate` (`WORKFLOW.md` §6 poz. 2 i 6),
- wpis `AuditLog` (BR-088),
- **utworzenie rekordu `Notification` ze statusem `Pending`** (patrz §11 —
  nie mylić z jego wysłaniem),
- ustawienie znaczników stanu (`closedAt`, `decisionAt`, `clientAccessTokenUsed`).

**Reakcje — wykonywane po zatwierdzeniu transakcji, przez subskrybentów:**
- faktyczna wysyłka `Notification` (`IMailService`),
- przeliczenia pochodne i cache widoków dashboardu,
- przyszła analiza AI (funkcja doradcza — `docs/source/CLAUDE.md`),
- przyszłe integracje zewnętrzne (portale B2B producentów, kurierzy).

**Uzasadnienie podziału:** awaria serwera SMTP nie może wycofać zmiany statusu
sprawy, a jednocześnie utrata zdarzenia w pamięci nie może spowodować, że
klient nigdy nie dostanie powiadomienia. Stąd rekord `Notification.Pending`
powstaje transakcyjnie, a zdarzenie jedynie **przyspiesza** jego wysyłkę
(patrz §11.2 — mechanizm odzyskiwania).

## 1.3 Moduły (publisherzy i subskrybenci)

Nazwy modułów NestJS używane w całym dokumencie:

`Cases`, `CaseItems`, `Documents`, `Messages`, `Notes`, `Replacement`,
`Logistics`, `Manufacturers`, `Notifications`, `Audit`, `Scheduler`
(zadania cykliczne), `Reports` (planowany), `AIAssistant` (planowany).

---

# 2. Koperta zdarzenia

Każde zdarzenie ma stałą kopertę. `payload` opisany jest per zdarzenie w §5.

```ts
interface DomainEvent<TPayload = unknown> {
  eventId: string;        // UUID — klucz idempotencji (§8)
  eventName: string;      // np. "case.status_changed" (§3)
  eventVersion: number;   // wersja schematu payloadu (§4)
  occurredAt: Date;       // czas COMMIT transakcji źródłowej, nie czas emisji
  companyId: string;      // korzeń dzierżawy — obowiązkowy (§12.4)
  aggregateType: string;  // "Case" | "Document" | "CaseItem" | ...
  aggregateId: string;
  actorUserId: string | null; // null = system/Scheduler/klient bez konta User
  correlationId: string;  // spina łańcuch reakcji jednego żądania HTTP/zadania
  causationId: string | null; // eventId zdarzenia, które wywołało to zdarzenie
  payload: TPayload;
}
```

**Uwagi projektowe:**

- `companyId` jest **obowiązkowy w kopercie, nie w payloadzie** — każdy
  subskrybent musi móc odfiltrować dzierżawę bez zaglądania w treść. To
  wymóg pod przyszły broker współdzielony między firmami (§12.4).
- `actorUserId` jest nullable, bo klient Portalu Klienta **nie ma rekordu
  `User`** (BR-077). Zdarzenia zainicjowane przez klienta mają `null` i
  identyfikują go pośrednio przez `aggregateId` sprawy.
- `occurredAt` = czas commitu, nie czas wywołania metody. Przy retry
  subskrybenta zachowuje pierwotną wartość.

## 2.1 Zasady konstrukcji payloadu

1. **Identyfikatory, nie encje.** Payload nigdy nie zawiera całego obiektu
   `Case`. Subskrybent doczytuje z bazy (po commicie dane są widoczne).
2. **Wyjątek: wartości, które zmieniają znaczenie w czasie.** `previousStatus`
   i `newStatus` MUSZĄ być w payloadzie, bo subskrybent czytający `Case.status`
   z bazy może zobaczyć już kolejny status (np. przy automatycznym łańcuchu
   `GotowaDoOdbioru → Zamknieta`). To samo dotyczy `previousOwnerId`.
3. **Zero danych osobowych w payloadzie.** Bez imienia, e-maila, telefonu,
   adresu (`SECURITY_AND_GDPR.md` §2 — zasada minimalizacji). Subskrybent,
   który potrzebuje danych klienta do szablonu, czyta je z `Customer` w
   momencie renderowania. Ma to konsekwencję praktyczną: gdy zdarzenia trafią
   kiedyś do brokera z retencją, log zdarzeń nie stanie się drugim,
   nieudokumentowanym zbiorem danych osobowych do obsługi w ramach RODO.
4. **Payload tylko rozszerzalny addytywnie** w obrębie jednej wersji (§4).

---

# 3. Konwencja nazewnictwa

{agregat}.{zdarzenie_w_czasie_przeszłym}


Agregat pisany małą literą, w liczbie pojedynczej, zgodnie z nazwą modelu
Prisma: `case`, `case_item`, `document`, `message`, `replacement`,
`logistics`.

Nazwa zdarzenia w `snake_case`, zawsze dokonana: `created`, `status_changed`,
`marked_invalid`, `issued`, `returned`.

**Nie tworzymy** zdarzeń typu `case.updated` — zbyt ogólne, zmusza każdego
subskrybenta do zgadywania, co się właściwie zmieniło.

---

# 4. Wersjonowanie zdarzeń

`eventVersion` startuje od `1` dla każdej nazwy zdarzenia niezależnie.

**Zmiana addytywna** (nowe pole opcjonalne w payloadzie) — bez zmiany wersji.
Subskrybenci muszą ignorować nieznane pola.

**Zmiana łamiąca** (usunięcie pola, zmiana typu, zmiana znaczenia) — inkrement
`eventVersion`. Publisher w okresie przejściowym emituje **obie wersje**
równolegle; subskrybenci migrują pojedynczo; po migracji ostatniego
subskrybenta stara wersja jest usuwana, a fakt odnotowany w `DECISIONS.md`.

**Nowa nazwa zamiast nowej wersji** — gdy zmienia się sam fakt biznesowy, a
nie tylko jego reprezentacja. Przykład: gdyby decyzja przestała być atrybutem
sprawy i stała się osobną encją, powstałoby `decision.recorded`, nie
`case.decision_set` v2.

**Rejestr kontraktów w kodzie:** każdy payload to interfejs TypeScript w
`src/events/contracts/` (jeden plik na agregat), a nazwy zdarzeń — stałe w
`src/events/event-names.ts`. Literały stringowe rozsiane po serwisach są
zabronione: uniemożliwiają refaktor i sprawiają, że lista subskrybentów
przestaje być wyszukiwalna.

---

# 5. Katalog kontraktów

Kolumna **Wyzwalacz** wskazuje pozycję w `WORKFLOW.md` §6 — tam, i tylko tam,
opisany jest warunek biznesowy.

## 5.1 Agregat `Case`

| Zdarzenie | Publisher | Wyzwalacz | Payload (ponad kopertę) | Subskrybenci |
|---|---|---|---|---|
| `case.created` | Cases | §6 poz. 1 | `caseNumber`, `complaintType`, `submissionMode`, `source`, `customerId`, `ownerId`, `itemCount`, `caseHistoryId` | Notifications, Reports\*, AIAssistant\* |
| `case.status_changed` | Cases / Scheduler | §6 poz. 2, 9, 10 | `previousStatus`, `newStatus`, `complaintType`, `automatic: boolean`, `caseHistoryId` | Notifications, Scheduler, Reports\* |
| `case.decision_set` | Cases | §6 poz. 3 | `decision`, `decisionByUserId`, `requiresManagerApproval`, `caseHistoryId` | Notifications, Reports\* |
| `case.info_requested` | Cases | §6 poz. 4 | `requestedItems: string[]`, `messageText`, `caseHistoryId` | Notifications |
| `case.customer_replied` | Messages | §6 poz. 5 | `messageId`, `channel`, `restoredStatus` | Notifications |
| `case.owner_changed` | Cases | §6 poz. 17 | `previousOwnerId`, `newOwnerId`, `caseHistoryId` | Notifications |
| `case.portal_enabled` | Cases | §6 poz. 13 | `caseHistoryId` | Notifications |
| `case.portal_disabled` | Cases | §6 poz. 21 | `caseHistoryId` | Notifications |
| `case.portal_token_generated` | Cases | §6 poz. 14 | `tokenExpiresAt` | Notifications |
| `case.sla_reminder_due` | Scheduler | §6 poz. 7 | `manufacturerId`, `daysWaiting`, `reminderAfterDays` | Notifications |
| `case.sla_escalated` | Scheduler | §6 poz. 8 | `manufacturerId`, `daysWaiting`, `previousPriority`, `newPriority` | Notifications |
| `case.updated` | Cases | Edycja opisu/oczekiwanego rozwiązania/priorytetu (`cases.edit`, `PATCH /cases/:id`) — dodane w Zadaniu 16 | `changedFields: string[]` | Reports\* |
| `case.note_added` | Cases | Dodanie notatki wewnętrznej (`notes.create`) — dodane w Zadaniu 16, patrz uwaga pod §10.2 | `noteId`, `caseHistoryId` | — |
| `case.message_added` | Cases | Wysłanie wiadomości do klienta, kierunek Outbound (`messages.send`) — dodane w Zadaniu 16, patrz uwaga pod §10.2 | `messageId`, `channel`, `direction`, `caseHistoryId` | Notifications\* |

\* moduł planowany — kontrakt zarezerwowany, subskrybent jeszcze nie istnieje.

**`case.status_changed` obsługuje wszystkie przejścia**, w tym boczne
(`OczekiwanieNaKlienta` — `WORKFLOW.md` §4), automatyczne zamknięcie (§6 poz. 9),
archiwizację (§6 poz. 10), anulowanie (§5) i ścieżkę
`BezposrednioDoProducenta` (§3.2). Flaga `automatic` odróżnia przejście
wykonane przez `Scheduler` (`actorUserId = null`) od decyzji człowieka —
subskrybent powiadomień używa jej do doboru szablonu.

Świadomie **nie ma** osobnych zdarzeń `case.closed` / `case.cancelled` /
`case.archived`. Dublowałyby `case.status_changed` i zmuszały każdego
subskrybenta do nasłuchiwania dwóch źródeł tej samej prawdy. Subskrybent
zainteresowany zamknięciem filtruje po `newStatus === 'Zamknieta'`.

> **Rewizja (Zadanie 16):** `case.note_added`/`case.message_added` **odwracają**
> wcześniejsze stwierdzenie w tym dokumencie (i w `WORKFLOW.md` §6, uwaga pod
> tabelą akcji automatycznych), że dodanie notatki i wysłanie wiadomości do
> klienta (kierunek Outbound) "celowo nie mają zdarzenia — to bezpośrednia
> akcja pracownika bez dodatkowych automatycznych konsekwencji poza samym
> zapisem". Przy implementacji modułu Cases (Zadanie 16) okazało się to zbyt
> wąskie: inne moduły (np. przyszłe Reports/AIAssistant) potrzebują
> jednolitego strumienia zdarzeń dla WSZYSTKICH mutacji sprawy, nie tylko
> tych ze statusem/decyzją. Oba zdarzenia niosą wyłącznie identyfikatory
> (`noteId`/`messageId` + `caseHistoryId`), zero treści notatki/wiadomości —
> nie zmienia to zasady minimalizacji danych z §2.1 pkt 3, tylko dodaje
> punkt zaczepienia dla przyszłych subskrybentów. `WORKFLOW.md` §6 pozostaje
> bez zmian redakcyjnych (wciąż poprawnie opisuje, że nie ma dodatkowej
> AKCJI biznesowej poza zapisem) — zmienia się wyłącznie fakt, że sam zapis
> jest teraz też ogłaszany zdarzeniem, zgodnie z `CaseHistoryAction` już od
> dawna istniejącym w zamkniętym enumie (§10.2).

## 5.2 Pozostałe agregaty

| Zdarzenie | Publisher | Wyzwalacz | Payload | Subskrybenci |
|---|---|---|---|---|
| `document.uploaded` | Documents | §6 poz. 18 | `documentId`, `caseItemId`, `category`, `visibility`, `fileType`, `caseHistoryId` | Notifications, AIAssistant\* |
| `document.marked_invalid` | Documents | §6 poz. 19 | `documentId`, `reason`, `caseHistoryId` | Notifications |
| `case_item.manufacturer_assigned` | CaseItems | §6 poz. 11 | `caseItemId`, `previousManufacturerId`, `newManufacturerId`, `resolvedFrom: 'product' \| 'brand' \| 'manual'`, `caseHistoryId` | Notifications, Scheduler |
| `replacement.issued` | Replacement | §6 poz. 15 | `replacementId`, `caseItemId`, `productIdentifier`, `plannedReturnAt`, `caseHistoryId` | Notifications, Scheduler |
| `replacement.returned` | Replacement | §6 poz. 16 | `replacementId`, `caseItemId`, `conditionOnReturn`, `caseHistoryId` | Notifications |
| `logistics.status_changed` | Logistics | §6 poz. 20 | `logisticsId`, `type`, `previousStatus`, `newStatus`, `trackingNumber` | Notifications |

`case_item.manufacturer_assigned` ma `Scheduler` wśród subskrybentów, bo
zmiana producenta zmienia obowiązujące `ManufacturerSLA` — zaplanowane
przypomnienia/eskalacje trzeba przeliczyć (`WORKFLOW.md` §6 poz. 6–8).

## 5.3 Pozycje `WORKFLOW.md` §6, które celowo NIE emitują zdarzeń

| Poz. | Dlaczego nie zdarzenie |
|---|---|
| 6 (wyliczenie `nextActionDueDate` z `ManufacturerSLA`) | Deterministyczne wyliczenie wykonywane w tej samej transakcji co zmiana statusu — niezmiennik (§1.2), nie reakcja. Zdarzeniem jest `case.status_changed`, które je poprzedza. |
| 12 (wyszukanie zamówienia po numerze) | Operacja odczytu w formularzu, przed powstaniem sprawy. Brak faktu domenowego do ogłoszenia. |
| 22 (ręczna edycja `nextAction`/`nextActionDueDate`, `NextActionUpdated`) | *(Zadanie 6)* Zapis `CaseHistory` jest tu całością operacji — nie ma modułu, który musiałby na to zareagować (brak `Notification`, brak przeliczeń pochodnych). Gdyby w przyszłości pojawiła się taka reakcja, to jest sygnał do dodania zdarzenia, nie do domyślnego jego braku. |

Ta tabela jest częścią kontraktu dokumentu: jeśli ktoś doda pozycję do
`WORKFLOW.md` §6, musi albo dopisać zdarzenie w §5, albo uzasadnić tutaj,
dlaczego zdarzenia nie ma. Brak wpisu w którymkolwiek miejscu = luka.

---

# 6. Zasady publikowania

## 6.1 Publikacja po commicie — obowiązkowa

[transakcja]
walidacja przejścia (case-status.rules.ts)
UPDATE Case
INSERT CaseHistory
INSERT AuditLog
INSERT Notification (status = Pending)
[COMMIT]
↓
publish(event) ← dopiero tutaj


Publikacja przed commitem jest zabroniona: subskrybent mógłby odczytać stan
sprzed zapisu albo zareagować na transakcję, która się wycofała (wysłany
e-mail o decyzji, której nie ma w bazie, jest nieodwracalny).

**Implementacja MVP:** `IEventBus.publish()` wywoływane w serwisie **po**
zakończeniu `prisma.$transaction()`, nie w jego wnętrzu. Świadomie nie
używamy hooków transakcyjnych Prismy — jawne wywołanie po bloku
transakcyjnym jest czytelniejsze i łatwiejsze do przetestowania.

## 6.2 Kto publikuje

Publikuje **wyłącznie moduł będący właścicielem agregatu**. `Notifications`
nigdy nie publikuje `case.*`. Zapobiega to sytuacji, w której nie da się
ustalić, skąd zdarzenie pochodzi.

## 6.3 Zdarzenia nie kaskadują bez ograniczeń

Subskrybent **może** wywołać operację, która sama publikuje zdarzenie
(np. `case.customer_replied` → zmiana statusu → `case.status_changed`), ale:
- łańcuch jest ograniczony do **głębokości 2** (`causationId` pozwala go
  odtworzyć),
- głębszy łańcuch traktujemy jako sygnał, że logika powinna być jawnym
  wywołaniem serwisu, nie ukrytą kaskadą.

Ograniczenie egzekwowane w `IEventBus` (licznik głębokości w kontekście
`correlationId`), z logowaniem ostrzeżenia przy przekroczeniu.

---

# 7. Kolejność wykonywania

## 7.1 Gwarancje w MVP

| Gwarancja | MVP (in-process) |
|---|---|
| Kolejność zdarzeń dla jednego agregatu | zachowana (jeden proces, publikacja synchroniczna po commicie) |
| Kolejność między agregatami | **brak gwarancji** — nie polegać |
| Kolejność wykonania subskrybentów tego samego zdarzenia | **niezdefiniowana** |

## 7.2 Wynikające z tego zasady dla subskrybentów

1. Subskrybent **nie może zakładać**, że inny subskrybent już się wykonał.
   Jeśli B potrzebuje wyniku A — to nie są dwa subskrybenty, tylko jeden,
   albo A powinno publikować własne zdarzenie, na które reaguje B.
2. Subskrybent **nie może zakładać**, że jest jedyny.
3. Subskrybenty są wykonywane **asynchronicznie względem żądania HTTP** —
   odpowiedź API nie czeka na ich zakończenie. Skutek uboczny nie może więc
   być wymagany do poprawności odpowiedzi (kolejny argument za trzymaniem
   `Notification.Pending` w transakcji, §11).

---

# 8. Idempotencja

## 8.1 Klucz i zasada

Kluczem idempotencji jest `eventId`. Każdy subskrybent wykonujący skutek
uboczny musi być odporny na wielokrotne otrzymanie tego samego `eventId`.

W MVP transport in-process nie robi retry, więc duplikat jest mało prawdopodobny
— ale **zasadę wprowadzamy od początku**, bo dopisanie idempotencji do
istniejących subskrybentów po przejściu na broker z semantyką *at-least-once*
(§12) jest znacznie kosztowniejsze niż napisanie ich tak od razu.

## 8.2 Trzy dopuszczalne mechanizmy

1. **Naturalna idempotencja przez stan** (preferowana). Subskrybent sprawdza
   stan docelowy przed działaniem: wysyłka `Notification` dotyczy wyłącznie
   rekordów o `status = Pending`; rekord przechodzi w `Sent` w tej samej
   operacji. Ponowne przetworzenie zdarzenia nie znajduje nic do wysłania.
2. **Klucz naturalny w bazie.** Przy tworzeniu rekordów pochodnych używamy
   ograniczeń unikalności, które strukturalnie blokują duplikat
   (wzorzec już obecny w modelu: `@@unique([companyId, code, channel])` na
   `NotificationTemplate`, `@@id([roleId, permissionId])` na `RolePermission`).
3. **Tabela `ProcessedEvent`** — dopiero gdy 1 i 2 nie wystarczą.
   **Nie wprowadzamy jej w MVP** (patrz §13 poz. 4): przy transporcie bez
   retry byłaby tabelą rosnącą w nieskończoność bez jednego realnego
   zastosowania. Jest natomiast wymogiem wejścia na broker (§12.2).

## 8.3 Czego idempotencja NIE obejmuje

`CaseHistory` i `AuditLog` nie są chronione mechanizmem idempotencji zdarzeń,
bo powstają **w transakcji**, nie w subskrybencie (§1.2). Atomowość transakcji
jest tu wystarczającą i mocniejszą gwarancją.

---

# 9. Obsługa błędów

## 9.1 Zasada izolacji

Wyjątek w subskrybencie:
- **nigdy** nie propaguje się do publishera,
- **nigdy** nie wycofuje transakcji biznesowej (ta jest już zatwierdzona),
- **nigdy** nie przerywa pozostałych subskrybentów tego samego zdarzenia.

`IEventBus` opakowuje każde wywołanie subskrybenta w `try/catch`.

## 9.2 Co się dzieje z błędem

| Krok | Działanie |
|---|---|
| 1 | Log strukturalny: `eventId`, `eventName`, `correlationId`, nazwa subskrybenta, stack trace |
| 2 | Jeśli błąd dotyczy wysyłki powiadomienia — `Notification.status = Failed`, `failureReason` wypełnione (pola istnieją w modelu, `DATABASE.md` §28) |
| 3 | Brak wpisu w `AuditLog` — `AuditLog` rejestruje zmiany danych (BR-088), nie awarie techniczne |
| 4 | Odzyskanie: zadanie cykliczne `Scheduler` (§11.2) |

## 9.3 Brak cichego połykania błędów

Zabronione jest `catch {}` bez logu. Nieudana wysyłka powiadomienia do klienta
jest zdarzeniem operacyjnie istotnym — musi być widoczna dla Administratora
przez uprawnienie `notifications.view` (`RBAC.md`).

## 9.4 Powtarzalne awarie

Subskrybent, który zawodzi systematycznie (np. trwale niedostępny SMTP), nie
blokuje systemu — rekordy zostają w `Pending`/`Failed` i są retransmitowane
przez zadanie cykliczne z ograniczeniem liczby prób. Docelowy DLQ: §12.3.

---

# 10. Powiązanie z `CaseHistory`

## 10.1 Kierunek zależności

**`CaseHistory` powstaje w transakcji, zdarzenie tylko ją referuje.**
Subskrybent nigdy nie zapisuje `CaseHistory`. Odwrotny kierunek (historia
tworzona przez subskrybenta) oznaczałby, że utrata zdarzenia w pamięci = luka
w niemodyfikowalnym dzienniku biznesowym, co łamie BR-002 i BR-090.

Dlatego większość zdarzeń w §5 niesie `caseHistoryId` — subskrybent, który
potrzebuje treści wpisu (np. do szablonu powiadomienia), czyta rekord, zamiast
odtwarzać go z payloadu.

## 10.2 `CaseHistoryAction` jest zamkniętym enumem

20 wartości (`schema.prisma`). **Nowe zdarzenie nie może wprowadzić nowej
wartości historii bez migracji.** Przy projektowaniu zdarzenia obowiązuje
kolejność: najpierw sprawdź, czy odpowiadająca akcja istnieje w enumie; jeśli
nie — to jest zmiana modelu danych do zatwierdzenia (`DATABASE.md` + migracja),
a nie detal implementacyjny subskrybenta.

Aktualne mapowanie zdarzeń na akcje historii (wszystkie istnieją w enumie):

| Zdarzenie | `CaseHistoryAction` |
|---|---|
| `case.created` | `CaseCreated` |
| `case.status_changed` | `StatusChanged` (+ `CaseClosed`/`CaseCancelled`/`CaseArchived` dla stanów końcowych) |
| `case.decision_set` | `DecisionSet` |
| `case.info_requested` | `InfoRequested` |
| `case.customer_replied` | `MessageSent` |
| `case.owner_changed` | `OwnerChanged` |
| `case.portal_enabled` | `PortalEnabled` |
| `case.portal_disabled` | `PortalDisabled` *(dodane w Zadaniu 6 — brakujący odpowiednik enuma miał wartość od dawna, ale zdarzenie i wiersz `WORKFLOW.md` nie istniały)* |
| `document.uploaded` | `DocumentAdded` |
| `document.marked_invalid` | `DocumentMarkedInvalid` |
| `case_item.manufacturer_assigned` | `ManufacturerAssigned` |
| `replacement.issued` | `ReplacementProductIssued` |
| `replacement.returned` | `ReplacementProductReturned` |
| `logistics.status_changed` | `LogisticsStatusChanged` *(dodane w Zadaniu 5)* |
| `case.sla_escalated` | `PriorityChanged` *(dodane w Zadaniu 5; nazwa celowo nie odwołuje się do SLA — pole `Case.priority` może zmienić się też ręcznie, bez potrzeby kolejnej wartości enuma)* |
| `case.updated` | `PriorityChanged` (gdy zmienia się `priority`) — **poza tym `case.updated` nie zapisuje osobnego wpisu `CaseHistory`** dla `description`/`requestedResolution` (brak dedykowanej wartości enuma dla samej edycji opisu; `AuditLog` i tak niesie diff, patrz BR-088) *(dodane w Zadaniu 16)* |
| *(brak zdarzenia, §5.3 poz. 22)* | `NextActionUpdated` — ręczna edycja `nextAction`/`nextActionDueDate`, niezależna od zmiany statusu |
| `case.note_added` | `NoteAdded` *(od Zadania 16 — wcześniej bez zdarzenia, patrz rewizja pod §5.1)* |
| `case.message_added` | `MessageSent` *(kierunek `Outbound`; od Zadania 16 — wcześniej bez zdarzenia, patrz rewizja pod §5.1)* |

Wszystkie 20 wartości `CaseHistoryAction` mają jawne miejsce w tej tabeli —
jako mapowanie ze zdarzenia, jako pozycja `§5.3` (niezmiennik bez zdarzenia),
albo jako jawnie udokumentowany wyjątek bez automatycznej reprezentacji.
Domknięte w Zadaniu 6, zrewidowane w Zadaniu 16 (`NoteAdded`/`MessageSent`
zyskały zdarzenia; `PriorityChanged` zyskał drugiego "właściciela" —
`case.updated` obok `case.sla_escalated`, bo pole może zmienić się ręcznie
lub automatycznie, dokładnie jak przewidywał komentarz przy `case.sla_escalated`
od Zadania 5).

## 10.3 `visibleForCustomer`

O widoczności wpisu decyduje serwis zapisujący historię, zgodnie z BR-079 —
nie subskrybent i nie payload zdarzenia. Zdarzenie nie zawiera tej flagi,
żeby nie powstało drugie miejsce, w którym trzeba ją utrzymywać.

---

# 11. Powiązanie z `Notification`

## 11.1 Podział na zapis i wysyłkę

Powiadomienia w SmartRMA to **rekord w bazie + osobna wysyłka**, nie
jednorazowe wywołanie SMTP:

[transakcja] INSERT Notification (status = Pending, body już wyrenderowany)
[COMMIT]
[zdarzenie] subskrybent Notifications → dispatch → IMailService
sukces → status = Sent, sentAt
błąd → status = Failed, failureReason


Trzy powody, wszystkie wynikające z istniejącego modelu:

1. `Notification.status = Pending` + `@@index([status])` istnieją w schemacie
   właśnie po to (`DATABASE.md` §28 wprost wskazuje zapytanie „znajdź
   powiadomienia `Pending` do wysłania").
2. `body` jest kopią **po** podstawieniu placeholderów, nie referencją do
   szablonu (`DATABASE.md` §28) — musi więc być wyrenderowany w momencie
   powstania faktu, nie w momencie wysyłki, żeby późniejsza edycja
   `NotificationTemplate` nie zmieniła treści historycznej.
3. Utrata zdarzenia degraduje system do opóźnienia, nie do utraty
   powiadomienia (§11.2).

## 11.2 Mechanizm odzyskiwania

Zadanie cykliczne `Scheduler` wyszukuje `Notification` w statusie `Pending`
starsze niż próg (proponowane: 5 minut) oraz `Failed` z liczbą prób poniżej
limitu, i ponawia wysyłkę. To jest **właściwa gwarancja dostarczenia** —
zdarzenie jest tylko szybką ścieżką.

## 11.3 Wybór szablonu

Subskrybent nie zna treści komunikatów. Mapuje `eventName` + kontekst na
`NotificationTemplate.code` (BR-091), a odbiorcę na `recipientType`.
Kto ma zostać powiadomiony przy danym przejściu — `WORKFLOW.md` §7,
kolumna „Powiadom klienta?". Tego tutaj nie powtarzamy.

Konwencja kodów szablonów: `{eventName}.{odbiorca}`, np.
`case.status_changed.customer`, `case.sla_reminder_due.employee`.

## 11.4 Zdarzenia nie tworzą powiadomień systemowych „przy okazji"

Każde powiadomienie ma szablon (BR-091). Subskrybent, który chciałby wysłać
komunikat bez szablonu, łamie tę regułę — brakujący szablon to wpis do seeda,
nie string w kodzie subskrybenta.

---

# 12. Wymagania dla przyszłego event busa

MVP: **in-process**, `@nestjs/event-emitter`, ukryty za portem `IEventBus`
(`src/events/event-bus.interface.ts`) — analogicznie do `IStorageService` i
`IMailService` (`DECISIONS.md`, „Architektura Clean Architecture light").
Kod biznesowy zna wyłącznie `IEventBus`.

**Odrzucone dla MVP:** broker (Kafka/RabbitMQ/Redis Streams) — przedwczesna
złożoność dla jednej firmy i jednego procesu. **Event Sourcing** — sprzeczny
z modelem stanowym z `DATABASE.md`; `CaseHistory` + `AuditLog` dają
audytowalność bez przebudowy zapisu.

Warunki, które musi spełnić docelowa implementacja — spisane teraz, żeby
subskrybenty pisane dziś nie wymagały przepisania:

## 12.1 Outbox transakcyjny
Zdarzenie zapisywane do tabeli `EventOutbox` **w tej samej transakcji** co
zmiana stanu; osobny proces publikuje je do brokera. Eliminuje okno między
commitem a publikacją (§6.1), w którym awaria procesu gubi zdarzenie.
Konsekwencja dla dzisiejszego kodu: żaden serwis nie może wołać `publish()`
inaczej niż zaraz po transakcji — inaczej podmiana na outbox nie będzie
przezroczysta.

## 12.2 At-least-once + deduplikacja
Broker gwarantuje dostarczenie co najmniej raz; wymagana tabela
`ProcessedEvent(eventId, subscriberName, processedAt)` z kluczem złożonym
(§8.2 poz. 3). Wszystkie subskrybenty muszą być już wtedy idempotentne — stąd
wymóg z §8.1 obowiązujący od dziś.

## 12.3 DLQ i polityka ponowień
Ponowienia z wykładniczym opóźnieniem, limit prób, kolejka martwych
komunikatów widoczna dla Administratora (`auditlog.view` / `notifications.view`).

## 12.4 Izolacja dzierżawy
`companyId` w kopercie (§2) jako klucz partycjonowania. Subskrybent
**nigdy** nie przetwarza zdarzenia spoza swojej dzierżawy
(`SECURITY_AND_GDPR.md` §12, BR-086).

## 12.5 Kolejność per agregat
Broker musi gwarantować kolejność w obrębie `aggregateId` (klucz partycji =
`aggregateId`). Kolejność globalna nie jest wymagana i nie wolno na niej
polegać (§7.1).

## 12.6 Rejestr schematów
`eventVersion` (§4) + kontrakty w `src/events/contracts/` to zalążek rejestru.
Przy brokerze wymagana walidacja payloadu przy publikacji, żeby niezgodny
kontrakt nie trafił do kolejki.

## 12.7 Retencja a RODO
Log zdarzeń w brokerze podlega tym samym zasadom retencji co reszta danych
(`SECURITY_AND_GDPR.md` §9). Zakaz danych osobowych w payloadzie (§2.1 poz. 3)
sprawia, że retencja zdarzeń nie tworzy odrębnego zbioru do obsługi żądań
usunięcia danych — to jest praktyczny powód tamtej zasady, nie estetyka.

---

# 13. Kwestie otwarte

1. **`ProcessedEvent` nie istnieje w MVP** (§8.2) — do wprowadzenia razem
   z brokerem, nie wcześniej.
2. ~~**Zdarzenia bez pozycji w `WORKFLOW.md` §6:** `case.owner_changed`,
   `document.uploaded`, `document.marked_invalid`, `logistics.status_changed`.~~
   **Domknięte w Zadaniu 6:** wszystkie cztery mają teraz pozycję w
   `WORKFLOW.md` §6 (poz. 17–20) i zaktualizowaną kolumnę "Wyzwalacz" w §5
   powyżej. Przy okazji domknięto też brakujący warunek przejścia
   `OczekiwanieNaKuriera → WyslanaDoProducenta` w `WORKFLOW.md` §8, który
   `STATE_MACHINE.md` już egzekwował, ale `WORKFLOW.md` go nie opisywał.
   *(`replacement.issued`/`replacement.returned` domknięte wcześniej, w
   Zadaniu 5 — patrz `WORKFLOW.md` §6 poz. 15–16.)*
3. ~~**Brak wartości `CaseHistoryAction`** dla zdarzeń logistycznych i dla
   zmiany priorytetu przy eskalacji SLA (§10.2).~~ **Domknięte w Zadaniu 5:**
   dodano `LogisticsStatusChanged` i `PriorityChanged` (`schema.prisma`,
   `DATABASE.md` §22, `DECISIONS.md`). Przy okazji ujednolicono nazwę z
   `NOTIFICATIONS.md` §7 pkt 2, który wcześniej proponował inną wartość
   (`EscalatedForSla`) dla tego samego zdarzenia — obowiązuje `PriorityChanged`.
4. ~~**`NotificationRecipientType` nie obejmuje producenta**~~ **Domknięte
   w Zadaniu 5:** dodano wartość `Manufacturer` oraz pole
   `Notification.recipientManufacturerId` (`schema.prisma`, `DATABASE.md`
   §28, `NOTIFICATIONS.md` §5).
5. **Reports / AIAssistant** figurują w §5 jako zarezerwowani subskrybenci
   — kontrakty są gotowe, moduły nie istnieją.
6. **Domknięte w Zadaniu 6, znalezione przy pełnym audycie §10.2:**
   `PortalDisabled` nie miał zdarzenia ani pozycji w `WORKFLOW.md` §6, mimo
   że `PortalEnabled` (jego para) miał oba od dawna — dodano
   `case.portal_disabled` i `WORKFLOW.md` §6 poz. 21. `NextActionUpdated`
   był jedyną wartością `CaseHistoryAction` bez żadnego odniesienia w tym
   dokumencie — dodano jako pozycję niezmienniczą bez zdarzenia (§5.3
   poz. 22, `WORKFLOW.md` §6 poz. 22). `NoteAdded` i `MessageSent`
   (kierunek `Outbound`) pozostają świadomie bez zdarzenia i bez pozycji w
   `WORKFLOW.md` §6 — bezpośrednie akcje pracownika bez dalszych
   automatycznych konsekwencji (uzasadnienie: `WORKFLOW.md` §6, notatka
   pod tabelą).
7. **Moduł `User`/`Auth` nie ma sekcji w katalogu §5.** `NOTIFICATIONS.md`
   §3 katalogu zawiera dwa szablony tego modułu
   (`user.account_created.employee`, `user.password_reset.employee`) bez
   odpowiadającego kontraktu zdarzenia — zauważone przy audycie w Zadaniu
   6, celowo **nie domknięte** w tym kroku (dotyczy innego agregatu niż
   `Case` i jego zależne encje, którymi zajmowało się to zadanie).
   **Rekomendacja:** sekcja `5.4 Agregat User` przy projektowaniu modułu
   `Users`/`Auth` w backendzie.