# DECISIONS.md

## SmartRMA AI — Dziennik decyzji architektonicznych

Ten dokument rejestruje istotne decyzje architektoniczne i projektowe podjęte
w toku prac nad SmartRMA AI, wraz z uzasadnieniem. Celem jest, żeby za rok
(lub przy wdrażaniu nowej osoby do projektu) było wiadomo **dlaczego** system
wygląda tak, a nie inaczej — bez konieczności odtwarzania historii z rozmów.

Wpis dodawany jest po zakończeniu każdego etapu prac, zanim przejdziemy do
kolejnego.

Format wpisu: **Kontekst** (jaki problem/pytanie), **Decyzja**, **Uzasadnienie**,
opcjonalnie **Odrzucone alternatywy**.

---

## Etap 0 — Domknięcie modelu domenowego

### Rozdzielenie procesu Gwarancja / Rękojmia

**Kontekst:** BUSINESS_PROCESS.md opisywał jeden, uniwersalny przepływ
statusów zakładający zawsze wysyłkę sprawy do producenta. GLOSSARY.md
jednoznacznie wskazywał, że przy Rękojmi decyzję podejmuje sprzedawca, nie
producent — co stało w sprzeczności z jednolitą ścieżką procesu.

**Decyzja:** `Case` pozostaje jedną encją (zgodnie z BR-001), ale
`CaseStatus` obejmuje dwie ścieżki w jednym enumie — jedną prowadzącą przez
producenta (Gwarancja), drugą z wewnętrzną decyzją Kierownika (Rękojmia).
Dozwolone przejścia między statusami waliduje warstwa aplikacji
(`case-status.rules.ts`), nie ograniczenia bazy danych.

**Uzasadnienie:** Unikamy duplikowania encji `Case` przy zachowaniu
poprawności biznesowej obu ścieżek. Walidacja w kodzie aplikacji (nie w
schemacie bazy) daje elastyczność przy ewentualnych korektach procesu bez
migracji.

**Odrzucone alternatywy:** Osobne encje `WarrantyCase`/`StatutoryCase` —
odrzucone jako przedwczesna komplikacja modelu na etapie MVP.

---

### Dodanie pól `Decision` i `NextAction` do `Case`

