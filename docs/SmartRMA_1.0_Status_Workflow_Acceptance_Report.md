# SmartRMA 1.0 – Status Workflow Acceptance Report

Data: 2026-08-11
Zakres: przebudowa systemu statusów reklamacji z 15-wartościowego enuma i sztywnej maszyny stanów na prosty, w pełni konfigurowalny per-firma katalog 9 statusów, w którym pracownik może wybrać dowolny aktywny status w dowolnym momencie.

Ten raport nie kończy się stwierdzeniem „funkcja działa” — każda sekcja podaje konkretny wykonany scenariusz i jego wynik, zgodnie z wymaganiem właściciela.

---

## 1. Finalne statusy

Dokładnie 9 statusów, zgodnie z wymaganiem (§2), zasiane per firma i w pełni edytowalne przez administratora:

| # | Kod | Etykieta | Końcowy | Wymaga potwierdzenia |
|---|---|---|---|---|
| 1 | `Nowa` | Nowa | Nie | Nie |
| 2 | `Przyjeta` | Przyjęta | Nie | Nie |
| 3 | `PrzekazanaDoProducenta` | Przekazana do producenta / dystrybutora | Nie | Nie |
| 4 | `DecyzjaPozytywna` | Decyzja pozytywna – oczekujemy na realizację | Nie | Nie |
| 5 | `TowarWyslanyDoSerwisu` | Towar wysłany do serwisu | Nie | Nie |
| 6 | `TowarWrocilZSerwisu` | Towar wrócił z serwisu – oczekuje na odbiór | Nie | Nie |
| 7 | `DecyzjaNegatywna` | Decyzja negatywna | Nie | Tak |
| 8 | `Zakonczona` | Zakończona | **Tak** | Tak |
| 9 | `ReklamacjaPonownie` | Reklamacja zgłoszona ponownie | Nie | Tak |

Statusy techniczne (telefon, wysyłka wiadomości, oczekiwanie na kuriera, przygotowanie paczki) świadomie NIE są osobnymi statusami — żyją w historii/wiadomościach/notatkach sprawy (§1).

## 2. Zmiany wprowadzone (filozofia)

- Pracownik może wybrać **dowolny aktywny status w dowolnym momencie** — brak tabeli przejść, brak blokad typu „nielegalne przejście" (dawny `CASE-001` wycofany z użycia).
- Wybór **tego samego** statusu = brak operacji, z komunikatem „Reklamacja już posiada ten status.” (§5).
- **Ostrzeżenie** (nieblokujące) dla przejść nietypowych — cofnięcie w procesie lub przeskoczenie więcej niż jednego etapu naraz (§4).
- **Twarde potwierdzenie** (osobny krok) dla 3 statusów oznaczonych `requiresConfirmation`: Zakończona, Decyzja negatywna, Reklamacja zgłoszona ponownie (§6).
- Decyzja producenta/dystrybutora to teraz dane strukturalne: kontrahent, uzasadnienie, sposób realizacji, pełna odpowiedź producenta — nie tylko wynik (§8).
- Statusy nigdy nie są fizycznie usuwane — wyłącznie dezaktywowane, zablokowane jeśli używane przez aktywną sprawę (§10).
- Statusy są przypisane per firma (multi-tenant) — jedna firma nigdy nie widzi ani nie modyfikuje statusów innej (§11).

## 3. Zmiany w bazie danych

- Nowy model `CaseStatusDefinition` (per firma: `code`, `label`, `description`, `order`, `active`, `isFinal`, `isDefaultForNew`, `requiresConfirmation`, `requiredCheck`, `portalStage`, `defaultNextAction`, `notifyCustomerTemplateCode`, `isSystem`), `@@unique([companyId, code])`.
- `Case.status`: `CaseStatus` (enum) → `String` — celowo NIE stał się kluczem obcym, żeby `CaseHistory.previousValue/newValue` pozostały niezmienną migawką (zmiana etykiety statusu przez admina nie przepisuje wstecznie historii).
- Nowe pola decyzji na `Case`: `decisionContractorId`, `decisionIsPositive`, `decisionJustification`, `decisionFulfillmentMethod`, `decisionManufacturerResponse`.
- Migracja w 3 fazach (addytywna → backfill danych → destrukcyjna), zweryfikowana na ~34 istniejących sprawach — zero utraty danych, w tym odzyskanie 3 spraw z rzeczywistego poprzedniego statusu zapisanego w historii przed usunięciem starego mechanizmu `OczekiwanieNaKlienta`.
- `npx prisma migrate status` → „Database schema is up to date!” (zweryfikowane ponownie na końcu zadania).

