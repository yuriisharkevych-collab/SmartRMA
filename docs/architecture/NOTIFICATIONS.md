# NOTIFICATIONS.md — SmartRMA AI

## Centralny system powiadomień

Model danych: `NotificationTemplate` / `Notification` (`DATABASE.md` §27–28).
Zdarzenia wyzwalające: `EVENTS.md`. Ten dokument opisuje **jak** system
powiadomień działa jako całość — kanały, szablony, momenty wysyłki,
przypomnienia, eskalacje — konsolidując w jednym miejscu to, co dotąd było
rozproszone po `WORKFLOW.md` §6/§7 i `BUSINESS_RULES.md` §20–21.

---

## 1. Kanały

| Kanał (`NotificationChannel`) | Odbiorca | Status w projekcie |
|---|---|---|
| `Email` | Klient (brak konta `User` — e-mail z `Customer.email`) lub pracownik | **Model gotowy**, wysyłka to integracja zewnętrzna (dostawca SMTP/API — do wyboru przy implementacji), poza zakresem dokumentacji architektury |
| `System` | Wyłącznie pracownik (`User`) — powiadomienie "w aplikacji" (odpowiednik dzwoneczka/listy powiadomień) | **Model gotowy** — `Notification.status=Read` reprezentuje odczytanie w UI |
| `SMS` | Klient lub pracownik | **Wyłącznie przygotowanie na przyszłość** — enum istnieje (`NotificationChannel.SMS`), **żadna funkcjonalność wysyłki SMS nie jest częścią obecnego zakresu**, zgodnie z poleceniem zadania architektonicznego. `Notification.recipientPhone` istnieje w modelu już teraz, żeby przyszłe włączenie SMS nie wymagało migracji schematu — tylko podłączenia dostawcy i włączenia kanału w szablonach |

**Klient nie ma powiadomień `System`** — nie ma konta `User`, więc nie ma
gdzie takiego powiadomienia "w aplikacji" wyświetlić poza samym Portalem
Klienta (gdzie i tak widzi aktualny stan sprawy przy każdym wejściu, więc
osobne powiadomienie systemowe byłoby zbędne).

---

## 2. Szablony (`NotificationTemplate`)

### 2.1 Struktura

Każdy szablon ma: `code` (identyfikator zdarzenia, konwencja
`{obszar}.{zdarzenie}.{odbiorca}` — patrz `EVENTS.md` §5), `channel`,
opcjonalny `subject` (dla e-maili), `bodyTemplate` (tekst z placeholderami
`{{zmienna}}`), `variables` (lista oczekiwanych placeholderów jako `Json`).

### 2.2 Globalne vs. per-firma

`NotificationTemplate.companyId=null` = szablon domyślny, dostępny dla
każdej firmy. Firma może nadpisać dowolny szablon własną wersją
(`companyId` ustawione, ten sam `code`+`channel`) — `@@unique([companyId,
code, channel])` gwarantuje brak konfliktu. Rozwiązywanie: system najpierw
szuka szablonu z `companyId=<firma>`, jeśli nie znajdzie — używa
`companyId=null`. Jeśli nie istnieje **żaden** z nich — błąd
`NOTIFICATION-002` (`ERROR_CODES.md`).

### 2.3 Podstawianie zmiennych

Podstawianie jest **proste** (`{{zmienna}}` → wartość), bez logiki
warunkowej/pętli w szablonie — jeśli treść zależy od warunku (np. inny
tekst dla `Warranty` niż `StatutoryWarranty`), to osobne szablony
(`case.created.customer.warranty` / `case.created.customer.statutory`),
nie jeden szablon z logiką w środku. Utrzymuje to szablony jako czysty
tekst, edytowalny bez znajomości programowania — zgodne z duchem
`docs/source/ROLES_AND_PERMISSIONS.md` (Administrator zarządza szablonami
bez ingerencji w kod).

### 2.4 Przygotowanie pod wielojęzyczność

