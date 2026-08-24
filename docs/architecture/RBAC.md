# RBAC.md — SmartRMA AI

## System ról i uprawnień

Model danych: `Role` / `Permission` / `RolePermission` / `UserRoleAssignment`
w `DATABASE.md`. Ten dokument opisuje **treść** tego modelu — jakie role i
uprawnienia istnieją, oraz jak wyliczane jest efektywne uprawnienie
użytkownika.

**Relacja do wcześniejszych dokumentów:** `docs/source/ROLES_AND_PERMISSIONS.md`
definiuje 3 role bazowe (Pracownik, Kierownik, Administrator) opisowo, na
poziomie "może/nie może". Ten dokument formalizuje to jako granularne
uprawnienia (`Permission.code`) przypisane do ról, i rozszerza o 2 role
dodane podczas prototypowania panelu administracyjnego (Serwis, Odczyt) —
nieobecne w dokumencie źródłowym, zdefiniowane tutaj na podstawie ich
ewidentnego przeznaczenia; **wymagają potwierdzenia biznesowego** przed
wdrożeniem produkcyjnym (oznaczone niżej).

---

## 1. Role systemowe

**Nazewnictwo (Zadanie 3 vs. dotychczasowe dokumenty):** zadanie używa
nazw "Manager" i "Pracownik Reklamacji" — to te same role, co
wcześniej opisane "Kierownik" i "Pracownik" (`code` bez zmian, żeby nie
łamać istniejącego RBAC/prototypu; `name`, czyli etykieta wyświetlana,
może swobodnie brzmieć "Manager", jeśli takie jest preferowane
nazewnictwo biznesowe — to pole tekstowe, nie identyfikator).

| Rola (`code`) | Nazwa wyświetlana | Pochodzenie | `isSystem` |
|---|---|---|---|
| `Administrator` | Administrator Systemu | `docs/source/ROLES_AND_PERMISSIONS.md` | tak |
| `Kierownik` | Kierownik Reklamacji *(= "Manager" w Zadaniu 3)* | jw. | tak |
| `Pracownik` | Pracownik Działu Reklamacji *(= "Pracownik Reklamacji" w Zadaniu 3)* | jw. | tak |
| `Serwis` | Serwis | dodana podczas prototypowania panelu administracyjnego — **do potwierdzenia biznesowego** | tak |
| `Odczyt` | Odczyt (tylko podgląd) | jw. — **do potwierdzenia biznesowego** | tak |
| *(brak `Role`)* | **Klient** | Zadanie 3 — patrz §1.2, mechanizm **odrębny** od pięciu ról powyżej | nie dotyczy |

Pięć ról **wewnętrznych** (pracowniczych) to role **systemowe**
(`isSystem=true`, `companyId=null`) — seedowane przy starcie, dostępne dla
każdej firmy, niekasowalne (ale możliwe do rozszerzenia o role
niestandardowe per firma w przyszłości, model na to pozwala —
`Role.companyId` ustawione = rola własna firmy). **Klient nie jest jedną
z nich** — patrz §1.2.

### 1.1 Wiele ról na użytkownika

Zgodnie z `docs/source/ROLES_AND_PERMISSIONS.md`: *"W małych sklepach jedna
osoba może pełnić więcej niż jedną rolę [...] System powinien na to
pozwalać poprzez przypisanie użytkownikowi wielu ról."* Model
(`UserRoleAssignment`, relacja N:M) to wprost realizuje. **Efektywne
uprawnienia użytkownika = suma uprawnień wszystkich przypisanych ról**
(unia zbiorów, nie iloczyn — posiadanie dodatkowej roli nigdy nie
ogranicza uprawnień z innej roli).

### 1.2 Klient — model dostępu odrębny od RBAC

Zadanie wprost wymienia Klienta jako jedną z sześciu ról do
zaprojektowania. **Świadoma decyzja architektoniczna: Klient nie jest
rekordem `Role`/`UserRoleAssignment`**, tylko osobnym mechanizmem dostępu
— i to jest fakt wymagający wyjaśnienia, nie luka.