## 4. Zmiany w API

- Nowy moduł `case-statuses` (`GET/POST/PATCH /case-statuses`, `POST /case-statuses/reorder`) — brak `DELETE` (wzorzec katalogowy, jak `Manufacturer`).
- Nowe uprawnienia `caseStatuses.view` (wszystkie role) / `caseStatuses.manage` (wyłącznie Administrator).
- `PUT /cases/:id/status` przyjmuje dowolny string kodu statusu (zamiast enuma) — walidacja istnienia/aktywności w serwisie (`CASE-016`).
- `PUT /cases/:id/decision` przyjmuje dodatkowe, opcjonalne pola strukturalne.
- Usunięty moduł `workflow` (`GET /workflow/case-status/transitions`) — nie ma już tabeli przejść do odpytania.
- Nowe kody błędów: `CASE-015` (dezaktywacja zablokowana), `CASE-016` (nieznany/nieaktywny status), `CASE-017` (archiwizacja wymaga statusu końcowego). `CASE-001` pozostawiony w katalogu jako martwy (nie renumerowany), na wypadek zewnętrznych odwołań.

## 5. Zmiany w UI (pracownik)

- Modal „Zmień status reklamacji” — pełna lista aktywnych statusów (w tym bieżący, oznaczony „(bieżący)”), bez rekomendacji ⭐ opartej na tabeli przejść.
- Banner ostrzeżenia (kolor bursztynowy) dla przejść nietypowych — widoczny od razu po wyborze, niezależnie od zapisu.
- Twarde potwierdzenie (`window.confirm`) dla statusów `requiresConfirmation`, z komunikatem zgodnym z przykładem właściciela dla „Zakończona”.
- Przycisk „Zmień status” NIE jest już blokowany dla spraw w statusie końcowym (pozostałe akcje — tak) — pracownik może wyprowadzić sprawę ze stanu „Zakończona”.
- Modal decyzji rozszerzony o pola strukturalne (kontrahent z listy, uzasadnienie, sposób realizacji — ukryty dla „Odrzucenie”, pełna odpowiedź producenta).
- Nowa zakładka **Ustawienia → Statusy reklamacji**: pełny CRUD + reorder (strzałki ▲▼) + aktywacja/dezaktywacja, bez przycisku „Usuń”.
- `apps/web/src/api/workflow.api.ts` usunięty (endpoint przestał istnieć).

## 6. Zmiany w Raportach

- `CLOSED_STATUSES`/`STATUS_LABELS` (dawniej hardcodowane) → wyliczane per firma z katalogu (`isFinal`, `label`) wewnątrz `getOverview`.
- Naprawiona niespójność: `findClosedCases` filtrował dawniej WYŁĄCZNIE `Zamknieta`, pomijając `Anulowana`/`Zarchiwizowana` — teraz jedno źródło prawdy (`closedStatusCodes`).
- `findResponseTimeline` (czas odpowiedzi producenta, SLA) — hardcodowane `WyslanaDoProducenta` → `PrzekazanaDoProducenta`.
- Zweryfikowane na żywych danych (sekcja 14) — liczby spójne z Dashboardem.

## 7. Zmiany w Dashboardzie

- Kafelek „Oczekiwanie na klienta” **usunięty** (decyzja właściciela — status bez odpowiednika w nowym katalogu).
- „Gotowe do odbioru” przełączone z `GotowaDoOdbioru` na `TowarWrocilZSerwisu`.
- Zbiór statusów „aktywnych” do liczników (otwarte/przeterminowane/moje sprawy) wyliczany dynamicznie z katalogu (`isFinal=false`), nie z 3 hardcodowanych nazw enuma.

## 8. Zmiany w Portalu Klienta