Wzorzec już zastosowany w prototypie (`client-labels.js` — jeden słownik,
funkcja `t()`) przenosi się wprost na `NotificationTemplate`: dodanie
kolejnego języka to dodanie kolejnych wierszy `NotificationTemplate` (ten
sam `code`+`channel`, inny `companyId` **lub** przyszłe pole `locale` —
**nieujęte w obecnym schemacie**, bo MVP nie wymaga wielojęzyczności
powiadomień; łatwa migracja addytywna, gdy potrzeba się potwierdzi).

---

## 3. Katalog szablonów (pełna lista na start systemu)

Kolumna "Wyzwalacz" odwołuje się do `EVENTS.md`. Kolumna "Odbiorca" —
`NotificationRecipientType` + sposób ustalenia adresata (§5).

| `code` | Kanał | Odbiorca | Wyzwalacz | Kluczowe zmienne |
|---|---|---|---|---|
| `case.created.customer` | Email | Customer | `CaseCreated` (jeśli `clientPortalEnabled=true`) | `caseNumber`, `customerName`, `productModel` |
| `case.status_changed.customer` | Email | Customer | `StatusChanged`, tylko statusy oznaczone "Tak" w `WORKFLOW.md` §7 | `caseNumber`, `statusLabel` |
| `case.decision_set.customer` | Email | Customer | `DecisionSet` | `caseNumber`, `decisionLabel` |
| `case.info_requested.customer` | Email | Customer | `InfoRequested` | `caseNumber`, `message` |
| `case.ready_for_pickup.customer` | Email | Customer | `StatusChanged` → `GotowaDoOdbioru` | `caseNumber` |
| `case.closed.customer` | Email | Customer | `CaseClosed` | `caseNumber` |
| `case.cancelled.customer` | Email | Customer | `CaseCancelled` | `caseNumber`, `reason` |
| `case.monitored.customer` | Email | Customer | Utworzenie sprawy monitorowanej (`submissionMode=BezposrednioDoProducenta`, klient poprosił o monitoring) | `caseNumber`, `manufacturerName` |
| `case.producer_instructions.customer` | Email | Customer | Klient prosi o instrukcję zgłoszenia w kreatorze (ścieżka bezpośrednio do producenta) | `manufacturerName`, `instructions` |
| `case.secure_link.customer` | Email | Customer | Pracownik generuje i wysyła bezpieczny link (opcjonalna akcja z panelu "Portal klienta") | `caseNumber`, `secureLink` |
| `case.customer_responded.employee` | System | Employee (`ownerId`) | `CustomerResponded` | `caseNumber` |
| `case.sla_reminder.manufacturer` | Email | Kontrahent (`Manufacturer.contractor.contactEmail`) | Próg `ManufacturerSLA.reminderAfterDays` przekroczony | `caseNumber`, `daysOverdue` |
| `case.sla_reminder.employee` | System | Employee (`ownerId`) | jw. (informacyjnie do pracownika) | `caseNumber` |
| `case.escalation.manager` | System | Wszyscy `User` z rolą `Kierownik` danego `Shop` | Próg `ManufacturerSLA.escalationAfterDays` przekroczony | `caseNumber`, `daysOverdue` |
| `case.next_action_due.employee` | System | Employee (`ownerId`) | `Case.nextActionDueDate` minęło | `caseNumber`, `nextAction` |
| `user.account_created.employee` | Email | Employee (nowo utworzony `User`) | Utworzenie konta przez Administratora | `firstName`, `loginUrl` |
| `user.password_reset.employee` | Email | Employee | `PasswordReset` | `tempPassword` *(lub link resetujący, do ustalenia przy implementacji — patrz uwaga bezpieczeństwa §9)* |

> Katalog jest **punktem startowym**, nie zamkniętą listą — nowe szablony
> dodaje się tak samo jak nowe kody błędów (`ERROR_CODES.md` — zasady
> rozszerzania): nowy `code`, nigdy nie nadpisujący istniejącego znaczenia.

---

## 4. Momenty wysyłki

### 4.1 Zasada: enqueue natychmiast, wysyłka asynchroniczna