**Dlaczego nie zwykła rola:**
1. Klient **nie ma konta systemowego** (`User`) — nie loguje się "do
   systemu" ogólnie, tylko uzyskuje dostęp do **jednej konkretnej sprawy**
   przez kod dostępu lub token (`Case.clientAccessCodeHash`/
   `clientAccessTokenHash`, patrz `DATABASE.md` §19, `BUSINESS_RULES.md`
   BR-077).
2. Zakres dostępu **nie jest modułowy** (jak dla ról wewnętrznych — "ten
   pracownik widzi moduł Reklamacje"), tylko **rekordowy** — klient widzi
   dokładnie jedną sprawę, nigdy listę spraw, nawet jeśli ten sam klient
   (po numerze telefonu/e-mailu) ma więcej niż jedno zgłoszenie w
   systemie. Model uprawnień oparty o `Permission`/`Role` nie wyraża
   dobrze tego rodzaju izolacji "per rekord" — próba wciśnięcia Klienta w
   ten sam mechanizm co pracowników wymagałaby sztucznego obejścia
   (uprawnienie "widzisz TYLKO swoją sprawę" nie jest tym, czym są
   pozostałe uprawnienia w tym dokumencie, które są modułowe).
3. Bezpieczeństwo dostępu klienta ma inny profil zagrożeń (blokada po 5
   próbach, kod/token jednorazowy, brak trwałej sesji) niż uwierzytelnianie
   pracownika — mieszanie tych dwóch modeli w jednym mechanizmie
   utrudniłoby audyt i zwiększyłoby powierzchnię błędu.

**Zakres dostępu Klienta** (opisany tabelarycznie, analogicznie do reszty
tego dokumentu, mimo że nie jest to macierz `Permission`): patrz §3a.

#### 1.2.1 Implementacja backendu (decyzja końcowa, Zadanie 9)

Trzy punkty powyżej są teraz skonkretyzowane w `apps/api/src/modules/portal/`:

- **Mechanizm sesji** — po udanym logowaniu (`POST /portal/login` kodem
  lub `POST /portal/login/token` linkiem) backend wydaje **osobny** JWT
  (sekret `JWT_PORTAL_SECRET` ≠ `JWT_ACCESS_SECRET` pracowników, domyślnie
  30 min), z payloadem ograniczonym do `{ caseId, type: 'portal' }` —
  nigdy `userId`, bo klient nie ma tożsamości w systemie (pkt 1 wyżej).
  "Brak trwałej sesji" oznacza właśnie to: krótkie, bezstanowe okno
  dostępu do jednej sprawy, nie sesję serwerową z refresh tokenem jak u
  pracownika (`AuthModule`).
- **`PortalAccessGuard`** — odpowiednik `JwtAuthGuard`, ale CELOWO odrębny
  (weryfikuje token ręcznie przez `JwtService`, nie przez drugą strategię
  Passport) — dokładnie realizuje pkt 3 (inny profil zagrożeń, inny kod).
  Endpointy Portalu są oznaczone `@Public()` (pomijają `JwtAuthGuard`
  pracowniczy) i osobno zabezpieczone tym guardem.
- **Blokada po 5 próbach (pkt 3, BR-078)** — `PortalLoginThrottleService`,
  licznik w Redis per `caseNumber` + adres IP, TTL 15 minut. Serwerowa, nie
  w `localStorage` przeglądarki (jak w prototypie, tam świadomie
  oznaczone jako niewystarczające produkcyjnie).
- **Izolacja rekordowa (pkt 2)** — każdy endpoint poza logowaniem czyta
  `caseId` wyłącznie z payloadu tokenu (`@PortalCaseId()`), nigdy z
  parametru URL — klient fizycznie nie może podać innego `caseId`, nawet
  gdyby spróbował (bez tokenu wydanego dla TEJ sprawy guard odrzuci
  żądanie).
- **Endpointy:** `POST /portal/login`, `POST /portal/login/token`,
  `GET /portal/case`, `GET /portal/case/history` (filtr
  `visibleForCustomer=true`, BR-079), `GET /portal/case/documents` (filtr
  `visibility=Public` i `status=Aktywny`, BR-080/BR-020),
  `POST /portal/case/messages` (RBAC.md §3a "Wysyłanie wiadomości").
  Generowanie/unieważnianie dostępu (kod/link) to osobne, pracownicze
  endpointy pod `cases.portal.manage` — patrz `WORKFLOW.md` §6 poz. 13/14/21.

---

## 2. Pełna lista uprawnień (`Permission`)

Konwencja nazewnictwa: `moduł.encja.akcja` lub `moduł.akcja`.

### Moduł: Cases (reklamacje)

| Kod | Opis |
|---|---|
| `cases.view` | Przeglądanie listy i szczegółów spraw |
| `cases.create` | Rejestracja nowej reklamacji |
| `cases.edit` | Edycja danych sprawy (opis, oczekiwane rozwiązanie, priorytet, ręczna edycja `nextAction`/`nextActionDueDate` niezależna od zmiany statusu — `WORKFLOW.md` §6 poz. 22) |
| `cases.status.change` | Zmiana statusu sprawy — od Status Workflow Refactor dowolny aktywny status jest dozwolonym celem (żadnej sztywnej tabeli przejść), UI ostrzega przy nietypowej zmianie, nie blokuje |
| `cases.decision.set` | Ustawienie decyzji (naprawa/wymiana/odrzucenie) |
| `cases.decision.approve` | Zatwierdzenie decyzji **wymagających dodatkowej odpowiedzialności** (zwrot środków, sprawy rękojmi, sprawy nietypowe) |
| `cases.cancel` | Anulowanie sprawy |
| `cases.archive` | Ręczna archiwizacja sprawy (poza automatyczną) |
| `cases.assign` | Przenoszenie spraw pomiędzy pracownikami |
| `cases.delete` | Trwałe usunięcie sprawy (wyjątkowe, patrz §5) |
| `cases.infoRequest.send` | Wysłanie prośby o uzupełnienie danych do klienta |
| `cases.portal.manage` | Włączanie/wyłączanie Portalu Klienta, generowanie kodów/linków dostępu |
| `cases.replacement.manage` | Wydawanie i przyjmowanie produktów zastępczych |
| `cases.handoff.send` | Producent/Dystrybutor + Partnerzy B2B (Faza 5) — przekazanie sprawy do aktywnego partnera B2B (`CaseHandoff`), tworzy nową, niezależną sprawę w tenancie partnera |
| `caseStatuses.view` | Odczyt per-firma katalogu statusów reklamacji (`CaseStatusDefinition`) — potrzebne każdej roli, która zmienia status sprawy, nie tylko administratorowi |
| `caseStatuses.manage` | Tworzenie/edycja/kolejność/aktywacja/dezaktywacja statusów (Ustawienia → Statusy reklamacji) — wyłącznie Administrator |

### Moduł: Documents / Notes / Messages

| Kod | Opis |
|---|---|
| `documents.upload` | Dodawanie dokumentów/zdjęć do sprawy |
| `documents.view` | Przeglądanie dokumentów |
| `documents.markInvalid` | Oznaczanie dokumentu jako błędny (BR-020 — nigdy usuwanie) |
| `notes.create` | Dodawanie wewnętrznych notatek |
| `notes.view` | Przeglądanie notatek wewnętrznych |
| `messages.send` | Wysyłanie wiadomości do klienta |
| `messages.view` | Przeglądanie korespondencji |

### Moduł: Customers / Products / Orders (katalog)

| Kod | Opis |
|---|---|
| `customers.view` | Przeglądanie/wyszukiwanie klientów |
| `customers.create` | Rejestracja nowego klienta |
| `customers.edit` | Edycja danych klienta |
| `products.view` | Przeglądanie katalogu produktów |
| `products.manage` | Dodawanie/edycja pozycji katalogowych |
| `orders.view` | Przeglądanie zamówień |
| `orders.manage` | Import/edycja zamówień |

### Moduł: Manufacturers / Brands

| Kod | Opis |
|---|---|
| `contractors.view` | Przeglądanie listy kontrahentów (dostawcy, dystrybutorzy, firmy logistyczne, producenci) |
| `contractors.manage` | Dodawanie/edycja danych firmowych kontrahenta |
| `manufacturers.view` | Przeglądanie listy producentów (profili obsługi reklamacji) |
| `manufacturers.manage` | Pełna konfiguracja profilu producenta (sposób zgłoszenia, procedura, logistyka, automatyzacja, SLA) — **nie obejmuje** edycji danych firmowych, które żyją na `Contractor` (`contractors.manage`) |
| `manufacturers.delete` | TRWAŁE usunięcie profilu producenta (patrz §5) — wyłącznie Administrator, zablokowane (MANUFACTURER-003) gdy producent ma przypisane produkty/marki |
| `brands.manage` | Zarządzanie markami przypisanymi do producentów |
| `partnerships.view` | Przeglądanie własnych partnerstw B2B (Sklep↔Producent/Dystrybutor) — WYŁĄCZNIE partnerstw, których stroną jest firma wołającego (izolacja strukturalna, nie filtr) |
| `partnerships.manage` | Zapraszanie/akceptowanie/dezaktywacja partnerstwa + przypisywanie marek do partnerstwa; wysyłka sprawy do partnera (`CaseHandoff`) — patrz Producent/Dystrybutor + Partnerzy B2B, Faza 2 |

### Moduł: Users / Roles (administracja)

| Kod | Opis |
|---|---|
| `users.view` | Przeglądanie listy użytkowników |
| `users.create` | Dodawanie nowych użytkowników |
| `users.edit` | Edycja danych użytkownika |
| `users.deactivate` | Dezaktywacja konta (patrz `DATABASE.md` §1.4 — nie fizyczne usunięcie) |
| `users.delete` | TRWAŁE usunięcie konta (patrz §5) — wyłącznie Administrator, zablokowane (USER-004) gdy konto ma jakąkolwiek historię działań, zablokowane też dla własnego konta (USER-005) |
| `users.resetPassword` | Reset hasła użytkownika |
| `users.roles.assign` | Przypisywanie/odbieranie ról użytkownikom |
| `roles.manage` | Tworzenie/edycja ról niestandardowych i ich uprawnień |

### Moduł: Company / Shop

| Kod | Opis |
|---|---|
| `company.manage` | Konfiguracja danych firmy (nazwa, NIP, adres) |
| `shops.manage` | Dodawanie/edycja oddziałów/sklepów |

### Moduł: Notifications / Settings / Reports / Audit

| Kod | Opis |
|---|---|
| `notifications.templates.manage` | Zarządzanie szablonami powiadomień |
| `notifications.view` | Przeglądanie historii wysłanych powiadomień |
| `settings.view` | Przeglądanie ustawień systemowych |
| `settings.manage` | Zmiana ustawień systemowych |
| `reports.view` | Przeglądanie statystyk i raportów |
| `auditlog.view` | Przeglądanie pełnego logu audytowego |

---

## 3. Macierz ról × uprawnień

Legenda: ✅ pełny dostęp · 🟡 dostęp częściowy/warunkowy (opisany w uwadze) · ⬜ brak dostępu

| Uprawnienie | Administrator | Kierownik | Pracownik | Serwis | Odczyt |
|---|---|---|---|---|---|
| `cases.view` | ✅ | ✅ | ✅ | 🟡 *(sprawy przypisane do Serwisu / oddziału)* | ✅ |
| `cases.create` | ✅ | ✅ | ✅ | ⬜ | ⬜ |
| `cases.edit` | ✅ | ✅ | ✅ | 🟡 *(tylko pola techniczne/serwisowe)* | ⬜ |
| `cases.status.change` | ✅ | ✅ | ✅ | 🟡 *(tylko statusy związane z realizacją naprawy)* | ⬜ |
| `cases.decision.set` | ✅ | ✅ | ✅ | ⬜ | ⬜ |
| `cases.decision.approve` | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| `cases.cancel` | ✅ | ✅ | ✅ | ⬜ | ⬜ |
| `cases.archive` | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| `cases.assign` | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| `cases.delete` | ✅ *(patrz §5 — wyjątkowe, TRWAŁE usunięcie)* | ⬜ | ⬜ | ⬜ | ⬜ |
| `cases.infoRequest.send` | ✅ | ✅ | ✅ | ⬜ | ⬜ |
| `cases.portal.manage` | ✅ | ✅ | ✅ | ⬜ | ⬜ |
| `cases.replacement.manage` | ✅ | ✅ | ✅ | ✅ | ⬜ |
| `cases.handoff.send` | ✅ | ✅ | ✅ | ⬜ | ⬜ |
| `caseStatuses.view` | ✅ | ✅ | ✅ | ✅ | ✅ *(modal zmiany statusu potrzebuje katalogu, nie tylko podgląd sprawy)* |
| `caseStatuses.manage` | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| `documents.upload` | ✅ | ✅ | ✅ | ✅ | ⬜ |
| `documents.view` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `documents.markInvalid` | ✅ | ✅ | ✅ | ⬜ | ⬜ |
| `notes.create` / `notes.view` | ✅ | ✅ | ✅ | ✅ | 🟡 *(tylko podgląd)* |
| `messages.send` / `messages.view` | ✅ | ✅ | ✅ | ⬜ | 🟡 *(tylko podgląd)* |
| `customers.view` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `customers.create` / `.edit` | ✅ | ✅ | ✅ | ⬜ | ⬜ |
| `products.view` / `orders.view` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `products.manage` / `orders.manage` | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| `manufacturers.view` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `manufacturers.manage` | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| `manufacturers.delete` | ✅ *(patrz §5 — wyjątkowe, TRWAŁE usunięcie)* | ⬜ | ⬜ | ⬜ | ⬜ |
| `partnerships.view` | ✅ | ✅ | ⬜ | ⬜ | ✅ |
| `partnerships.manage` | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| `contractors.view` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `contractors.manage` | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| `brands.manage` | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| `users.view` | ✅ | 🟡 *(tylko pracownicy własnego oddziału)* | ⬜ | ⬜ | ⬜ |
| `users.create` / `.edit` / `.deactivate` | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| `users.delete` | ✅ *(patrz §5 — wyjątkowe, TRWAŁE usunięcie)* | ⬜ | ⬜ | ⬜ | ⬜ |
| `users.resetPassword` | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| `users.roles.assign` | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| `roles.manage` | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| `company.manage` / `shops.manage` | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| `notifications.templates.manage` | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| `notifications.view` | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| `settings.view` / `.manage` | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| `reports.view` | ✅ | ✅ | ⬜ | ⬜ | 🟡 *(raporty zbiorcze, bez danych osobowych klientów)* |
| `auditlog.view` | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |

**Zgodność z `docs/source/ROLES_AND_PERMISSIONS.md`:** macierz odzwierciedla
wprost zapisane tam ograniczenia — Pracownik *"nie może usuwać spraw,
usuwać dokumentów, zmieniać uprawnień innych użytkowników, zatwierdzać
zwrotu pieniędzy, zamykać spraw oznaczonych jako nietypowe bez akceptacji
Kierownika"*; Administrator *"nie podejmuje decyzji biznesowych dotyczących
konkretnych spraw reklamacyjnych"* (stąd brak `cases.decision.set/approve`
poza tym, że jako rola systemowa z pełnym dostępem technicznym
Administrator **ma** te uprawnienia w tabeli — **rekomendacja**: w
seedzie danych domyślnie NIE przypisywać `cases.decision.*` do roli
`Administrator`, mimo że technicznie mógłby je mieć, żeby zachować
rozdział opisany w dokumencie źródłowym; to decyzja konfiguracyjna, nie
ograniczenie modelu).

