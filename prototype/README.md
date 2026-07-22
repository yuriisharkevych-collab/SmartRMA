# SmartRMA AI — Prototyp UX (HTML / CSS / JS)

Klikalny prototyp interfejsu SmartRMA AI, przygotowany do oceny UX przed
rozpoczęciem implementacji w React + NestJS. **Bez frameworków, bez bazy
danych** — wyłącznie statyczny HTML, CSS i JavaScript z danymi przykładowymi
w pamięci przeglądarki.

## Uruchomienie lokalne

Wymagany jest dowolny prosty serwer plików statycznych (przeglądarki
blokują niektóre funkcje JS przy otwieraniu plików bezpośrednio przez
`file://`, dlatego zalecany jest serwer HTTP, nie podwójne kliknięcie pliku).

**Opcja 1 — Python (zalecane, jeśli masz Pythona):**

```bash
cd prototype
python3 -m http.server 8080
```

Otwórz [http://localhost:8080](http://localhost:8080) w przeglądarce.

**Opcja 2 — Node.js:**

```bash
cd prototype
npx serve .
```

**Opcja 3 — VS Code:** rozszerzenie „Live Server” → prawy klik na
`index.html` → „Open with Live Server”.

## Logowanie

Ekran logowania nie jest podłączony do backendu. Formularz akceptuje
dowolne dane — o tym, co zobaczysz w aplikacji, decyduje wybrana **rola**
(Pracownik / Kierownik / Administrator), którą można zmienić w dowolnym
momencie w panelu bocznym („Podgląd jako”). To symuluje model RBAC opisany
w `ROLES_AND_PERMISSIONS.md`:

- **Pracownik** — nie widzi ekranów „Producenci” i „Użytkownicy”.
- **Kierownik** — widzi „Producenci”, nie widzi „Użytkownicy”; jako jedyny
  (obok Administratora) może ustawić decyzję w sprawach rękojmi.
- **Administrator** — jedyna rola z dostępem do „Użytkownicy”.

## Struktura plików

```
prototype/
├── index.html              # Logowanie (pracownik)
├── dashboard.html           # Dashboard (+ pełny pasek filtrów statusów)
├── cases.html                # Lista reklamacji
├── case-new.html             # Nowa reklamacja (formularz)
├── case-detail.html          # Szczegóły reklamacji (+ panel Portal klienta)
├── case-print.html           # Potwierdzenie przyjęcia reklamacji (2 egzemplarze, do druku/PDF)
├── manufacturers.html        # Zarządzanie producentami
├── users.html                 # Zarządzanie użytkownikami
├── client-login.html         # Portal Klienta — logowanie (kod dostępu LUB bezpieczny link z tokenem)
├── client-portal.html        # Portal Klienta — status / historia / dokumenty / kontakt
├── client-new-case.html      # Kreator zgłoszenia reklamacyjnego (Wizard) — pierwszy kontakt klienta
├── css/
│   └── styles.css            # Tokeny projektowe + wszystkie komponenty UI
├── js/
│   ├── data.js                 # Dane przykładowe + trwałość (localStorage) + logika bez tekstu/tłumaczeń
│   ├── client-labels.js        # Centralny słownik WSZYSTKICH tekstów widocznych dla klienta (i18n-ready)
│   ├── public-status-mapper.js # JEDYNE miejsce znające CaseStatus - tłumaczy status wewnętrzny na widok klienta
│   ├── app.js                   # Sidebar/topbar, rola, tabela spraw, komponent dokumentu, baner ostrzegawczy
│   ├── dashboard.js
│   ├── cases.js
│   ├── case-new.js
│   ├── case-detail.js
│   ├── case-print.js
│   ├── manufacturers.js
│   ├── users.js
│   ├── client-login.js        # Osobny moduł: logowanie kodem lub tokenem, blokada po 5 próbach
│   ├── client-portal.js       # Osobny moduł: ekran klienta (bez powłoki pracownika)
│   └── client-new-case.js     # Osobny moduł: kreator zgłoszenia (8 kroków, autosave, walidacja)
└── README.md
```

## Kreator zgłoszenia reklamacyjnego (Wizard) — jak przetestować

1. Otwórz `client-new-case.html` (albo kliknij „Nie masz jeszcze zgłoszenia?
   Zgłoś nową reklamację” na `client-login.html`).
2. **Ścieżka „przez sklep”** — pełne 8 kroków: sposób zgłoszenia → ważne
   informacje → dane klienta → adres → informacje o zakupie → opis usterki
   → załączniki → podsumowanie i zgody.
3. **Test auto-uzupełniania zamówienia:** w kroku „Informacje o zakupie”
   wpisz numer `ZAM/2026/10021` (lub `ZAM/2026/10088`, `ZAM/2026/10134`,
   `ZAM/2026/09950`) — pola produktu uzupełnią się automatycznie. Wpisanie
   innego numeru pokaże komunikat „nie znaleziono” i odblokuje pola ręczne.
4. **Test autosave:** wypełnij kilka kroków, odśwież stronę (F5) —
   formularz wznowi się dokładnie tam, gdzie skończyłeś (dane w
   `localStorage`, klucz `smartrma_wizard_draft_v1`). Podglądy wgranych
   zdjęć nie przetrwają odświeżenia (świadome ograniczenie — patrz
   komentarz w `client-new-case.js`), ale nazwy/rozmiary plików tak.
5. **Test walidacji:** spróbuj przejść dalej bez wypełnienia pól —
   pojawi się lista brakujących elementów, procent kompletności w
   nagłówku aktualizuje się na bieżąco.
6. **Ścieżka „bezpośrednio do producenta”** — wybierz tę kartę w kroku 1.
   Kreator **nie** pokazuje pełnych 8 kroków — od razu przechodzi do
   jednego, krótkiego kroku: wybór producenta → jego dane kontaktowe i
   instrukcja krok po kroku (z pól `Manufacturer.complaintProcedure` /
   `requiredDocumentsNote` / `requiredPhotosNote`, bez nowych pól
   schematu). Zaznacz/odznacz „Poinformuj sklep” i zobacz różnicę:
   - **odznaczone** — po kliknięciu kreator kończy od razu prostym ekranem
     z podziękowaniem; w systemie **nie powstaje żadna sprawa**;
   - **zaznaczone** — pojawiają się dodatkowe pola kontaktowe, a po
     wysłaniu powstaje minimalna sprawa ze znacznikiem „Monitorowana”
     (widoczna w `cases.html`, filtr „Monitorowane”, oraz na liście
     u pracownika) — bez opisu usterki/zdjęć, bo produkt idzie
     bezpośrednio do producenta, sklep tylko obserwuje.
7. Po wysłaniu formularza (ścieżka „przez sklep” lub „bezpośrednio”
   z zaznaczonym „Poinformuj sklep”) trafisz na ekran sukcesu z numerem
   RMA i kodem dostępu — przycisk „Przejdź do statusu zgłoszenia” loguje
   bezpośrednio do `client-portal.html` (sesja tworzona automatycznie, bez
   ponownego wpisywania kodu — logiczne, bo to ten sam klient w tej samej
   sesji przeglądarki).


## Portal Klienta — funkcjonalność (stan finalny MVP prototypu)

- **Logowanie**: numer reklamacji + kod dostępu, ALBO bezpieczny jednorazowy
  link z tokenem (generowany przez pracownika w `case-detail.html`).
  Blokada po 5 błędnych próbach.
- **Status**: uproszczony 5-etapowy stepper (Zgłoszona → Przyjęta → W trakcie
  → Decyzja → Zakończona) + procentowy pasek postępu + szczegółowy,
  jednozdaniowy opis aktualnego statusu wewnętrznego w języku klienta.
- **Historia**: tylko zdarzenia oznaczone jako widoczne dla klienta,
  pogrupowane wg daty (Dzisiaj / Wczoraj / data), z ikonografią zdarzeń.
- **Dokumenty**: pełna lista (nazwa, typ, rozmiar, data dodania, pobierz) —
  architektura gotowa pod przyszły podgląd PDF/zdjęć (patrz `getDocumentPreviewInfo()`
  w `app.js`), sam podgląd jeszcze niezaimplementowany.
- **Kontakt**: dane opiekuna sprawy, dane sklepu, formularz wiadomości z
  trwałym potwierdzeniem po wysłaniu (mock — brak realnej wysyłki).
- **Dostępność**: prawdziwe `<button>` zamiast klikalnych `<div>`, ARIA
  tabs, `aria-live` na komunikatach, Escape zamyka modale.
- **Architektura pod backend**: wszystkie miejsca wymagające realnej
  implementacji serwerowej są nazwane i oznaczone komentarzem
  „BACKEND TODO" (`validateToken()`, `verifyAccessCode()`,
  `checkLoginAttempts()`, `generateSecureToken()`, wysyłka formularza
  kontaktowego).