Utworzenie rekordu `Notification` (`status=Pending`) następuje **w tej
samej transakcji/operacji serwisowej**, co zdarzenie wyzwalające (np.
zmiana statusu) — żeby powiadomienie nigdy nie "zgubiło się", nawet jeśli
faktyczna wysyłka (wywołanie zewnętrznego dostawcy e-mail) nastąpi chwilę
później lub się nie powiedzie. Faktyczna wysyłka jest **asynchroniczna**
(zadanie w tle/kolejka) — **nigdy nie blokuje** odpowiedzi API na akcję,
która ją wyzwoliła (np. zmiana statusu sprawy kończy się sukcesem
natychmiast, niezależnie od tego, czy e-mail do klienta już poszedł).

### 4.2 Mapa zdarzenie → moment wysyłki

Pełna mapa jest już w `WORKFLOW.md` §6 (akcje automatyczne) i §7 (mapa
statusów → powiadom klienta). Ten dokument jej nie duplikuje — tabela w
§3 wyżej to ten sam zestaw zdarzeń, tylko z perspektywy "jaki szablon",
nie "jaka akcja biznesowa".

---

## 5. Ustalanie odbiorcy (recipient resolution)

| Typ odbiorcy | Źródło adresu | Uwaga |
|---|---|---|
| Klient (Email) | `Customer.email` (przez `Case.customerId`) | Odczyt **na żywo** w momencie wysyłki, nie migawka z momentu utworzenia sprawy — poprawka danych klienta powinna wpłynąć na kolejne powiadomienia |
| Klient (SMS, przyszłość) | `Customer.phone` | jw., nieaktywne w obecnym zakresie |
| Pracownik (System) | `Notification.recipientUserId` → `User` | Powiadomienie widoczne w UI przy najbliższym zalogowaniu/odświeżeniu |
| Kontrahent/Producent (Email) | `Manufacturer.contractor.contactEmail` (**nie** `Manufacturer.contactEmail` — to pole zostało przeniesione na `Contractor` przy rozdzieleniu Kontrahent/Producent, patrz `DATABASE.md` §0/§11) | Jeśli puste — powiadomienie zapisywane jako `Failed` z `failureReason="Brak adresu e-mail kontrahenta"`, nie próba wysyłki na pusty adres |
| Rola (np. wszyscy Kierownicy oddziału) | Zapytanie `UserRoleAssignment` + `User.shopId` w momencie wysyłki | "Wszyscy aktualni" — zmiana przypisania roli między zdarzeniem a wysyłką wpływa na listę odbiorców (asynchroniczność z §4.1) |

---

## 6. Przypomnienia

Formalizacja `ManufacturerSLA.reminderAfterDays` (`DATABASE.md` §14a,
`BUSINESS_RULES.md` BR-094–096) jako zadania cyklicznego:

1. Zadanie cykliczne (rekomendacja: uruchamiane raz dziennie, poza
   godzinami szczytu) przegląda sprawy w statusach
   `WyslanaDoProducenta`/`OczekiwanieNaDecyzjeProducenta`.
2. Dla każdej: jeśli `dni od wejścia w WyslanaDoProducenta >
   ManufacturerSLA.reminderAfterDays` (i pole nie jest `null`) **oraz**
   przypomnienie dla tego progu nie zostało jeszcze wysłane (patrz §6.1
   — deduplikacja) → utworzenie `Notification` z szablonu
   `case.sla_reminder.manufacturer` **i** `case.sla_reminder.employee`.

### 6.1 Deduplikacja przypomnień

Zadanie cykliczne uruchamiane codziennie mogłoby wysłać to samo
przypomnienie wielokrotnie, jeśli próg został przekroczony i sprawa nadal
nie zmieniła statusu następnego dnia. **Reguła:** przed utworzeniem nowego
`Notification` typu przypomnienia, sprawdzić czy już istnieje
`Notification` tego samego `templateId` dla tego samego `relatedCaseId`
utworzony **po** momencie przekroczenia progu — jeśli tak, pominąć
(przypomnienie wysyłane **raz na przekroczenie progu**, nie codziennie
przy każdym uruchomieniu zadania).

---

## 7. Eskalacje