---

## 3a. Dostęp Klienta — moduły i akcje (mechanizm z §1.2)

Klient ma dostęp **wyłącznie** do Portalu Klienta, wyłącznie **w kontekście
jednej sprawy**, do której uzyskał dostęp kodem/tokenem. Poniższa tabela
jest odpowiednikiem macierzy z §3, ale dla jednego "wiersza" (nie ma
odmian ról — dostęp klienta jest jednolity, bez wariantów).

| Moduł / akcja | Dostęp | Ograniczenie |
|---|---|---|
| Logowanie (numer sprawy + kod / bezpieczny link) | ✅ | Blokada po 5 nieudanych próbach (`PORTAL-003`, `BUSINESS_RULES.md` BR-078) |
| Podgląd statusu sprawy | ✅ | Wyłącznie uproszczony, publiczny etap (5 wartości) — nigdy surowy `CaseStatus` (`BUSINESS_RULES.md` BR-081) |
| Podgląd historii sprawy | ✅ | Wyłącznie wpisy `CaseHistory.visibleForCustomer=true` (BR-079) |
| Podgląd dokumentów | ✅ | Wyłącznie `Document.visibility=Public` (BR-080) |
| Pobieranie dokumentów | ✅ | jw. |
| Wysyłanie wiadomości (`Message`) | ✅ | Tworzy `Message` z `senderType=Customer`, `direction=Inbound` — **nie** modyfikuje żadnych innych danych sprawy |
| Podgląd danych opiekuna sprawy (`ownerId`) | ✅ | Wyłącznie imię, nazwisko, rola — **nigdy** e-mail/telefon prywatny pracownika (jeśli taki jest przechowywany) |
| Edycja **jakichkolwiek** danych sprawy (status, decyzja, opis, dane produktu) | ⛔ | Brak wyjątków — Portal Klienta jest **wyłącznie do odczytu** dla danych sprawy (decyzja potwierdzona w code review Portalu Klienta, patrz `docs/DECISIONS.md`) |
| Podgląd wewnętrznych notatek (`Note`) | ⛔ | `Note` nigdy nie jest widoczne dla klienta — to jest rozróżnienie, dla którego `Note` i `Message` to dwie osobne tabele (`DATABASE.md` §23–24) |
| Podgląd innych spraw tego samego klienta | ⛔ | Sesja jest scope'owana do `caseId` uzyskanego przy logowaniu — brak mechanizmu "zobacz wszystkie moje sprawy" w obecnym zakresie (wymagałoby innego modelu uwierzytelniania, np. konta klienta — poza obecnym zakresem, potencjalny przyszły kierunek) |
| Zmiana danych kontaktowych klienta (`Customer`) | ⛔ | Wyłącznie przez kontakt ze sklepem (wiadomość/telefon) — nie ma samoobsługowej edycji profilu |
| Rejestracja nowej reklamacji | ✅ *(ale poza Portalem — osobny moduł)* | Kreator zgłoszenia (`client-new-case.html` w prototypie) nie wymaga logowania — to inny punkt wejścia niż Portal Klienta, patrz `WORKFLOW.md` i `docs/DECISIONS.md` ("Kreator zgłoszenia reklamacyjnego") |