**Kontekst:** GLOSSARY.md i DOMAIN_MODEL.md opisywały `Decision` (wynik
rozpatrzenia sprawy) i `Next Action` (kluczowe pojęcie produktu — „co robić
teraz") jako centralne elementy systemu, ale żadne z nich nie istniało w
pierwotnym `DATABASE.md`.

**Decyzja:** Dodano `Case.decision` (enum, oddzielny od `requestedResolution`),
`Case.decisionAt`, `Case.decisionByUserId` oraz `Case.nextAction` (tekst) i
`Case.nextActionDueDate`.

**Uzasadnienie:** Bez `Decision` niemożliwe jest raportowanie „accepted vs
rejected" (FR-110). Bez `NextAction` nie da się zbudować dashboardu zgodnie z
filozofią produktu opisaną w PROJECT_CONTEXT.md („pracownik po zalogowaniu od
razu wie, co robić"). W MVP `nextAction` jest polem tekstowym aktualizowanym
przy zmianie statusu (mapowanie status → domyślny tekst), a nie osobnym
silnikiem reguł — to wystarcza na start, bardziej złożoną logikę odkładamy.

---

### Doprecyzowanie roli Kierownika Reklamacji

**Kontekst:** BUSINESS_PROCESS.md (ETAP 6) i ROLES_AND_PERMISSIONS.md były
niespójne co do tego, kto zatwierdza sprawy nietypowe i decyzje o zwrocie
środków — pierwszy dokument wskazywał Administratora, drugi jednoznacznie
Kierownika Reklamacji (Administrator „nie odpowiada za decyzje
reklamacyjne").

**Decyzja:** Jako źródło prawdy przyjęto ROLES_AND_PERMISSIONS.md. Sprawy
oznaczone jako nietypowe oraz decyzje wymagające akceptacji (zwrot środków,
rozstrzygnięcia w ścieżce Rękojmia) wymagają roli Kierownik. Dodano pole
`Case.requiresManagerApproval` oraz `Case.isException`, egzekwowane na
poziomie autoryzacji API.

**Uzasadnienie:** ROLES_AND_PERMISSIONS.md jest dokumentem bardziej
szczegółowym i jednoznacznym; BUSINESS_PROCESS.md zawierał uproszczenie
terminologiczne, nie celową zmianę modelu uprawnień.

---

### Powiązanie powiadomień z konkretną sprawą

**Kontekst:** `Notification` w pierwotnym `DATABASE.md` miał tylko `UserId`,
mimo że większość powiadomień (przekroczone terminy, oczekiwanie na kuriera,
oczekiwanie na producenta) z natury dotyczy konkretnej sprawy.

**Decyzja:** Dodano `Notification.caseId` (nullable — część powiadomień, np.
systemowe, nie dotyczy żadnej sprawy).

**Uzasadnienie:** Bez tego pola nie da się zbudować w UI kliknięcia
„przejdź do sprawy" z poziomu powiadomienia na dashboardzie — podstawowa
funkcja zgodna z filozofią „dashboard jako centrum pracy".

---

## Wybór stacku technologicznego

**Kontekst:** Priorytetem jest szybkie uruchomienie działającej aplikacji i
nauka pracy z Claude Code, przy zachowaniu możliwości rozwoju do pełnego
SaaS w przyszłości.

**Decyzja:** Backend: NestJS + TypeScript. Frontend: React + TypeScript +
Vite + Tailwind CSS + shadcn/ui. ORM: Prisma. Baza danych: PostgreSQL.
Uwierzytelnianie: JWT. Storage plików: dysk lokalny (MVP). E-mail:
Nodemailer. Całość konteneryzowana w Dockerze od pierwszego commita.

**Uzasadnienie:** Ekosystem TypeScript po obu stronach (spójność typów,
mniejszy koszt onboardingu), Prisma daje bezpieczny typowo dostęp do danych i
łatwe migracje, PostgreSQL jest sprawdzonym wyborem pod wymagania
transakcyjności i audytowalności z SECURITY_AND_GDPR.md. Storage lokalny i
Nodemailer to świadome uproszczenia MVP — oba mają zostać ukryte za
interfejsem (`IStorageService`, `IMailService`), żeby wymiana na S3/SES przy
przejściu na SaaS nie wymagała zmian w logice biznesowej.

---

## Architektura: Clean Architecture „light"

**Kontekst:** Wymaganie prostoty i czytelności dla MVP przy jednoczesnej
potrzebie łatwego rozwoju do pełnego SaaS w przyszłości — bez przedwczesnej
komplikacji.

**Decyzja:**
- Obowiązkowy podział w każdym module: `controller → service → (repository)`.
- Wzorzec repozytorium stosowany **tylko tam, gdzie daje realną wartość**:
  `Cases` i `Documents`. Proste moduły (np. `Manufacturers`, `Customers`)
  korzystają z `PrismaService` bezpośrednio.
- Abstrakcja przez interfejs (porty) stosowana tylko w dwóch miejscach, gdzie
  realnie przewidujemy zmianę implementacji: `IStorageService` (dysk →
  S3) i `IMailService` (Nodemailer → SES/SendGrid).
- Brak osobnych warstw `domain`/`use-case`, brak CQRS — reguły biznesowe
  mieszkają w plikach `*.service.ts` / dedykowanych plikach reguł (np.
  `case-status.rules.ts`).

**Uzasadnienie:** Pełna Clean Architecture (domain/application/
infrastructure/interface w osobnych pakietach dla każdego modułu) byłaby
nadmierną komplikacją dla zespołu pracującego nad MVP jednego sklepu.
Wybrany kompromis daje testowalność i możliwość wymiany kluczowych
zależności zewnętrznych bez kosztu wielowarstwowej abstrakcji tam, gdzie nie
jest potrzebna.

---

## Usunięcie `TenantId` z MVP

**Kontekst:** Pierwotny model danych (DATABASE.md) zakładał `TenantId` w
każdej tabeli biznesowej z myślą o architekturze SaaS. MVP jest budowane dla
jednego sklepu.

**Decyzja:** `TenantId` usunięty ze schematu Prisma na etapie MVP. Zostanie
wprowadzony jako osobna migracja przy przejściu na Etap 2 (obsługa wielu
sklepów).

**Uzasadnienie:** Priorytetem MVP jest prostota i szybkość uruchomienia.
Trzymanie kolumny `TenantId` bez żadnej logiki wielodostępności (bez
izolacji zapytań, bez routingu) nie daje realnej wartości teraz, a dodaje
złożoność do każdego zapytania i migracji. Świadomie akceptujemy koszt
przyszłej migracji w zamian za prostotę dzisiaj.

---

## Fundament projektu (Docker, NestJS, React)

**Kontekst:** Przed rozpoczęciem implementacji modelu domenowego i logiki
biznesowej potrzebne było zweryfikowane, działające środowisko — żeby
problemy z konfiguracją (Docker, Prisma, build frontendu) rozwiązywać na
starcie, a nie w połowie sprintu.

**Decyzja:**
- `docker-compose.yml` uruchamia trzy serwisy (`db`, `api`, `web`) jednym
  poleceniem `docker compose up`, z healthcheckiem bazy danych jako warunkiem
  startu API.
- Swagger dostępny od początku pod `/api`; dodano `GET /health` (weryfikuje
  też realne połączenie z bazą) i `GET /version`.
- Prisma skonfigurowana, ale **bez modeli biznesowych** na tym etapie —
  pełny model MVP (przygotowany wcześniej) zachowany w
  `apps/api/prisma/schema.full-mvp.prisma.reference` do wprowadzenia w
  kolejnym, osobnym kroku.
- ESLint, Prettier, Husky i lint-staged skonfigurowane od pierwszego commita
  (root `package.json` z `npm workspaces` spinający `apps/api` i `apps/web`).
- Struktura katalogów frontendu rozszerzona o `layouts/`, `hooks/`,
  `services/`, `types/` (poza `pages/`, `features/`, `components/ui/`).

**Uzasadnienie:** Rozdzielenie „fundamentu" od „modelu domenowego" na dwa
osobne, zatwierdzane etapy pozwala zweryfikować środowisko (Docker, build,
Swagger, baza danych, Git) zanim doda się złożoność logiki biznesowej —
mniejsze ryzyko, że błąd konfiguracyjny zostanie odkryty dopiero w połowie
implementacji modułu reklamacji.

---

## Konwersja dokumentacji źródłowej PDF do Markdown

**Kontekst:** Część dokumentacji projektu (`CLAUDE.md`, `ROLES_AND_PERMISSIONS.md`,
`DOMAIN_MODEL.md`, `GLOSSARY.md`, `PROJECT_CONTEXT.md`, `BUSINESS_PROCESS.md`)
była dostępna wyłącznie jako pliki PDF, co utrudniało jej wersjonowanie i
przetwarzanie jako część repozytorium.

**Decyzja:** Wszystkie sześć dokumentów przekonwertowano do Markdown, z
zachowaniem struktury i treści. `CLAUDE.md` umieszczono w katalogu głównym
repozytorium (zgodnie z konwencją rozpoznawaną automatycznie przez Claude
Code). Pozostałe pięć dokumentów umieszczono w `docs/source/`. Od tego
momentu wyłącznie pliki `.md` są traktowane jako źródło dokumentacji
projektowej.

**Uzasadnienie:** Dokumentacja w Markdown może być wersjonowana razem z
kodem w Git, łatwo przeszukiwana i aktualizowana bez zewnętrznych narzędzi do
edycji PDF. Umieszczenie `CLAUDE.md` w katalogu głównym daje dodatkową,
praktyczną korzyść — plik jest automatycznie odczytywany przez Claude Code
jako instrukcje projektu.

**Uwaga:** Pozostałe dokumenty źródłowe (`FUNCTIONAL_REQUIREMENTS.md`,
`DATABASE.md`, `SCREENS.md`, `SECURITY_AND_GDPR.md`, `BUSINESS_RULES.md`)
były już w formacie Markdown i zostały skopiowane do `docs/source/` bez
zmian treści — cała dokumentacja projektu (11 dokumentów) znajduje się teraz
w jednym miejscu w repozytorium.

---

## Zatwierdzenie `schema.prisma` (MVP)

**Kontekst:** Przygotowano kompletny schemat Prisma dla uzgodnionego zakresu
MVP (`User`, `Customer`, `Product`, `Manufacturer`, `Case`, `CaseHistory`,
`Document`, `ReplacementProduct`, `AuditLog`) — celowo bez `Task`, `Comment`,
`Notification`, `EmailLog`, które zostaną dodane jako osobny krok.

**Decyzja:** Schemat zatwierdzony z czterema poprawkami:
- `Case.customerStatement` (nullable) — dosłowna treść zgłoszenia klienta,
  oddzielona od `Case.description` (podsumowanie sprawy) i od przyszłych
  notatek pracownika (docelowo model `Comment`, poza obecnym zakresem).
- `Product.purchaseProofNumber` (nullable) — numer dowodu zakupu.
- `Document.mimeType` i `Document.fileSize` — metadane pliku wymagane do
  bezpiecznej walidacji uploadu (typ MIME, limit rozmiaru w warstwie
  aplikacji).
- `CaseHistory.action` zmienione z `String` na zamknięty enum
  `CaseHistoryAction` — wymusza spójność wpisów historii i ułatwia
  filtrowanie/raportowanie zamiast dowolnego tekstu.

**Uzasadnienie:** Rozdzielenie `description`/`customerStatement` odpowiada
domenowemu rozróżnieniu między tym, co zgłosił klient, a tym, jak sprawę
podsumowuje system/pracownik — istotne dla ewentualnych sporów co do treści
zgłoszenia. Enum `CaseHistoryAction` jest świadomie ograniczony do zdarzeń
opisanych w obecnej dokumentacji biznesowej (BUSINESS_RULES.md,
ROLES_AND_PERMISSIONS.md) — rozszerzenie o nowe wartości w przyszłości jest
migracją addytywną, więc nie jest to przedwczesna sztywność.

**Uwaga:** `AuditLog.action` pozostaje typu `String` — to osobny, celowo
bardziej otwarty dziennik zdarzeń bezpieczeństwa/systemowych, nie objęty tą
zmianą.

---

## Klikalny prototyp UX (HTML/CSS/JS, bez backendu)

**Kontekst:** Przed dalszą implementacją backendu (moduł auth, upload
dokumentów) i docelowego frontendu React zdecydowano się zatrzymać i
zweryfikować UX na w pełni klikalnym prototypie, niezależnym od stosu
docelowego, obejmującym 7 ekranów: Logowanie, Dashboard, Lista reklamacji,
Nowa reklamacja, Szczegóły reklamacji, Zarządzanie producentami, Zarządzanie
użytkownikami.

**Decyzja:** Prototyp powstał jako osobny katalog `prototype/` w
repozytorium, wyłącznie w HTML/CSS/JS (bez React, bez NestJS, bez bazy
danych), z danymi przykładowymi trzymanymi w pamięci przeglądarki
(`js/data.js`). Każdy ekran to osobny plik `.html` + `.js` (nie jeden plik
monolityczny), żeby ułatwić późniejsze przeniesienie 1:1 do komponentów
React. Struktura danych przykładowych (statusy, typy reklamacji, pola
`Case`) odzwierciedla zatwierdzony `schema.prisma`. Rola użytkownika
(Pracownik/Kierownik/Administrator) jest symulowana przełącznikiem w
interfejsie (bez realnej autoryzacji), żeby zademonstrować różnice w
dostępie do ekranów „Producenci” i „Użytkownicy” zgodnie z
`ROLES_AND_PERMISSIONS.md`.

**Uzasadnienie:** Weryfikacja UX na tanim w zmianach prototypie (statyczne
pliki, brak zależności od backendu) pozwala wychwycić problemy z przepływem
ekranów i doborem pól formularzy, zanim zostaną utrwalone w kodzie
produkcyjnym React + NestJS — zmiana układu ekranu w prototypie kosztuje
znacznie mniej niż przepisywanie komponentów i logiki API.

**Uwaga:** Implementacja backendu (moduł `Cases`, endpoint `POST /cases`,
migracja Prisma) rozpoczęta w poprzednim etapie została **wstrzymana** na
czas oceny prototypu — nie została porzucona, kod cząstkowy pozostaje w
`apps/api/src/modules` do kontynuacji po akceptacji UX.

---

## Poprawki UX prototypu — Iteracja 1 (Dashboard, Reklamacje, Nowa reklamacja)

**Kontekst:** Testy prototypu ujawniły, że nowo utworzone sprawy „znikały”
po przejściu do ich szczegółów, a wyszukiwarka nie znajdowała danych, które
powinny istnieć. Zgłoszono też brak interaktywności kafelków dashboardu,
zbyt sztywną zmianę statusu (tylko „następny” status) oraz brak pola na
załącznik i nieoptymalne pole tekstowe dla oczekiwanego rozwiązania.

**Rzeczywista przyczyna błędów „znikająca sprawa” / „wyszukiwarka nie
działa”:** prototyp to aplikacja wielostronicowa (osobny plik `.html` na
ekran) — każde przejście między ekranami to **pełne przeładowanie
dokumentu**, które resetowało `js/data.js` do stanu początkowego. Nowo
utworzone sprawy/klienci istnieli tylko do najbliższej nawigacji.

**Decyzja:**
- Stan mutowalny (`users`, `manufacturers`, `customers`, `cases`) jest teraz
  odczytywany i zapisywany w `localStorage` (`js/data.js`:
  `loadState()`/`persist()`). Wszystkie miejsca mutujące dane
  (`case-new.js`, `case-detail.js`, `manufacturers.js`, `users.js`) wołają
  `SMARTRMA_DATA.persist()` po każdej zmianie. Dodano „Resetuj dane demo” w
  panelu bocznym, żeby świadomie wrócić do danych początkowych.
- Kafelki statystyk na dashboardzie są linkami (`<a>`) do `cases.html` z
  parametrem `?filter=`; lista reklamacji zyskała filtry `overdue` i
  `today`, liczone tymi samymi funkcjami (`SMARTRMA_DATA.isOverdue/
  isDueToday`) co dashboard — współdzielona logika, nie duplikat.
- „Zmień status” pozwala wybrać dowolny status z pełnej listy (nie tylko
  kolejny w procesie) — to świadome uproszczenie **wyłącznie na potrzeby
  prototypu**; docelowa walidacja przejść (`WARRANTY_FLOW`/`STATUTORY_FLOW`)
  zostaje w kodzie jako odniesienie do logiki `case-status.rules.ts` po
  stronie backendu.
- Dodano niefunkcjonalny element „Dodaj zdjęcie / plik” pod numerem dowodu
  zakupu (bez realnego uploadu) oraz zamieniono pole tekstowe „Oczekiwane
  rozwiązanie” na listę wyboru (Naprawa / Wymiana produktu / Wymiana części
  / Zwrot środków / Odstąpienie od umowy) — to pole (`requestedResolution`)
  pozostaje odrębne od enuma `Decision` w `schema.prisma`, więc zmiana nie
  wymaga migracji.
- Przy okazji naprawiono utrzymujący się błąd w `case-detail.js`: przyciski
  wewnątrz modali (`modal-status-save`, `modal-decision-save`) były
  podpinane wewnątrz `wireActions()`, wywoływanego po każdym `render()` —
  po kilku zmianach statusu jedno kliknięcie zapisywało wpis historii
  wielokrotnie. Podpięcie modali przeniesiono do jednorazowej funkcji
  `wireStaticModals()`.

**Uzasadnienie:** Poprawki są kosmetyczne/UX, nie zmieniają zakresu
biznesowego ani modelu danych. Trwałość stanu w `localStorage` jest
rozwiązaniem czysto prototypowym (nie backendowym) — po przejściu do
implementacji React + NestJS zostanie zastąpiona rzeczywistym API i stanem
serwera, więc nie jest to dług architektoniczny przenoszony do produkcji.

---

## Poprawki UX prototypu — Iteracja 2 (na podstawie UX_REVIEW_ITERATION_2.md)

**Kontekst:** Kolejna runda testów zgłosiła błąd oznaczony jako Critical
(„nowa reklamacja nadal nie zapisuje sprawy") oraz cztery pozycje High:
pełny pasek filtrów statusów na Dashboardzie, pole „Źródło zgłoszenia",
generowanie PDF potwierdzenia (2 egzemplarze) i miejsce na kod QR. Portal
klienta pozostaje w kategorii Future — bez zmian w tym kroku.

**Diagnoza błędu Critical:** Kod zapisu sprawy (naprawiony w Iteracji 1)
działał poprawnie w testach, więc przyczyną nie była logika, tylko
środowisko: jeśli przeglądarka blokuje `localStorage` w danym kontekście
(otwarcie pliku bezpośrednio przez `file://`, tryb prywatny, podgląd w
piaskownicy o innym originie niż lokalny serwer), zapis „udawał się" tylko
do najbliższej nawigacji — dokładnie objaw ze zgłoszenia. Poprzednia wersja
failowała cicho (`try/catch` + `console.warn`), więc problem był niewidoczny
dla testującego.

**Decyzja:**
- `data.js` wykrywa teraz jawnie dostępność `localStorage`
  (`storageAvailable`); `app.js` pokazuje trwały baner ostrzegawczy na
  każdym ekranie, jeśli zapis nie działa, zamiast dawać fałszywy komunikat
  sukcesu. `persist()` zwraca `true`/`false`.
- Dashboard zyskał sekcję „Wszystkie sprawy" z pełnym paskiem filtrów (14
  statusów + „Wszystkie"), filtrowanie w 100% po stronie klienta, bez
  przeładowania strony. Lista statusów (`ALL_STATUSES`) i renderowanie
  wiersza tabeli (`caseRowHtml`/`renderCasesIntoTable`) zostały
  scentralizowane w `data.js`/`app.js` i są teraz współdzielone między
  Dashboardem, listą reklamacji i modalem zmiany statusu — bez duplikacji.
- Dodano pole `source` („Źródło zgłoszenia": Sklep stacjonarny / E-mail /
  Telefon / Formularz WWW / Marketplace / Inne) do formularza nowej
  reklamacji i ekranu szczegółów.
- „Drukuj potwierdzenie" otwiera nowy widok `case-print.html` — dwa
  egzemplarze (klient/sklep) z danymi sprawy, klientowi, produktu i
  miejscem na podpisy. Generowanie PDF realizowane przez natywny druk
  przeglądarki (`window.print()` → „Zapisz jako PDF"), bez dodawania
  biblioteki JS do PDF — zgodnie z wymaganiem „tylko HTML/CSS/JS”.
- Kod QR: zgodnie z notatką w `UX_REVIEW_ITERATION_2.md` („na etapie
  prototypu wystarczy zaprojektować ekran oraz miejsce na QR") dodano
  wyłącznie zaprojektowany placeholder — bez realnej generacji kodu.

**Uwaga architektoniczna (do rozstrzygnięcia przed wznowieniem backendu):**
Pole `source` **nie istnieje** w zatwierdzonym `schema.prisma` — model
`Case` nie przewiduje kanału zgłoszenia. Zanim wrócimy do implementacji
backendu, trzeba: dodać `Case.source` (prawdopodobnie enum
`ComplaintSource` z wartościami jak w prototypie) do
`schema.prisma`/`schema.full-mvp.prisma.reference` i potraktować to jako
kolejną, świadomą poprawkę modelu — analogicznie do czterech poprawek z
etapu zatwierdzania schematu. Prototyp UX celowo wyprzedza model danych
(to jego rola), ale rozjazd trzeba jawnie zamknąć, a nie przenosić go
cicho do kodu produkcyjnego.

**Uzasadnienie:** Wszystkie zmiany pozostają kosmetyczne/UX poza jednym
wyjątkiem (`source`), który ma realny wpływ na model danych — stąd
osobna, wyraźna adnotacja zamiast cichego dodania pola.

---

## Portal Klienta — przesunięcie z Future do bieżącego etapu

**Kontekst:** `PROJECT_CONTEXT.md` (§8) i wcześniejszy wpis w tym dzienniku
(„Portal Klienta (po MVP)") jawnie umieszczały Portal Klienta poza
zakresem wersji 1.0. Otrzymano pięć dokumentów specyfikujących ten moduł
(`CLIENT_PORTAL.md`, `CLIENT_PORTAL_API.md`, `CLIENT_PORTAL_DATABASE.md`,
`CLIENT_PORTAL_IMPLEMENTATION_TASK.md`, `CLIENT_PORTAL_UI.md`) wraz z
jawnym poleceniem rozpoczęcia prac.

**Decyzja:** Traktujemy to jako świadomą zmianę zakresu (nie przeoczenie
dokumentacji) i budujemy Portal Klienta jako kontynuację tego samego
prototypu UX (HTML/CSS/JS, bez backendu) — zgodnie z przyjętym sposobem
pracy „prototyp przed implementacją". Nowe ekrany: `client-login.html`
(logowanie numerem sprawy + kodem dostępu) i `client-portal.html`
(Status / Historia / Dokumenty / Kontakt w zakładkach, responsywne —
pasek zakładek na desktopie, dolna nawigacja mobilna). Po stronie
pracownika (`case-detail.html`) dodano panel „Portal klienta" z
przełącznikiem i generatorem kodu dostępu (`CLIENT_PORTAL_IMPLEMENTATION_
TASK.md`, pkt 6).

**Kluczowe decyzje projektowe modułu:**
- Status pokazywany klientowi to **uproszczony 5-etapowy stepper**
  (Zgłoszona → Przyjęta → W trakcie → Decyzja → Zakończona), nie 14
  wewnętrznych statusów `CaseStatus` — klient detaliczny nie potrzebuje
  (i nie powinien widzieć) szczegółów wewnętrznego procesu. Mapowanie
  `STATUS_TO_PUBLIC_STAGE` w `data.js`.
- Historia widoczna dla klienta filtrowana jest przez nowe pole
  `CaseHistory.visibleForCustomer` (zgodnie z `CLIENT_PORTAL_DATABASE.
  md`) — zdarzenia wewnętrzne (przypisanie producenta, zmiana
  właściciela, aktualizacja Next Action) pozostają ukryte.
- Blokada logowania po 5 błędnych próbach jest **zaimplementowana
  naprawdę** (licznik w `localStorage` per numer sprawy) — to zachowanie
  UX dało się uczciwie zademonstrować bez backendu. Hashowanie kodu
  dostępu i HTTPS pozostają jawnie oznaczone jako wymagania backendowe/
  wdrożeniowe, niemożliwe do zademonstrowania w statycznym prototypie —
  kod dostępu w danych demo jest jawny (`clientAccessCode`), z komentarzem
  w kodzie, że produkcyjnie będzie to wyłącznie hash.
- Moduł Portalu Klienta (`client-login.js`, `client-portal.js`) celowo
  **nie korzysta z `app.js`** (powłoki pracownika) — inny odbiorca, inny
  model dostępu, zgodnie z `CLIENT_PORTAL_IMPLEMENTATION_TASK.md` pkt 1
  („Utworzyć moduł /client").
- Generator kodu QR na `case-print.html` pozostaje wizualnym
  placeholderem (bez realnej biblioteki QR), ale na ekranie (nie w
  druku) jest klikalny i prowadzi do `client-login.html` z wypełnionym
  numerem sprawy — demonstruje docelowy przepływ bez dodawania
  zależności.

**Uwaga architektoniczna (kolejny rozjazd z zatwierdzonym `schema.prisma`,
do zamknięcia przed wznowieniem backendu):** Pola wymagane przez
`CLIENT_PORTAL_DATABASE.md` — `Case.clientAccessCodeHash`,
`Case.clientPortalEnabled`, `Case.clientLastLogin`,
`CaseHistory.visibleForCustomer`, `Document.visibility` — **nie istnieją**
w zatwierdzonym modelu danych. Podobnie jak przy polu `source`, prototyp
świadomie wyprzedza schemat; przed powrotem do implementacji backendu
potrzebna jest osobna, zatwierdzana poprawka `schema.prisma` obejmująca
oba te rozjazdy (`source` + pola Portalu Klienta) w jednym kroku, żeby
uniknąć migrowania modelu danych fragmentami.

**Uzasadnienie:** Prototyp pozostaje właściwym miejscem do weryfikacji UX
nowego, znaczącego modułu przed inwestycją w kod produkcyjny — ta sama
logika, która uzasadniała podejście „prototyp najpierw" dla modułu
pracownika, dotyczy też Portalu Klienta, tym bardziej że ma zupełnie
innego odbiorcę (klienta detalicznego, często na telefonie po
zeskanowaniu kodu QR).

---

## Portal Klienta — Code Review, runda dopracowująca (12 punktów)

**Kontekst:** Po pierwszej wersji Portalu Klienta przeprowadzono szczegółowy
code review z 12 punktami poprawek oraz jedną uwagą architektoniczną
(„Portal Klienta nie powinien rozwijać się jako osobna aplikacja").

**Decyzja i zakres zmian:**
1. **Bezpieczny link z tokenem** — nowy sposób logowania
   (`client-login.html?case=...&token=...`) z automatycznym zalogowaniem;
   generowany z panelu „Portal klienta" w `case-detail.html`. Token
   jednorazowy — `clientAccessTokenUsed` unieważnia go po pierwszym użyciu.
   Logowanie kodem pozostaje jako alternatywa.
2. **Audyt „tylko do odczytu"** — potwierdzono i udokumentowano w kodzie:
   jedyne zapisy w module klienta to `clientLastLogin` i
   `clientAccessTokenUsed` (efekty uboczne logowania), zero edycji treści
   reklamacji.
3. **Centralne mapowanie statusów** — dodano `PUBLIC_STATUS_LABEL` (14
   wpisów, jedno zdanie per status wewnętrzny) w `data.js`, jedyne źródło
   prawdy, czytane zarówno przez stepper, jak i (pośrednio) każdy przyszły
   ekran, który potrzebowałby tekstu statusu.
4. **Stepper rozbudowany** o klasy `done`/`current`/`future` i procentowy,
   orientacyjny pasek postępu (`PUBLIC_STAGE_META[key].progress`) — wartości
   dobrane ręcznie, nie liczone z 14 statusów wewnętrznych (dałoby to
   mylące, nierówne skoki).
5. **Ikonografia historii** — `SMARTRMA_DATA.getHistoryIcon()`, jedna
   funkcja współdzielona przez historię klienta i historię pracownika
   (`case-detail.js`) — bez duplikowania mapowania ikon.
6. **Komponent dokumentów** — `renderDocumentCard()` w `app.js`, kształt
   danych 1:1 z modelem `Document` w `schema.prisma`
   (fileName/fileType/mimeType/fileSize/uploadedAt). Używany zarówno w
   Portalu Klienta, jak i w zakładce „Dokumenty" po stronie pracownika —
   dane demo (`Case.documents`) rozszerzone o warianty dla wszystkich 12
   spraw.
7. **Potwierdzenie kontaktu** — inline, trwały stan sukcesu (nie tylko
   toast, który można przeoczyć), z `aria-live="polite"`.
8. **Responsywność 320–1440px** — dodano dedykowane poprawki dla ekranów
   ≤400px (stepper, `kv-row`, karty dokumentów, nagłówki) — sprawdzone
   przeglądem CSS, bez dostępu do realnej macierzy urządzeń w tym
   środowisku.
9. **Dostępność** — `.public-tab` zamienione z `<div>` na `<button>`
   (naturalna obsługa Enter/Spacja), `role="tablist"/"tab"/"tabpanel"`,
   `aria-selected`, `aria-live` na komunikatach błędu/blokady/sukcesu,
   Escape zamyka modale (globalny listener w `app.js`), `aria-label` na
   przyciskach ikonowych.
10. **QR koduje numer sprawy** (bez zmian co do kierunku — to już było
    poprawnie zaimplementowane w poprzedniej iteracji: skan wypełnia numer
    sprawy, klient wpisuje tylko kod). Bezpieczny link z tokenem (pkt 1) to
    świadomie odrębna, dodatkowa ścieżka, nie zamiana QR.
11. **Oznaczenia pod backend** — wydzielone, nazwane funkcje z komentarzem
    „BACKEND TODO": `validateToken()`, `verifyAccessCode()`,
    `checkLoginAttempts()`, `generateAccessCode()`, `generateSecureToken()`
    — każda w miejscu, gdzie docelowo nastąpi wywołanie API.
12. **Dane demo** — portal włączony dla **wszystkich 12 spraw** (wcześniej
    tylko 5), każda z unikalnym kodem dostępu; dodano zróżnicowane zestawy
    dokumentów per sprawa. Pozwala to przetestować portal również na
    sprawach zamkniętych, odrzuconych i anulowanych, czego wcześniej nie
    dało się zrobić.

**Uwaga architektoniczna (zaadresowana):** `client-login.js` i
`client-portal.js` ładują teraz `app.js` i korzystają z jego współdzielonych
funkcji (`showToast`, `openModal`/`closeModal`, `renderDocumentCard`,
`wireMockDocumentDownloads`) zamiast utrzymywać własne kopie. Nie wywołują
`initShell()`/`renderSidebar()` — te pozostają specyficzne dla powłoki
pracownika (RBAC ról wewnętrznych), bo nie mają odpowiednika po stronie
klienta detalicznego. To rozróżnienie ("współdziel dane/logikę/komponenty
UI, ale nie duplikuj i nie zmuszaj do wspólnej nawigacji dwóch różnych
odbiorców") wydaje się właściwą interpretacją uwagi z review.

**Uzasadnienie:** Wszystkie zmiany są dopracowaniem UX/architektury
istniejącego modułu, bez zmiany zakresu biznesowego. Konsekwentne trzymanie
się zasady „jedno źródło prawdy" (statusy, ikony, komponent dokumentu)
bezpośrednio ułatwi późniejsze przeniesienie do React — każdy z tych
elementów da się przenieść jako pojedynczy komponent/hook bez szukania
duplikatów w kilku plikach.

---

## Portal Klienta — Code Review, finalizacja modułu (8 punktów)

**Kontekst:** Ostatnia runda code review przed uznaniem Portalu Klienta za
zakończony na etapie MVP prototypu i powrotem do implementacji właściwej
aplikacji (React + NestJS).

**Decyzja i zakres zmian:**

1. **Osobny moduł mapowania statusów** — wydzielono `js/public-status-mapper.js`
   jako jedyne miejsce w całym prototypie znające nazwy wartości `CaseStatus`.
   `client-portal.js` woła wyłącznie `PUBLIC_STATUS_MAPPER.describe(status)`
   i nigdy nie porównuje statusu z literałem wewnętrznym. Odpowiednik w
   React: samodzielny moduł/hook całkowicie niezależny od ekranów panelu
   pracownika.
2. **Przygotowanie pod wielojęzyczność** — nowy `js/client-labels.js`:
   jeden słownik (`CLIENT_LABELS`) ze wszystkimi tekstami widocznymi dla
   klienta (statusy, błędy, przyciski, opisy), funkcja `t(key, vars)` do
   odczytu, `applyStaticLabels()` do zamiatania statycznego tekstu w HTML
   przez atrybut `data-i18n`. i18n samo w sobie NIE jest zaimplementowane
   (brak przełącznika języka) — to wyłącznie eliminacja tekstu
   rozproszonego po plikach `client-login.js`/`client-portal.js`/`*.html`.
3. **Architektura komponentu dokumentów pod przyszły podgląd** — dodano
   `doc.category` (confirmation/photo/manufacturer/protocol/decision/other,
   niezależne od `doc.fileType`) i `getDocumentPreviewInfo()` w `app.js`,
   które określa, czy dany typ pliku technicznie nadaje się do podglądu
   (PDF/JPG/PNG - tak, inne - nie). Sam podgląd (modal z `<iframe>`/`<img>`)
   nadal niezaimplementowany, ale miejsce na niego jest jedno i jawnie
   oznaczone.
4. **Historia grupowana wg daty** — `SMARTRMA_DATA.groupHistoryByDate()`
   (Dzisiaj / Wczoraj / DD.MM.RRRR), używane przez `client-portal.js`.
5. **Ponowny przegląd responsywności** — dodano poprawki dla orientacji
   poziomej telefonu (`max-height` + `orientation: landscape`), doprecyzowano
   zachowanie na tabletach (768–1024px), zabezpieczono przed przepełnieniem
   przy długich nazwiskach/nazwach dokumentów/numerach (`overflow-wrap`).
   Dodano do danych demo **jawny przypadek testowy** z celowo bardzo długimi
   wartościami (klient „Aleksandra-Weronika Świętosławska-Wojciechowska-
   Kowalczyk", długi e-mail, długi adres, długa nazwa dokumentu — sprawa
   RMA/2026/0007), żeby dało się to zweryfikować wizualnie, nie tylko
   przeglądem kodu CSS.
6. **Audyt pokrycia scenariuszy demo** — zweryfikowano programowo (skrypt
   testowy) pokrycie: zakończona, odrzucona, anulowana, oczekiwanie na
   producenta, zwrot środków, wymiana produktu, naprawa. Brakujący
   scenariusz „zwrot środków w pełni zrealizowany" uzupełniono, przepisując
   sprawę RMA/2026/0010 na zamkniętą sprawę rękojmiową z decyzją
   `ZwrotSrodkow`. **„Oczekiwanie na klienta" pozostaje niepokryte — patrz
   uwaga architektoniczna poniżej, to nie przeoczenie w danych demo, tylko
   brak w modelu.**
7. **Dokumentacja zaktualizowana** — README prototypu (pełna lista
   funkcjonalności Portalu Klienta, sekcja „świadomie NIE
   zaimplementowane"), ten wpis w DECISIONS.md.
8. **Przegląd pod kątem przeniesienia do React** — funkcje renderujące w
   `client-portal.js` opisano komentarzami wprost wskazującymi docelowy
   komponent React (`<StatusPanel case={c} />`, `<HistoryPanel>`,
   `<DocumentsPanel>`, `<ContactPanel>`, `<TabBar>`, `<OwnerCard>`) — każda
   przyjmuje dane i zwraca widok, bez efektów ubocznych poza odczytem z
   `SMARTRMA_DATA`. `activeTab`/`currentCase` to jedyny stan modułu -
   naturalny odpowiednik `useState()`.

**Uwaga architektoniczna — realna luka w modelu domenowym (do rozstrzygnięcia
przed implementacją backendu):** Scenariusz „oczekiwanie na klienta"
wymieniony w wymaganiach review **nie ma odpowiednika w obecnym enumie
`CaseStatus`** (`schema.prisma`, `BUSINESS_RULES.md`). Istnieje jedynie
powiadomienie „prośba o uzupełnienie danych" (BR-060) jako `Notification`,
nie jako status sprawy. Przed implementacją backendu należy rozstrzygnąć:
czy to nowy status w `CaseStatus` (kolejna poprawka schematu, obok `source`
i pól Portalu Klienta z poprzednich rund), czy świadomie pozostaje
wyłącznie powiadomieniem bez zmiany statusu głównego. Nie rozstrzygam tego
tutaj jednostronnie — to decyzja biznesowa, nie architektoniczna.

**Uzasadnienie:** Ta runda kończy fazę prototypowania Portalu Klienta.
Wydzielenie `public-status-mapper.js` i `client-labels.js` to inwestycja,
która bezpośrednio obniży koszt portu do React — oba moduły da się
przenieść niemal 1:1 (mapper -> hook/serwis, labels -> zasób i18n), bez
przepisywania logiki. Świadomie NIE domykam luki „oczekiwanie na klienta"
zgadywaniem, żeby nie wprowadzić do modelu statusu, którego nikt faktycznie
nie potrzebuje.

---

## Kreator zgłoszenia reklamacyjnego (Wizard) — nowy moduł

**Kontekst:** Otrzymano zadanie techniczne na kreator (Wizard) będący
pierwszym kontaktem klienta z systemem — samoobsługowe zgłoszenie
reklamacji, 8-krokowy formularz z autosave, walidacją real-time,
drag&drop plików i dwiema ścieżkami zgłoszenia (przez sklep / bezpośrednio
do producenta).

**Decyzja:** Zbudowano jako **osobny moduł** (`client-new-case.html` +
`js/client-new-case.js`), nie jako rozszerzenie istniejącego Portalu
Klienta — ten pozostaje wyłącznie do odczytu (decyzja z poprzedniej rundy
code review), kreator wyłącznie *tworzy* nową sprawę. Oba moduły łączy
wspólna sesja: po wysłaniu formularza klient trafia bezpośrednio do
`client-portal.html` bez ponownego logowania.

**Kluczowe decyzje projektowe:**
- **Model `draft`** — cały stan formularza w jednym obiekcie, zapisywanym
  do `localStorage` po każdej zmianie (autosave, wymóg 10.2). Pliki (`File`
  objects) nie są serializowane — tylko metadane (nazwa, rozmiar); podglądy
  (`URL.createObjectURL`) żyją wyłącznie w bieżącej sesji przeglądarki.
- **Kompletność formularza liczona z jednej listy** (`getRequiredChecks()`)
  — to samo źródło danych dla procentu w nagłówku i dla komunikatów
  „Brakuje: ...” pod każdym krokiem, żeby te dwie rzeczy nigdy się nie
  rozjechały.
- **Generator numeru sprawy współdzielony** — `SMARTRMA_DATA.
  generateCaseNumber()` przeniesiony z `case-new.js` (rejestracja
  pracownicza) do `data.js`; oba źródła zgłoszeń (pracownik i klient) używają
  teraz jednego licznika zamiast dwóch niezależnych kopii tej samej logiki.
- **Dwie ścieżki zgłoszenia** — nowe pole `Case.submissionMode`
  (`PrzezSklep`/`BezposrednioDoProducenta`), celowo **niezależne** od
  `Case.complaintType` (Gwarancja/Rękojmia — to inny wymiar: kto
  merytorycznie decyduje, nie kto przyjął zgłoszenie). Sprawy monitorowane
  dostają odznakę w `cases.html` (nowy filtr „Monitorowane”) i na liście
  spraw pracownika. **Świadomie NIE nadużyto pola `isException`** do
  oznaczenia tych spraw — to pole ma inne, wcześniej ustalone znaczenie
  (sprawy wymagające akceptacji Kierownika) i konflatacja dwóch pojęć
  zaciemniłaby model.
- **Mock wyszukiwania zamówienia** — `SMARTRMA_DATA.MOCK_ORDERS`
  (`findOrder()`), płaska tablica 4 przykładowych zamówień. Uczciwie
  oznaczone jako zastępstwo integracji z systemem sprzedażowym (BACKEND
  TODO), nie próba udawania prawdziwego wyszukiwania.
- **Mock kompresji zdjęć** — pokazywany procent zmniejszenia rozmiaru jest
  fikcyjny (realna kompresja wymaga przetwarzania `<canvas>`, poza
  zakresem prototypu UX); jawnie opisane w komentarzu w kodzie.
- **Mock wysyłki e-mail** — `console.info()` + brak realnego SMTP;
  potwierdzenie i (dla ścieżki monitorowanej) dodatkowy e-mail o
  monitoringu są tylko zalogowane, nie wysłane.

**Uwaga architektoniczna — kolejna porcja rozjazdu z zatwierdzonym
`schema.prisma`** (do zamknięcia jednym zbiorczym krokiem razem z `source`
i polami Portalu Klienta z poprzednich rund): `Case.submissionMode`,
`Case.deliveryAddress` (osobny adres odbioru/wysyłki, niekoniecznie tożsamy
z adresem klienta), `Case.courierRequested`, `Case.preparationFeeAccepted`.
Żadne z tych pól nie istnieje w obecnym modelu danych.

**Uzasadnienie:** Kreator to najbardziej złożony pojedynczy ekran w całym
prototypie (8 kroków, pliki, walidacja, dwie ścieżki) — stąd nacisk na
jeden model danych (`draft`) i jedną listę wymagań (`getRequiredChecks`)
jako pojedyncze źródła prawdy, żeby uniknąć rozjazdu między tym, co widzi
klient, a tym, co faktycznie blokuje wysłanie formularza.

---

## Kreator zgłoszenia — poprawki (rozgałęzienie ścieżki "bezpośrednio do producenta")

**Kontekst:** Doprecyzowano wymagania dla kreatora: kurier (20 zł w jedną
stronę, alternatywa dostawy własnej), powiązanie opłaty 80 zł zarówno ze
stanem produktu jak i opakowaniem, doprecyzowanie noty o gwarancji B2B (1
rok), oraz — najważniejsze — inny przebieg ścieżki "bezpośrednio do
producenta": klient wybiera, czy informuje sklep; jeśli tak, sklep
monitoruje sprawę, a system pokazuje dane producenta i instrukcję krok po
kroku zamiast pełnego formularza.

**Decyzja:** Ścieżka "bezpośrednio do producenta" nie przechodzi już przez
te same 7 kroków co ścieżka "przez sklep". `getActiveSteps()` w
`client-new-case.js` jest teraz jedynym miejscem decydującym, jakie kroki
są aktywne:
- **Przez sklep:** method → info → customer → address → purchase →
  description → attachments → summary (bez zmian, 8 kroków).
- **Bezpośrednio do producenta:** method → producerInfo (2 kroki). Krok
  `producerInfo` pokazuje wybór producenta, jego dane kontaktowe i
  instrukcję krok po kroku (`Manufacturer.submissionMethod`/
  `complaintProcedure`/`requiredDocumentsNote`/`requiredPhotosNote` — dane
  już istniały w modelu, zero nowych pól schematu), a następnie checkbox
  "poinformuj sklep".

**Dwa scenariusze końcowe tej ścieżki:**
- Klient **nie** chce monitoringu → `submitDirectToProducer()` **nie
  tworzy żadnej sprawy** w systemie, tylko pokazuje ekran z życzeniami
  powodzenia. To świadoma decyzja: sklep nie powinien "śledzić" sprawy, o
  której klient go nie poinformował.
- Klient chce monitoringu → tworzona jest **minimalna** sprawa (bez opisu
  usterki, bez załączników — producent zbiera je bezpośrednio, sklep tylko
  obserwuje), z `submissionMode: 'BezposrednioDoProducenta'` i dostępem do
  Portalu Klienta.

Zweryfikowano programowo (test z zamockowanym DOM): oba scenariusze
zachowują się zgodnie z opisem — liczba spraw w systemie nie zmienia się
przy braku zgody na monitoring, rośnie o jedną przy zgodzie.

**Pozostałe poprawki tekstowe** (bez zmian strukturalnych): opłata 80 zł
opisana teraz jako dotycząca produktu *i* opakowania (wcześniej tylko
produktu); zgoda w podsumowaniu dopasowana do tego samego zakresu; nota
przy kurierze wyjaśnia alternatywę (dostawa własna); nota o gwarancji B2B
doprecyzowana do "1 rok (12 miesięcy)".

**Uzasadnienie:** Rozgałęzienie w jednym miejscu (`getActiveSteps()`) było
konieczne, żeby uniknąć dwóch kopii logiki walidacji/nawigacji — reszta
kodu (nagłówek, przyciski, dispatch kroków) odpytuje tę funkcję zamiast
znać szczegóły obu ścieżek.

---

## Kreator zgłoszenia — ścieżka „bezpośrednio do producenta": przygotowanie produktu + instrukcja e-mail

**Kontekst:** Doprecyzowano krok `producerInfo`: przed przejściem dalej
klient musi zapoznać się z zasadami przygotowania produktu do wysyłki
(opakowanie, czystość) i je zaakceptować, a następnie może opcjonalnie
poprosić o instrukcję zgłoszenia do producenta na e-mail — niezależnie od
późniejszego wyboru „czy sklep ma monitorować sprawę” (ta część
pozostała bez zmian).

**Decyzja:** Krok `producerInfo` rozbudowany o kaskadę widoczności (każda
sekcja pojawia się dopiero po spełnieniu poprzedniej):
1. Wybór producenta (bez zmian).
2. Panel „Przygotowanie produktu do wysyłki” (opakowanie oryginalne/
   zastępcze, produkt czysty/suchy/przygotowany do oględzin, ostrzeżenie
   o możliwej odmowie przyjęcia) + obowiązkowy checkbox akceptacji
   (`producerPrepAcknowledged`) — blokuje dalsze kroki, dopóki nie
   zaznaczony.
3. Pytanie „Czy chcesz otrzymać instrukcję zgłoszenia do producenta?"
   (Tak/Nie, `wantsProducerInstructions`). Przy „Tak” — pole e-mail
   (`producerInstructionsEmail`) i wyświetlenie instrukcji na ekranie
   (bo w prototypie nie ma realnej wysyłki — to jednocześnie realizuje
   wariant „alternatywnie system wyświetla instrukcję na ekranie” ze
   specyfikacji). Instrukcja korzysta z tych samych pól `Manufacturer`
   co poprzednio (`complaintProcedure`/`requiredDocumentsNote`/
   `requiredPhotosNote`/`submissionMethod`/`portalUrl`/`contactEmail`) —
   **żadnych nowych pól schematu**. Panel administracyjny producentów
   (`manufacturers.html`) już pozwala je edytować — zweryfikowano, nie
   wymagało zmian.
4. Pytanie o monitoring przez sklep — bez zmian, jak wcześniej.

Instrukcja producenta jest teraz pokazywana ponownie na ekranie końcowym
(sukcesu lub „tylko informacyjnym”, gdy sklep nie monitoruje) — bez tego
klient straciłby do niej dostęp po wysłaniu formularza w scenariuszu bez
monitoringu (brak sprawy w systemie = brak Portalu Klienta, do którego
mógłby wrócić).

**Uzasadnienie:** Kaskadowa walidacja krok-po-kroku (produkt →
przygotowanie → instrukcja → monitoring) odzwierciedla naturalną
kolejność decyzji klienta i pozwala pokazywać tylko to, co aktualnie
istotne, zamiast całego, długiego formularza naraz.

---

## Rozbudowa panelu administracyjnego — pracownicy, producenci, marki

**Kontekst:** Kolejny etap rozwoju: pełne zarządzanie pracownikami (role,
oddziały, reset hasła, historia logowań/aktywność), pełne zarządzanie
producentami (dane firmowe, logistyka, automatyzacja), nowa encja Marka
z automatycznym rozpoznawaniem producenta, oraz możliwość poproszenia
klienta o uzupełnienie danych bez zakładania nowej sprawy.

**Zakres zrealizowany:**

- **5 ról systemowych** (`ROLE_LABELS` w `data.js`): Administrator,
  Kierownik, Pracownik Działu Reklamacji, Serwis, Odczyt (tylko podgląd).
  Świadomie **nie zmieniono** wewnętrznych wartości ról używanych od
  początku projektu w RBAC (`Pracownik`/`Kierownik`/`Administrator`) —
  zmieniły się tylko etykiety wyświetlane, żeby nie łamać gatingu
  nawigacji w dziesiątkach miejsc kodu.
- **Rola „Odczyt"** — generyczny mechanizm `data-write-action` w `app.js`
  (`applyRoleGates()`) ukrywa wszystkie oznaczone tym atrybutem przyciski
  zapisu, zamiast wymieniać dozwolone role na każdym przycisku z osobna.
  Pokrycie: nowa reklamacja, zmiana statusu/decyzji/anulowanie sprawy,
  przełącznik i generator linku Portalu Klienta, dodawanie/usuwanie/reset
  hasła użytkowników i producentów.
- **Oddziały/sklepy** (`branches`) — minimalny model (3 przykładowe),
  przypisanie pracownika do oddziału. To pierwszy krok w stronę
  wielooddziałowości, nie pełna obsługa multi-tenant — patrz uwaga niżej.
- **Pełne CRUD pracowników** (`users.html`/`.js`): dodawanie, edycja,
  **usuwanie** (z ostrzeżeniem, jeśli użytkownik jest właścicielem spraw),
  **reset hasła** (mock — `SMARTRMA_DATA.generateTempPassword()`,
  wyraźnie oznaczony BACKEND TODO), przypisanie roli i oddziału,
  **historia logowań** (mock) i **aktywność w sprawach** — ta druga liczona
  z PRAWDZIWYCH wpisów `CaseHistory` danego użytkownika, nie z osobnego,
  zmyślonego logu, żeby uniknąć dwóch niezależnych źródeł prawdy.
- **Pełna rozbudowa Producenta** (`manufacturers.html`/`.js`): dane
  podstawowe (kraj, NIP, adres), dane kontaktowe (osoba, telefon, e-mail),
  sposób zgłoszenia z polami Portalu B2B pokazywanymi warunkowo
  (adres/login/hasło — hasło jawne tylko w danych demo, z komentarzem że
  produkcyjnie to sekret szyfrowany po stronie backendu), procedura
  reklamacyjna (max liczba zdjęć, max rozmiar załączników, wymagany numer
  seryjny/ramy/dowód zakupu), **logistyka** (adres zwrotu, kto organizuje
  transport, etykieta kuriera producenta, koszt kuriera zamawianego przez
  sklep, wymagania pakowania i stanu produktu), **automatyzacja**
  (przełączniki e-mail/przypomnienia/eskalacje/auto-zamknięcie — zapisane
  w danych, bez realnego wykonania, które wymaga harmonogramu zadań po
  stronie backendu).
- **Statystyki producenta liczone z rzeczywistych danych demo**
  (`getManufacturerStats()`): liczba spraw, najczęściej reklamowane
  modele, średni czas realizacji zamkniętych spraw — nie zmyślone liczby.
- **Encja Marka (Brand)** — relacja jeden-do-wielu z Manufacturer (jeden
  producent/dystrybutor obsługuje wiele marek; marka należy do dokładnie
  jednego producenta — uproszczenie wystarczające dla przykładu z zadania:
  dystrybutor KidsTech obsługuje Cybex, Joie, Britax Römer, Maxi-Cosi,
  Kinderkraft, Espiro). CRUD marek jest zagnieżdżony w formularzu edycji
  producenta (dodawanie/usuwanie chipów), zgodnie z tym, jak są używane.
- **Automatyczne rozpoznawanie producenta po marce** przy rejestracji
  reklamacji — dodane w `case-new.js` (formularz pracownika) i kroku
  „Informacje o zakupie" w `client-new-case.js` (kreator klienta) jako
  **pole dodatkowe, opcjonalne**, nie zastępujące istniejącego,
  przetestowanego pola „Producent" — świadoma decyzja, żeby nie
  przebudowywać wokół marki jako pola głównego i nie ryzykować
  destabilizacji już działających, zwalidowanych formularzy.
- **„Poproś o uzupełnienie danych"** (`case-detail.html`/`.js`) — modal
  z szybkimi „chipami" (numer seryjny / zdjęcia / dowód zakupu / inny
  dokument) + polem tekstowym; zapisuje wpis `CaseHistory` (akcja
  `InfoRequested`, widoczny też w Portalu Klienta z treścią prośby) i
  mock e-mail — **bez zakładania nowej reklamacji**, zgodnie z wymaganiem.

**Świadomie ograniczone / niezaimplementowane:**
- Automatyzacje (e-mail/przypomnienia/eskalacje/auto-zamknięcie) to
  wyłącznie przełączniki w danych — realne wykonanie wymaga harmonogramu
  zadań po stronie backendu, poza zakresem statycznego prototypu.
- Reset hasła i historia logowań są mockowane (jak cała reszta
  bezpieczeństwa w tym prototypie — konsekwentnie z wcześniejszymi
  decyzjami dot. kodów dostępu Portalu Klienta).
- Marki nie zostały dodane jako pole główne w kroku „Informacje o
  zakupie" wewnątrz ścieżki „bezpośrednio do producenta" (`producerInfo`)
  — tam wybór producenta ma inny kontekst (kogo kontaktować, nie jaki
  producent obsługuje zarejestrowany w sklepie produkt) i nie wymagał
  tej samej pomocy.

**Uwaga architektoniczna — kolejna, największa jak dotąd porcja rozjazdu
z zatwierdzonym `schema.prisma`** (do zamknięcia jednym zbiorczym krokiem
razem z poprzednimi: `source`, polami Portalu Klienta, polami kreatora):
nowe wartości `UserRole` (Serwis, Odczyt), `User.branchId`,
`User.loginHistory`, `User.passwordResetAt`, nowa encja `Branch`, nowa
encja `Brand` (+ relacja z `Manufacturer`), oraz **cała rozbudowa**
`Manufacturer` (kraj, NIP, dane kontaktowe, pola Portalu B2B, pola
procedury reklamacyjnej, zagnieżdżony obiekt `logistics`, zagnieżdżony
obiekt `automation`) i nowa wartość `CaseHistoryAction.InfoRequested`.
Zakres tej porcji jest na tyle duży, że warto rozważyć, czy `logistics`/
`automation` powinny być osobnymi tabelami Prisma (relacja 1:1 z
Manufacturer) zamiast pól JSON — to decyzja do podjęcia przy projektowaniu
właściwego schematu, nie w prototypie.

**Uwaga architektoniczna — wielooddziałowość:** dodanie `User.branchId`
i listy `branches` to **tylko pole**, nie pełna obsługa multi-branch
(np. reklamacje nie są jeszcze filtrowane/scopowane per oddział, dashboard
nie rozróżnia oddziałów). Traktować jako punkt wyjścia do dyskusji, nie
gotowe rozwiązanie.

**Uzasadnienie:** Zakres tego etapu był bardzo duży (dwa pełne panele
administracyjne + nowa encja + integracja z trzema istniejącymi
formularzami), stąd nacisk na: (1) nieduplikowanie logiki (statystyki i
aktywność liczone z prawdziwych danych, nie osobne mocki), (2) nieinwazyjne
dodawanie funkcji do już przetestowanych formularzy (marka jako pole
dodatkowe, nie przebudowa), (3) jeden generyczny mechanizm RBAC dla nowej
roli Odczyt zamiast rozproszonych warunków.

---

## Proces pracy: iteracyjne etapy z akceptacją i dziennikiem decyzji

**Kontekst:** Ustalono sposób dalszej współpracy nad projektem.

**Decyzja:** Praca odbywa się etapami; po każdym etapie następuje zatrzymanie
i oczekiwanie na akceptację przed przejściem dalej. Artefakty (np. archiwa
ZIP) tworzone są tylko na wyraźną prośbę. Każdy zakończony etap jest
dokumentowany w niniejszym pliku.

**Uzasadnienie:** Przy projekcie rozwijanym iteracyjnie z pomocą Claude Code,
udokumentowana historia decyzji ułatwia wznowienie pracy po przerwie i
onboarding kolejnych osób bez odtwarzania kontekstu z historii rozmów.