- `STAGE_BY_STATUS` (hardcodowany `Record<CaseStatus, PortalStage>`) → pole `portalStage` na wierszu statusu, odczytywane per sprawa.
- Baner „Anulowana”/„Zarchiwizowana” (statusy specjalne, których nowy katalog już nie ma) liczony teraz z `Case.cancelledAt`/`archivedAt`, nie z osobnego statusu.
- Kontrakt API (`PortalCaseViewEntity`) bez zmian — `ClientPortalPage.tsx` nie wymagał zmian.
- Klient **nigdy** nie widzi surowych nazw wewnętrznych statusów — wyłącznie uproszczony, 5-etapowy pasek postępu.

## 9. Testy administratora (na żywo, jako `admin@smartrma.local`)

- **Utworzenie statusu** „Oczekujemy na części” → pojawił się na liście z `order=10`, `active=true`. **Wynik: OK.**
- **Próba dezaktywacji statusu używanego przez aktywne sprawy** („Nowa”, używana przez 19 spraw) → zablokowana, toast: *„Status jest używany w aktywnej sprawie i nie może zostać dezaktywowany. (19 spraw).”*, status pozostał aktywny. **Wynik: OK — blokada zadziałała.**
- **Dezaktywacja nieużywanego statusu** („Oczekujemy na części”) → sukces, status oznaczony „Nieaktywny”, przycisk zmienił się na „Aktywuj”. **Wynik: OK.**
- **Weryfikacja zniknięcia z modala zmiany statusu** — otwarto modal „Zmień status” na żywej sprawie: opcja „Oczekujemy na części” nieobecna na liście 9 aktywnych statusów. **Wynik: OK.**

## 10. Testy pracownika (na żywo)

### Scenariusz główny (happy path) — sprawa RMA/2026/00021, jako `admin@smartrma.local` + `kierownik.uat@smartrma.local`

Wykonano kolejno: `Nowa → Przyjęta → Przekazana do producenta / dystrybutora → [ustawiono decyzję „Naprawa” z kontrahentem Britax Romer i uzasadnieniem] → Decyzja pozytywna – oczekujemy na realizację → Towar wysłany do serwisu → Towar wrócił z serwisu – oczekuje na odbiór → Zakończona`.
**Wynik: OK** — każde przejście zapisane w historii z poprawną etykietą, `closedAt` ustawione po zamknięciu, e-mail-checkbox pojawiał się wyłącznie dla statusów z `notifyCustomerTemplateCode` (Przekazana do producenta).

### Scenariusz decyzji negatywnej — sprawa RMA/2026/00019

Wykonano: `Nowa → Przyjęta → Przekazana do producenta / dystrybutora → [ustawiono decyzję „Odrzucenie” z uzasadnieniem, pole „sposób realizacji” poprawnie ukryte dla odrzucenia] → Decyzja negatywna [twarde potwierdzenie] → Zakończona [twarde potwierdzenie] → Reklamacja zgłoszona ponownie [twarde potwierdzenie, sprawa POZOSTAJE tą samą sprawą — nie tworzy nowej]`.
**Wynik: OK.**

### CASE-002 (kompletność dokumentacji)

Test z producentem wymagającym `minPhotos=2`+`requiresVideo=true`, bez załączników → próba `Przekazana do producenta` zablokowana kodem `CASE-002` (weryfikowane też jednostkowo, patrz sekcja 13). **Wynik: OK.**

### CASE-009 (decyzja wymagana)

Próba przejścia w „Decyzja pozytywna” BEZ wcześniej ustawionej decyzji → zablokowana z komunikatem *„Nie można zrealizować decyzji — decyzja nie została jeszcze ustawiona.”*, modal pozostał otwarty. **Wynik: OK.**

## 11. Testy klienta (Portal Klienta)

Wygenerowano jednorazowy bezpieczny link dla RMA/2026/00021 i zalogowano się nim do Portalu. Zaobserwowano:
- Pasek postępu 5-etapowy (Zgłoszona/Przyjęta/W trakcie/Decyzja/Zakończona) — **żadna wewnętrzna nazwa statusu nie wyciekła** do klienta.
- Etap „Zakończona” poprawnie podświetlony po zamknięciu sprawy.
- Decyzja „Naprawa” widoczna.
- Historia sprawy pokazuje uproszczone etykiety akcji, bez surowych kodów statusów.