**Uprawnienia z §2 nie mają zastosowania do Klienta** — żadna z akcji
powyżej nie jest bramkowana przez `Permission`/`RolePermission`, tylko
przez posiadanie ważnej sesji (`sessionStorage`/token) dla konkretnego
`caseId`. To jest granica architektoniczna, nie przeoczenie.

---

## 4. Dostęp do modułów (nawigacja) — podsumowanie

| Moduł / ekran | Wymagane uprawnienie (którekolwiek) |
|---|---|
| Dashboard | `cases.view` |
| Lista reklamacji / Szczegóły reklamacji | `cases.view` |
| Nowa reklamacja | `cases.create` |
| Zarządzanie producentami | `manufacturers.view` (podgląd) / `manufacturers.manage` (edycja) |
| Zarządzanie użytkownikami | `users.view` |
| Ustawienia systemowe | `settings.view` |
| Log audytowy | `auditlog.view` |
| Raporty | `reports.view` |

> W prototypie (`app.js`) ta logika jest zaimplementowana jako
> `data-min-role` (lista dozwolonych ról na elemencie UI) oraz generyczny
> atrybut `data-write-action` (ukrywa **wszystkie** akcje zapisu dla roli
> `Odczyt` jednym mechanizmem). Docelowo w backendzie powinno to być
> egzekwowane przez guard (`RolesGuard`/`PermissionsGuard` w NestJS)
> sprawdzający `Permission.code`, nie nazwę roli wprost — pozwala to
> zmieniać uprawnienia ról bez zmiany kodu.