- **Architektura pod i18n**: cały tekst widoczny dla klienta (statusy,
  komunikaty, błędy, przyciski) pochodzi z jednego słownika
  (`js/client-labels.js`, funkcja `t()`) — dodanie kolejnego języka nie
  wymaga przeszukiwania kodu.

### Świadomie NIE zaimplementowane (poza zakresem MVP prototypu)
- Realny backend (hashowanie kodów/tokenów, HTTPS, wysyłka e-mail/SMS).
- Podgląd dokumentów w przeglądarce (tylko pobieranie / mock).
- Realna wielojęzyczność (przełącznik języka, drugi słownik tekstów).
- Status wewnętrzny odpowiadający scenariuszowi „oczekiwanie na klienta"
  (np. prośba o uzupełnienie danych) — **nie istnieje w obecnym enumie
  `CaseStatus`**, tylko jako typ powiadomienia (BR-060). To realna luka w
  modelu domenowym, opisana w `docs/DECISIONS.md`, do rozstrzygnięcia przed
  powrotem do implementacji backendu.

## Jak przetestować (zaktualizowane)

1. Otwórz `client-login.html` (albo kliknij placeholder „QR” na `case-print.html`).
2. Zaloguj się przykładową sprawą: numer **RMA/2026/0001**, kod **RM4-8821**.
   Portal jest włączony dla **wszystkich 12 spraw demo** — pełne pokrycie
   scenariuszy: zakończona, odrzucona, anulowana, oczekiwanie na producenta,
   zwrot środków (zrealizowany), wymiana produktu, naprawa. Pełną listę
   kodów znajdziesz w `js/data.js` (pole `clientAccessCode`).