**Wynik: OK.**

Dodatkowo zweryfikowano **Publiczny Formularz Reklamacyjny** (`POST /intake/complaints`, najbardziej ryzykowny punkt regresji — logika domyślnego statusu z katalogu): utworzono realną sprawę RMA/2026/00035, sprawdzono przez Portal Klienta, że otrzymała `stage="Zgloszona"` (czyli wewnętrzny status `Nowa`, poprawnie wyznaczony z `isDefaultForNew` w katalogu firmy). **Wynik: OK.**

## 12. Testy multi-tenant

Utworzono drugą firmę (UAT Company B) z osobnym kontem administratora.
- Zalogowano się jako `admin.b@smartrma.local` → Dashboard: 0 spraw (żadna z 35 spraw Firmy A niewidoczna). **Wynik: OK.**
- Zakładka Statusy reklamacji → **pusty katalog** (żaden z 10 statusów Firmy A nie wyciekł). **Wynik: OK.**
- Utworzono status „Status Firmy B” → widoczny wyłącznie w katalogu Firmy B (1 wiersz). **Wynik: OK.**

## 13. Testy bezpieczeństwa / IDOR

Wykonane z sesji `admin.b@smartrma.local` (Firma B), bezpośrednio przez `fetch()` do API, z pominięciem UI:

| Atak | Endpoint | Wynik |
|---|---|---|
| Odczyt cudzego statusu | `GET /case-statuses/:idFirmyA` | **404** |
| Dezaktywacja cudzego statusu | `PATCH /case-statuses/:idFirmyA` `{active:false}` | **404** |
| Zmiana statusu cudzej sprawy | `PUT /cases/:idFirmyA/status` | **404 (CASE-012)** |
| Odczyt cudzej sprawy | `GET /cases/:idFirmyA` | **404 (CASE-012)** |

Wszystkie 4 próby zwróciły `404` (nie `403`) — spójne z konwencją `findFirst({id, companyId})` całego repozytorium: atakujący nie dowiaduje się nawet, czy zasób istnieje. **Wynik: OK — brak wycieku, brak możliwości mutacji.**

Dodatkowo: `CreateCaseStatusDto`/`UpdateCaseStatusDto` nie przyjmują pola `companyId` z body (zawsze z JWT) — strukturalnie niemożliwe utworzenie/przejęcie statusu innej firmy przez manipulację żądaniem.

## 14. Testy regresyjne

- Backend: `npx tsc --noEmit` → **czysto**.
- Backend: `npx jest` → **319/319 testów przeszło** (38 zestawów), w tym nowy test regresyjny dla błędu znalezionego w sekcji 15.
- Backend: `npm run build` (`nest build`) → **czysto**.
- `npx prisma migrate status` → **„Database schema is up to date!”**.
- Frontend: `npx tsc --noEmit` → **czysto**.
- Frontend: `npm run build` (`vite build`) → **czysto**.
- Frontend: `npm run lint` → **0 błędów** (2 istniejące wcześniej ostrzeżenia, niezwiązane z tym zadaniem).
- RBAC: `caseStatuses.view` potwierdzone w bazie dla wszystkich 5 ról; `caseStatuses.manage` wyłącznie dla Administratora — zgodnie z macierzą w `RBAC.md`.

## 15. Znalezione błędy i zastosowane poprawki

### Błąd #1 (znaleziony podczas testu na żywo, sekcja 10) — martwe znaczniki czasu po reaktywacji sprawy