---

## 5. Uwagi szczególne

- **`cases.delete` (trwałe usunięcie sprawy) — ZAIMPLEMENTOWANE, wyłącznie
  Administrator.** Pierwotnie (patrz historia tego dokumentu) uprawnienie
  istniało w katalogu, ale celowo nieprzypisane żadnej roli — decyzja
  odwrócona na wyraźne, dwukrotnie potwierdzone żądanie właściciela produktu
  (czyszczenie spraw testowych z panelu admina). `docs/source/ROLES_AND_PERMISSIONS.md`
  nadal nie przewiduje tej operacji dla żadnej roli — to świadome odejście od
  tamtego dokumentu, nie jego reinterpretacja.
  - Pierwszy hard-delete w całej aplikacji (od tego czasu dołączyły
    `manufacturers.delete`/`users.delete` niżej) — każda inna encja jest
    wyłącznie dezaktywowana/anulowana, nigdy fizycznie skasowana (BR-020,
    DATABASE.md §22/§23/§25 i inne — patrz doc-commenty przy
    `DocumentsRepository`/`CaseHistoryRepository`/`CaseConsentRepository`,
    każdy dostał JEDEN wyraźnie oznaczony wyjątek od swojej
    "insert-only"/"brak delete" zasady).
  - `CasesService.hardDelete` kasuje sprawę i WSZYSTKIE powiązane dane
    (pozycje, dokumenty, wiadomości, historię, notatki, logistykę, zgody
    RODO, powiadomienia) w jednej transakcji, w kolejności zgodnej z kluczami
    obcymi. Wpis w `AuditLog` (`CASE_DELETED`) zapisywany PRZED skasowaniem —
    to jedyny trwały ślad, że sprawa w ogóle istniała.
  - Endpoint `DELETE /cases/:id` (kontroler), frontend: przycisk "Usuń
    sprawę" w `CaseDetailPage` wymaga wpisania numeru sprawy jako
    potwierdzenia (nie samego kliknięcia) — to jest realizacja
    "silnie audytowanej procedury" z poprzedniej wersji tej uwagi, bez
    formalnego potwierdzenia dwuosobowego (uznane za nadmiarowe dla tego
    zastosowania — sprawy testowe, nie realne reklamacje klientów).
  - Świadomie NIE usuwa plików `Document` z dysku — `IStorageService` nie
    ma metody `delete` (nigdzie w aplikacji nie istniała), poza zakresem
    tej zmiany.