Formalizacja `ManufacturerSLA.escalationAfterDays`:

1. To samo zadanie cykliczne z §6, próg `escalationAfterDays` zamiast
   `reminderAfterDays`.
2. Przy przekroczeniu: `Case.priority → Wysoki` (jeśli jeszcze nie),
   wpis `CaseHistory` (rekomendacja: rozszerzyć `CaseHistoryAction` o
   wartość `EscalatedForSla` przy implementacji — **nieujęte** w obecnym
   enumie, bo dotąd nie było mechanizmu, który by go potrzebował;
   najmniejsza możliwa migracja addytywna), `Notification` z szablonu
   `case.escalation.manager` do wszystkich `Kierownik` danego `Shop`.
3. Eskalacja **nie zmienia statusu sprawy** — tylko priorytet i
   widoczność dla Kierownika. Sprawa nadal czeka na tę samą, pierwotną
   akcję (odpowiedź producenta) — eskalacja to sygnał "ktoś z wyższymi
   uprawnieniami powinien to zobaczyć", nie automatyczna zmiana procesu.
4. Deduplikacja analogiczna do §6.1 — eskalacja wysyłana raz na
   przekroczenie progu, nie przy każdym uruchomieniu zadania.

---

## 8. Obsługa błędów wysyłki

| Sytuacja | Zachowanie |
|---|---|
| Dostawca e-mail/SMS zwraca błąd | `Notification.status=Failed`, `failureReason` wypełnione, zdarzenie `NotificationFailed` (`EVENTS.md` §4) |
| Brak adresu odbiorcy (pusty e-mail/telefon) | `Notification.status=Failed` **natychmiast**, bez próby wysyłki — `failureReason="Brak adresu odbiorcy"` |
| Brak pasującego szablonu | Błąd `NOTIFICATION-002` — **nie tworzy się** rekord `Notification` (nie ma czego wysłać); zdarzenie wyzwalające (np. zmiana statusu) **kończy się sukcesem mimo to** — brak szablonu nigdy nie blokuje operacji biznesowej |
| Ponawianie prób wysyłki | **Rekomendacja, nie decyzja w tym kroku:** ograniczona liczba ponowień (np. 3, z rosnącym odstępem) dla błędów przejściowych (timeout, chwilowa niedostępność dostawcy); błędy trwałe (nieprawidłowy adres) nie są ponawiane |

**Zasada nadrzędna:** żadna awaria systemu powiadomień nie blokuje
operacji biznesowej, która ją wyzwoliła. Powiadomienia są efektem
ubocznym (side effect), nie warunkiem powodzenia (precondition) zmiany
statusu, decyzji, itd.

---

## 9. Bezpieczeństwo treści powiadomień

- Powiadomienia e-mail do klienta **nie zawierają** kodu dostępu do
  Portalu Klienta w treści (poza jednorazowym, świadomym przypadkiem
  bezpiecznego linku z tokenem — `case.secure_link.customer` — gdzie sam
  link **jest** kredencjałem, ale token jest jednorazowy i wygasa po
  użyciu, patrz `BUSINESS_RULES.md` BR-077).
- `user.password_reset.employee` — treść (hasło tymczasowe vs. link
  resetujący) to decyzja do podjęcia przy implementacji; **rekomendacja:**
  link resetujący z ograniczonym czasem ważności jest bezpieczniejszy niż
  przesyłanie hasła tymczasowego jawnym tekstem w e-mailu, nawet
  tymczasowego — do potwierdzenia z zespołem bezpieczeństwa przed
  implementacją.
- Żaden szablon nie powinien zawierać danych wrażliwych innych klientów
  (oczywiste, ale odnotowane jako zasada projektowania nowych szablonów).

---

## 10. Zgodność z checklistą "Zadanie 3"

| Wymóg | Sekcja |
|---|---|
| E-mail | §1 |
| Powiadomienia systemowe | §1 |
| Przyszła obsługa SMS | §1 |
| Szablony wiadomości | §2, §3 |
| Moment wysyłki | §4 |
| Przypomnienia | §6 |
| Eskalacje | §7 |