3. **Test responsywności**: sprawa `RMA/2026/0007` (klient „Aleksandra-Weronika
   Świętosławska-Wojciechowska-Kowalczyk") ma celowo bardzo długie dane
   (nazwisko, e-mail, adres, nazwa dokumentu) — dobry przypadek do
   sprawdzenia zawijania tekstu na wąskich ekranach.
4. Po 5 błędnych próbach logowanie zostaje zablokowane — link „Zresetuj licznik
   prób (demo)” pozwala wrócić do testów bez czekania.
5. **Bezpieczny link (bez wpisywania kodu):** w `case-detail.html`, w panelu
   „Portal klienta”, kliknij „Wygeneruj bezpieczny link (jednorazowy)” →
   skopiuj link → otwórz w nowej karcie. Logowanie nastąpi automatycznie.
   Link jest jednorazowy — drugie użycie zostanie odrzucone.
6. Po stronie pracownika (`case-detail.html`) w panelu „Portal klienta” można
   włączyć/wyłączyć dostęp i wygenerować nowy kod dla dowolnej sprawy.

Portal Klienta współdzieli z panelem pracownika: `data.js` (model danych),
`client-labels.js` + `public-status-mapper.js` (teksty i mapowanie statusów
— ładowane też przez strony pracownika, bo `app.js` z nich korzysta),
`app.js` (toasty, modale, komponent karty dokumentu) i `css/styles.css`.
Nie ładuje jedynie funkcji specyficznych dla powłoki pracownika
(`initShell`, `renderSidebar` — RBAC ról wewnętrznych nie dotyczy klienta
detalicznego).

## Trwałość danych i rozwiązywanie problemów

Dane (sprawy, klienci, producenci, użytkownicy) są zapisywane w
`localStorage` przeglądarki — zmiany przetrwają nawigację i odświeżenie
strony. Jeśli w interfejsie pojawi się **żółty baner** „Zmiany nie będą
zapisywane trwale w tym oknie" — najczęstsza przyczyna to otwieranie plików
bezpośrednio (`file://`) zamiast przez lokalny serwer opisany wyżej, albo
tryb prywatny przeglądarki blokujący `localStorage`. Uruchom prototyp przez
`python3 -m http.server` (lub `npx serve`), żeby to naprawić.

Żeby wrócić do danych początkowych, użyj „Resetuj dane demo” w panelu
bocznym.

Każdy ekran to osobny plik `.html` z własnym plikiem `.js` — celowo, żeby
ułatwić późniejsze przeniesienie 1:1 do komponentów React (`DashboardPage`,
`CasesListPage`, `NewCasePage`, `CaseDetailPage`, `ManufacturersPage`,
`UsersPage`) bez przepisywania struktury od zera.

## Kierunek wizualny

- **Krój pisma:** Space Grotesk (nagłówki) + Inter (treść) + JetBrains Mono
  (numery spraw, numery seryjne — dane techniczne).
- **Kolor marki:** głęboka zieleń/teal (`#0F6E63`), neutralna chłodna baza,
  kolor = status (niebieski/bursztynowy/zielony/czerwony/szary).
- **Wzorzec:** klasyczna powłoka SaaS (sidebar + topbar + treść), zgodna
  z konwencją Linear/Stripe/Notion.
- **Sygnatura:** panel „Next Action” (zielone tło, wyróżniony nagłówek) —
  bezpośrednie odwzorowanie filozofii produktu z `GLOSSARY.md`: dashboard ma
  pokazywać przede wszystkim **co wymaga działania**, nie pełną listę spraw.

## Zakres i świadome uproszczenia

- Dane (sprawy, klienci, producenci, użytkownicy) są zapisywane w
  `localStorage` przeglądarki — **zmiany przetrwają nawigację i odświeżenie
  strony**. Żeby wrócić do danych początkowych, użyj „Resetuj dane demo” w
  panelu bocznym (czyści `localStorage` i przeładowuje dane z seeda).
  Dane są per-przeglądarka — nie są nigdzie synchronizowane ani współdzielone.
- „Zmień status” pozwala ustawić dowolny status z pełnej listy (nie tylko
  kolejny w procesie) — świadome ułatwienie do szybkiego testowania
  scenariuszy w prototypie; docelowa walidacja przejść między statusami
  (dwie ścieżki: Gwarancja / Rękojmia) będzie egzekwowana dopiero w
  backendzie.
- Zakładki „Dokumenty”, „Zadania”, „Komentarze” na ekranie szczegółów sprawy
  pokazują świadome stany puste z opisem, kiedy zostaną wdrożone — te moduły
  nie były w zakresie tego kroku.
- „Drukuj potwierdzenie” otwiera realny widok wydruku z dwoma egzemplarzami
  (`case-print.html`) i generuje PDF przez natywną funkcję „Drukuj” /
  „Zapisz jako PDF” przeglądarki. Kod QR na potwierdzeniu to zaprojektowany
  placeholder — realna generacja (link do portalu klienta) to przyszły etap.
- „Wyślij e-mail” pozostaje klikalny, ale pokazuje komunikat informacyjny —
  moduł e-mail jest poza zakresem tego kroku.
- Logika zmiany statusu (`js/case-detail.js`) odzwierciedla dwie ścieżki
  procesu (Gwarancja / Rękojmia) ustalone w `docs/DECISIONS.md`, ale jest to
  uproszczona wersja demonstracyjna — docelowa walidacja przejść między
  statusami będzie żyła w `case-status.rules.ts` po stronie backendu.

## Panel administracyjny — jak przetestować (pracownicy, producenci, marki)

1. Zaloguj się jako **Administrator** (przełącznik roli w panelu bocznym),
   otwórz `users.html`.
2. **CRUD pracowników:** kliknij „Dodaj użytkownika" — wybierz jedną z 5
   ról (Administrator/Kierownik/Pracownik/Serwis/Odczyt) i oddział.
   Kliknij istniejącego użytkownika, żeby edytować, usunąć lub zresetować
   hasło (mock — wygenerowane hasło tymczasowe wyświetli się w oknie).
   Przycisk „Historia" przy każdym wierszu pokazuje logowania i realną
   aktywność (liczoną z historii spraw tego pracownika).
3. **Rola Odczyt:** przełącz się na rolę „Odczyt — Beata Obserwator" w
   panelu bocznym i przejdź po ekranach — przyciski zapisu (Nowa
   reklamacja, Zmień status, Dodaj producenta, itd.) znikają, podgląd
   pozostaje pełny.
4. Otwórz `manufacturers.html` (jako Kierownik lub Administrator) —
   kliknij producenta, żeby zobaczyć rozbudowany formularz: dane firmowe,
   sposób zgłoszenia (wybierz „Portal B2B", żeby zobaczyć warunkowe pola
   loginu/hasła), procedurę reklamacyjną, logistykę, automatyzację i
   marki. Spróbuj dodać nową markę w polu na dole formularza.
5. **Auto-rozpoznawanie producenta po marce:** w `case-new.html`
   (rejestracja pracownicza) lub w kroku „Informacje o zakupie" kreatora
   klienta (`client-new-case.html`, ścieżka „przez sklep") wpisz w polu
   „Marka" np. `Cybex` — pole „Producent" ustawi się automatycznie na
   KidsTech S.A.
6. **„Poproś o uzupełnienie danych":** w `case-detail.html` kliknij ten
   przycisk w nagłówku sprawy — wybierz szybki chip lub wpisz własną
   treść, wyślij. Wpis pojawi się w historii sprawy (widok pracownika) i
   w Portalu Klienta (`client-portal.html`, zakładka Historia) z pełną
   treścią prośby — bez tworzenia nowej reklamacji.