- **`manufacturers.delete` (trwałe usunięcie producenta) — ZAIMPLEMENTOWANE,
  wyłącznie Administrator.** Ten sam wzorzec co `cases.delete` powyżej, ale
  z BLOKADĄ zamiast pełnej kaskady — `Product.manufacturerId` jest polem
  WYMAGANYM (nie nullable), więc usunięcie producenta z przypisanymi
  produktami skasowałoby (albo osierociło) dane katalogowe używane przez
  realne sprawy. `ManufacturersService.hardDelete` rzuca MANUFACTURER-003,
  gdy istnieje choć jeden `Product` lub `Brand` tego producenta — usunięcie
  jest więc możliwe wyłącznie dla świeżo utworzonego, nieużywanego jeszcze
  producenta (dokładnie profil danych testowych, o które prosił właściciel).
  Kasuje `ManufacturerSLA`/`ManufacturerLogistics`/`ManufacturerAutomation`
  (relacje 1:1) i sam wiersz `Manufacturer` — celowo NIE kasuje leżącego pod
  spodem `Contractor` (może być używany niezależnie jako zwykły kontrahent).
- **`users.delete` (trwałe usunięcie konta) — ZAIMPLEMENTOWANE, wyłącznie
  Administrator.** Analogicznie zablokowane, gdy konto ma jakikolwiek ślad
  działań: `ownedCases`/`decidedCases`/`uploadedDocuments`/`historyEntries`/
  `notes`/`messages`/`auditLogs` (jako aktor) — `UsersService.hardDelete`
  rzuca USER-004 w tym przypadku (usuwanie kogoś, kto faktycznie pracował w
  systemie, zniszczyłoby dane historyczne innych spraw; do tego celu służy
  istniejąca dezaktywacja, `users.deactivate`). Dodatkowo USER-005 blokuje
  próbę usunięcia WŁASNEGO konta, niezależnie od jego historii. Kasuje
  `UserRoleAssignment`/`Employee`/`LoginEvent` (dane czysto kontowe, bez
  znaczenia biznesowego) i sam wiersz `User`.