**Scenariusz:** `Zakończona → Przyjęta` (reaktywacja zamkniętej sprawy, wymagany scenariusz z wymagań właściciela).
**Objaw:** karta sprawy nadal pokazywała „Zamknięto: [data]” mimo że sprawa była już aktywna (`status=Przyjeta`) — `closedAt` z poprzedniego zamknięcia nie było czyszczone przy przejściu do statusu niekońcowego. Ten sam problem dotyczyłby `cancelledAt`/`archivedAt` (baner „Anulowana”/„Zarchiwizowana” pozostałby widoczny na reaktywowanej sprawie).
**Przyczyna:** `CasesService.performTransition` ustawiał `closedAt` WYŁĄCZNIE przy przejściu DO statusu końcowego, nigdy go nie czyścił przy przejściu OD statusu końcowego.
**Poprawka:** `apps/api/src/modules/cases/cases.service.ts` — przejście do statusu niekońcowego czyści teraz `closedAt`, `cancelledAt` i `archivedAt` jednym wywołaniem.
**Retest:** wykonano ponownie identyczny scenariusz (zamknięcie → reaktywacja) na żywej sprawie RMA/2026/00021 po wdrożeniu poprawki — pole „Zamknięto” poprawnie zniknęło z karty sprawy. **Wynik: OK.**
**Regresja:** dodano dedykowany test jednostkowy (`cases.service.spec.ts`) odtwarzający dokładnie ten scenariusz; pełny zestaw testów (`319/319`) uruchomiony ponownie po poprawce — bez nowych awarii w żadnym innym module (Reports/Dashboard/Notifications/Portal/Users korzystają z tych samych pól, ale żaden nie zakładał, że `closedAt` jest ustawione tylko raz).

### Znalezisko #2 (nie błąd, luka w konfiguracji seeda) — brak `caseStatuses.view` dla ról innych niż Administrator

**Scenariusz:** przegląd `prisma/seed.ts` przed testem RBAC (sekcja 14).
**Objaw:** macierz uprawnień w seedzie (`ROLE_PERMISSIONS`) nie zawierała `caseStatuses.view` dla Kierownika/Pracownika/Serwisu/Odczytu — mimo że `RBAC.md` (zaktualizowane w Checkpoincie 2) jawnie wymaga ✅ dla wszystkich 5 ról. Bez tej poprawki każdy pracownik poza Administratorem widziałby PUSTY katalog statusów (hook `useCaseStatuses` jest bramkowany tym uprawnieniem) — modal zmiany statusu byłby dla nich całkowicie pusty.
**Poprawka:** dodano `PERMISSIONS.CASE_STATUSES_VIEW` do list uprawnień Kierownika, Pracownika, Serwisu i Odczytu w `prisma/seed.ts`; ponownie uruchomiono seed na bazie deweloperskiej.
**Weryfikacja:** zapytanie do bazy potwierdziło `caseStatuses.view` przy wszystkich 5 rolach, `caseStatuses.manage` wyłącznie przy Administratorze — dokładnie zgodnie z macierzą `RBAC.md`. Zalogowano się jako `kierownik.uat@smartrma.local` i potwierdzono, że modal zmiany statusu oraz przycisk „Ustaw decyzję” działają poprawnie. **Wynik: OK.**

Żadnych innych błędów nie znaleziono podczas tego zaangażowania.

## 16. Zastosowane poprawki (podsumowanie)

1. `cases.service.ts` — czyszczenie `closedAt`/`cancelledAt`/`archivedAt` przy reaktywacji sprawy (Błąd #1).
2. `prisma/seed.ts` — dodanie `caseStatuses.view` do ról Kierownik/Pracownik/Serwis/Odczyt + ponowne uruchomienie seeda na żywej bazie (Znalezisko #2).
3. `cases.service.spec.ts` — nowy test regresyjny blokujący powrót Błędu #1.

## 17. Wynik ponownego testu

Po zastosowaniu obu poprawek:
- Scenariusz reaktywacji sprawy (Zakończona → Przyjęta) wykonany ponownie na żywo — **OK, brak martwych znaczników czasu**.
- Pełna macierz RBAC zweryfikowana w bazie i na żywo jako Kierownik — **OK**.
- Pełny zestaw testów backendu uruchomiony ponownie po obu poprawkach — **319/319 OK**, `tsc`/`build` obu aplikacji czyste.
- Żadna z pozostałych sekcji tego raportu (Dashboard, Reporty, Portal Klienta, multi-tenant, bezpieczeństwo) nie wykazała regresji po wprowadzeniu poprawek — retest wykonany na tych samych żywych danych po obu zmianach.

**Status końcowy zadania: zaakceptowane do wdrożenia testowego, z zastrzeżeniem że — zgodnie z wymaganiem właściciela (§24) — ostateczna akceptacja wymaga osobistego przejścia przez interfejs przez właściciela.**