- **Logowanie PIN-em (`User.loginMethod=Pin`) — ZAIMPLEMENTOWANE, jako
  alternatywa dla hasła.** Na wyraźne żądanie właściciela: w firmie wiele
  stanowisk dzieli jeden wspólny adres e-mail firmowy, więc `email` przestał
  być wystarczającym identyfikatorem konta — PIN (domyślnie 6 cyfr,
  konfigurowalny w Ustawienia › Bezpieczeństwo) odróżnia konkretnego
  pracownika pod tym samym e-mailem. Ekran logowania (`POST /auth/login`)
  pozostaje niezmieniony (`email`+`password`) — `AuthService.validateCredentials`
  sam rozstrzyga, czy wartość to hasło czy PIN, zależnie od tego, jaki
  `loginMethod` mają konta pod danym e-mailem.
  - **Rola-gating (USER-006):** konto `loginMethod=Pin` NIE MOŻE mieć roli
    `Administrator` ani `Kierownik` — sprawdzane w `UsersService.create` i
    `assignRoles`, w obie strony (ani nadanie takiej roli kontu Pin, ani
    przełączenie na Pin konta z taką rolą). To jedyne miejsce w aplikacji,
    gdzie sposób logowania ogranicza dostępne role — świadomy kompromis
    bezpieczeństwa: PIN ma dużo mniejszą przestrzeń kombinacji niż hasło,
    więc trafia wyłącznie do kont, które nie mogą wyrządzić poważnej szkody.
  - **Wspólny e-mail = częściowy unikalny indeks.** `User.email` przestał
    być globalnie `@unique` w schemacie — unikalność jest teraz egzekwowana
    WYŁĄCZNIE wśród kont `loginMethod=Password` (częściowy indeks
    `User_email_password_key`, dopisany ręcznym SQL-em w migracji `pin_login`,
    dokładnie ten sam wzorzec co ręczne ograniczenie dla `Role.code`
    opisane wyżej w tym dokumencie). Konta `loginMethod=Pin` mogą świadomie
    dzielić e-mail.
  - **Blokada logowania PIN-em (AUTH-006) liczona per e-mail, nie per
    konto** — w Redis (`PinLoginAttemptStoreService`, ten sam wzorzec co
    `RefreshTokenStoreService`), bo dopóki żaden PIN się nie zgodzi, nie
    wiadomo, które z kont dzielących e-mail ktoś atakuje. Próg
    (`maxPinAttempts`, domyślnie 3) i okno (`pinLockoutDurationMinutes`,
    domyślnie 30 min) są celowo surowsze niż dla haseł (`maxLoginAttempts=5`,
    `lockoutDurationMinutes=15`).
  - **Firma musi świadomie włączyć** logowanie PIN-em
    (`CompanySettings.pinLoginEnabled`, domyślnie `false`, Ustawienia ›
    Bezpieczeństwo) — próba utworzenia/zresetowania konta Pin bez tego
    kończy się USER-008.
  - Zero automatycznej migracji istniejących kont — wszystkie dzisiejsze
    konta mają `loginMethod=Password` (wartość domyślna kolumny); admin
    przełącza konkretnego pracownika na PIN świadomie, przez formularz
    tworzenia konta.
- **Role `Serwis` i `Odczyt`** nie mają odpowiednika w
  `docs/source/ROLES_AND_PERMISSIONS.md` — powstały podczas prototypowania
  panelu administracyjnego jako realistyczne uzupełnienie (technik
  serwisowy, obserwator/audytor). Przypisane im uprawnienia w tym
  dokumencie są **propozycją opartą o ich ewidentne przeznaczenie**, nie
  zatwierdzonym wymaganiem biznesowym — do potwierdzenia przed
  wdrożeniem produkcyjnym.
- **Wielooddziałowość a uprawnienia:** obecna macierz nie różnicuje
  dostępu per `Shop` poza dwoma zaznaczonymi wierszami (`cases.view` dla
  Serwisu, `users.view` dla Kierownika). Pełne skalowanie uprawnień do
  wielu oddziałów (np. "Kierownik widzi tylko swój oddział") to decyzja
  do podjęcia razem z resztą wielooddziałowości — patrz `DATABASE.md` §1.2
  i uwaga w `docs/DECISIONS.md` o `User.branchId` jako "tylko polu, nie
  pełnej obsłudze multi-branch".
