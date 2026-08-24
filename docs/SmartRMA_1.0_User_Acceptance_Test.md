# SmartRMA 1.0 – User Acceptance Test

**Data:** 09.08.2026
**Zakres:** Wyłącznie UI (przeglądarka) — bez wywołań API z pominięciem interfejsu, bez podglądu bazy poza diagnozą PO znalezieniu problemu (zgodnie z metodologią "pracownik najpierw").
**Środowisko:** `localhost` (dev), backend NestJS + Postgres, e-mail przez Resend (produkcyjny dostawca skonfigurowany dla tej firmy — patrz uwaga w Sekcji "Środowisko testowe").

---

## 1. Wynik końcowy

**SmartRMA 1.0 NIE JEST jeszcze w pełni gotowe wg kryterium właściciela** ("pracownik może przeprowadzić reklamację od początku do końca wyłącznie przez UI, bez zgadywania, bez obchodzenia systemu, bez klikania w przyciski prowadzące do niepotrzebnych błędów").

Powód: w trakcie testu znaleziono **7 realnych problemów** UI/backend. **6 z nich zostało naprawionych i zweryfikowanych** (testy jednostkowe + `tsc --noEmit` + retest na żywo w przeglądarce, tam gdzie to było możliwe). **1 problem jest strukturalny** (wymaga zmiany modelu danych i kilku warstw) i został **świadomie odłożony do backlogu 2.0** zgodnie z Sekcją 14 wytycznych — nie został wdrożony w trakcie tego przebiegu.

Zgodnie z wymogiem Sekcji 15: **poprawki zostały wprowadzone, ale PEŁNY ponowny przebieg całego scenariusza od zera (od utworzenia nowej sprawy do jej zamknięcia, dla wszystkich ról) NIE został jeszcze w całości powtórzony w tej sesji** — większość poprawionych elementów została zweryfikowana ponownie na żywo (patrz tabela niżej, kolumna "Retest"), ale jedna poprawka (Next Action po decyzji) była zweryfikowana wyłącznie testami jednostkowymi, ponieważ sprawa użyta do jej wykrycia osiągnęła stan, w którym nie dało się jej ponownie użyć do tego konkretnego testu (przycisk "Ustaw decyzję" znika po ustawieniu decyzji — zamierzone zachowanie). **Rekomendacja: przed uznaniem 1.0 za gotowe do wydania, wykonać jeden dodatkowy, czysty przebieg pełnego scenariusza (Sekcja 4) na nowej sprawie, obejmujący ponowne ustawienie decyzji Kierownika/Producenta, żeby zamknąć tę jedną lukę weryfikacyjną.**

Nie kończę tego raportu liczbą "X testów przechodzi" — poniżej pełna narracja dowodowa i tabela.

---

## 2. Środowisko testowe — ważna uwaga

Firma testowa ma skonfigurowany **Resend** (produkcyjny dostawca e-mail) w Ustawienia → E-mail, a nie lokalny Mailpit. Testowi klienci mają adresy `@example.com` (nierealna, zablokowana przez Resend domena testowa). Efekt: e-maile do klientów w tej sesji kończyły się `Notification.status=Failed` z komunikatem Resend `"Invalid to field... use our testing email address"`. **To jest artefakt danych testowych, nie błąd produktu** — mechanizm sam w sobie zadziałał poprawnie (utworzył powiadomienie, próbował wysłać, poprawnie oznaczył niepowodzenie z czytelnym powodem, zatrzymał się po limicie 5 prób). Portal-access e-mail i e-mail z prośbą o uzupełnienie danych zostały zweryfikowane pod kątem TREŚCI (poprawna, kompletna, PL) przez bezpośredni odczyt wiersza `Notification` w bazie — nie przez realny odbiór w skrzynce.

---

## 3. Test matrix (Sekcja 13)

| Moduł | Scenariusz | Rola | Wynik | Problem | Poprawka | Retest |
|---|---|---|---|---|---|---|
| Maszyna stanów | Rękojmia: Nowa→Przyjęta→Weryfikacja→Weryfikacja wewnętrzna→Oczekiwanie na decyzję Kierownika→Realizacja decyzji→Gotowa do odbioru→Zamknięta→Zarchiwizowana (RMA/2026/00032) | Kierownik | OK | — | — | — |
| Maszyna stanów | Gwarancja: Nowa→...→Wysłana do producenta→Oczekiwanie na decyzję producenta (RMA/2026/00033) | Administrator | OK | — | — | — |
| Status — pełna lista | Modal "Zmień status" zawsze pokazuje WSZYSTKIE statusy, ⭐ tylko jako podpowiedź | Kierownik/Administrator | OK | — | — | — |
| Status — nielegalne przejście | "Oczekiwanie na klienta"→"Weryfikacja" i →"Oczekiwanie na decyzję producenta" ręcznie wybrane z pełnej listy | Administrator | OK | Serwer poprawnie zwraca 409 CASE-001, UI pokazuje "Nieprawidłowe przejście statusu.", stan bez zmian | — | — |
| Status — double/triple-click | 3× szybkie kliknięcie "Zapisz status" na nielegalnym przejściu | Administrator | OK | Wszystkie 3 żądania odrzucone 409, ZERO duplikatów w historii | — | — |
| Decyzja | Ustawienie "Zwrot środków" — widoczność opcji per rola | Kierownik | OK | "Zwrot środków" widoczny (Kierownik ma `cases.decision.approve`) | — | — |
| Decyzja | Próba ustawienia "Zwrot środków" bez `cases.decision.approve` | Administrator (nie ma `cases.decision.*`) | OK (poprawnie zablokowane) | Przycisk "Ustaw decyzję" w ogóle się nie renderuje na statusie decyzyjnym | — | — |
| Decyzja → Next Action | Next Action po ustawieniu decyzji na "Oczekiwanie na decyzję Kierownika" | Kierownik | **Znaleziono błąd** | Next Action nadal pokazywał "Kierownik: podejmij decyzję w sprawie" mimo że decyzja była już ustawiona | `case-status.rules.ts` — nowa mapa `NEXT_ACTION_AFTER_DECISION_SET`, `cases.service.ts::setDecision` przelicza `nextAction`, `cases.repository.ts::setDecision` przyjmuje nowy parametr | **Częściowy** — 2 nowe testy jednostkowe zielone (99/99 w module Cases), retest na żywo NIE wykonany (przycisk "Ustaw decyzję" znika po ustawieniu decyzji — case nie nadawał się do powtórki). **Wymaga retestu na nowej sprawie.** |
| Dokumenty | Upload zdjęcia/PDF/wideo (happy path) | Kierownik | OK | — | — | Na żywo, wielokrotnie |
| Dokumenty — CASE-002 | Próba "Weryfikacja→Gotowa do wysyłki" bez wymaganych 2 zdjęć+film (Cybex) | Administrator/Kierownik | OK | Blokada z czytelnym komunikatem "Brak wymaganych dokumentów. Brakuje: zdjęcia (wymagane 2, dołączono 0), film..." | — | Na żywo — po uzupełnieniu ta sama zmiana statusu przeszła |
| Dokumenty — zły format | Upload pliku `.exe` | Kierownik | **Znaleziono błąd** | Komunikat mylący: "Nie udało się zapisać — sprawdź, czy wszystkie wymagane pola są poprawnie wypełnione." (nie ma tu żadnych "pól") | `mime-to-document-type.ts` rzuca teraz `AppException` z kodem `FILE-003` zamiast gołego `UnprocessableEntityException`, które `HttpExceptionFilter` nadpisywał generycznym tekstem | Na żywo — nowy komunikat: "Nieobsługiwany format pliku: application/x-msdownload. Dozwolone: PDF, JPG, PNG, HEIC, MP4." |
| Dokumenty — za duży plik | Upload pliku 51 MB (limit globalny 50 MB) | Kierownik | **Znaleziono błąd** | Surowy angielski komunikat multera: "File too large" | `http-exception.filter.ts` rozpoznaje teraz `PAYLOAD_TOO_LARGE` (413) i podstawia zarejestrowany, ale dotąd niepodłączony kod `FILE-001` | Na żywo — nowy komunikat: "Załącznik przekracza dopuszczalny rozmiar." |
| Dokumenty — otwieranie | "Otwórz" na wgranym dokumencie | Kierownik | OK | — | — | Na żywo — pobranie przez uwierzytelnione żądanie, `blob:` URL |
| Właściciel sprawy | Zmiana właściciela (Kierownik→Pracownik), lista pracowników w pickerze | Kierownik | OK | — | — | Na żywo |
| Właściciel — historia | Wpis w historii po zmianie właściciela | Kierownik | **Znaleziono błąd** | Historia pokazywała gołe UUID-y: "bf648222-...→7595384f-..." zamiast imion | `CaseDetailPage.tsx` — historia dla akcji `OwnerChanged` resolwuje teraz `previousValue`/`newValue` przez `lookups.userById`, nie przez `STATUS_META` | Na żywo — "Maria Kierownik-Test → Katarzyna Nowak-Kowalska" |
| Właściciel — Dashboard | "Moje sprawy" po zmianie właściciela | Kierownik | OK | — | — | Na żywo — licznik spadł do 0 po przekazaniu ostatniej sprawy |
| Prośba o uzupełnienie | Wysłanie prośby (quick-pick chip + wolny tekst), blokada drugiej prośby w trakcie oczekiwania | Kierownik | OK | Status auto-przeszedł na "Oczekiwanie na klienta", przycisk poprawnie `disabled` z tooltipem "Sprawa już oczekuje na odpowiedź klienta." | — | — |
| Prośba o uzupełnienie — treść wiadomości | Treść w zakładce Wiadomości | Kierownik | Drobna usterka (nie naprawiona — kosmetyczna) | Lekko redundantne zdanie: "Prosimy o uzupełnienie: X. Prosimy o przesłanie: X" | — (backlog 2.0 — kosmetyka) | — |
| Prośba o uzupełnienie — e-mail | Treść e-maila do klienta | Kierownik | OK (treść), dostawa zablokowana przez środowisko testowe | — patrz Sekcja 2 | — | — |
| Prośba o uzupełnienie ↔ Uzupełnij (Portal) | Zgodność treści prośby z checklistą "Uzupełnij" po stronie klienta | Kierownik→Klient | **Znaleziono problem strukturalny** | Portal pokazywał "Zgłoszenie jest kompletne" mimo aktywnej, świeżo wysłanej prośby o "dodatkowe zdjęcia usterki" — `resumeIfComplete`/`getCompleteness` sprawdzają WYŁĄCZNIE stałe wymagania producenta (serial/rama/dowód/min. zdjęć/wideo), nie treść wolnotekstowej prośby | **BACKLOG 2.0** — wymaga: nowego pola/tabeli trwale przechowującej `requestedItems`, rozszerzenia `computeCompleteness` o te pozycje, UI po stronie klienta do ich odhaczania. Zbyt duży zakres na bugfix w trakcie UAT (Sekcja 14) | — |
| Dokumenty ↔ Portal Klienta | Widoczność dokumentów wgranych przez pracownika w zakładce "Dokumenty" Portalu | Kierownik→Klient | **Znaleziono błąd** | Portal pokazywał "Brak załączników w tej sprawie." mimo 5 wgranych dokumentów — `documentsApi.upload()` nigdy nie wysyłał `visibility`, więc KAŻDY dokument pracownika lądował jako `Internal` (domyślne w schemacie), bez żadnej ścieżki UI do zmiany na `Public` | Nowy checkbox "Udostępnij od razu klientowi w Portalu" przy uploadzie w `CaseDetailPage.tsx`, przekazywany do `documentsApi.upload(..., visibility)`; lista dokumentów pracownika pokazuje teraz "· widoczny dla klienta" | Na żywo, end-to-end — nowy dokument z zaznaczonym checkboxem pojawił się w Portalu, pozostałe 5 (bez zaznaczenia) poprawnie NIE są widoczne |
| Anulowanie sprawy | "Anuluj sprawę" bez podania powodu → z powodem | Kierownik | OK | Przycisk potwierdzenia poprawnie `disabled` do wpisania powodu (fail-safe na poziomie UI, nie serwera) | — | Na żywo — status→"Anulowana", historia: "widoczne dla klienta" |
| Terminal — przyciski | Blokada akcji po Zamknięta/Anulowana | Kierownik/Administrator | OK | Wszystkie przyciski poza "Wiadomości"/"Archiwizuj" poprawnie `disabled` | — | Na żywo, dwukrotnie (dwie różne sprawy) |
| Rola Administrator | Dostęp do Ustawień | Administrator | OK | Pracownik/Kierownik nie mają linku "Ustawienia" w nawigacji, Administrator ma | — | Na żywo |
| Rola Administrator | Brak "Ustaw decyzję" mimo pełnego dostępu do reszty akcji sprawy | Administrator | OK | Zgodne z udokumentowanym, celowym wyłączeniem `cases.decision.*` z RBAC Administratora | — | Na żywo |
| Tworzenie sprawy — produkt spoza katalogu | Pracownik zgłasza reklamację modelu, którego nie ma w katalogu | Pracownik | **Znaleziono i naprawiono wcześniej w tej sesji** (przed rozpoczęciem tego przebiegu UAT) | `POST /products` → 403 (Pracownik nie ma `products.manage`) | Find-or-create produktu przeniesiony do `CasesService.create()` (wywołanie serwis-do-serwisu, autoryzowane przez `cases.create`) | Na żywo — Pracownik tworzy sprawę z nowym modelem bez błędu |
| Rekojmia — "Wymaga akceptacji Kierownika" | Dlaczego "Nie" dla nowej sprawy Rękojmia | — | Wyjaśnione (nie błąd) | Pole zależy od DECYZJI (`ZwrotSrodkow`), nie od typu reklamacji — poprawnie `Nie` dopóki decyzja nie jest ustawiona | — | — |

---

## 4. Naprawione błędy — szczegóły techniczne

Wszystkie poniższe: `tsc --noEmit` czysty (backend + frontend), pełny zestaw testów backendu **314/314 zielone** (37 suite'ów).

1. **`case-status.rules.ts`** — dodano `NEXT_ACTION_AFTER_DECISION_SET`.
2. **`cases.service.ts::setDecision`** — przelicza `nextAction` po ustawieniu decyzji.
3. **`cases.repository.ts::setDecision`** — nowy parametr `nextAction`.
4. **`mime-to-document-type.ts`** — `AppException(FILE-003)` zamiast gołego `UnprocessableEntityException`.
5. **`documents.controller.ts`, `portal.controller.ts`** — "Plik jest wymagany." jako `AppException(VALIDATION-001)`.
6. **`http-exception.filter.ts`** — rozpoznaje `PAYLOAD_TOO_LARGE` i podstawia `FILE-001`.
7. **`CaseDetailPage.tsx`** — historia `OwnerChanged` resolwuje ID→imię przez `lookups.userById`.
8. **`CaseDetailPage.tsx`, `documents.api.ts`** — checkbox "Udostępnij klientowi" przy uploadzie, przekazywany jako `visibility=Public`.

Testy zaktualizowane/dodane: `cases.repository.spec.ts` (+2 testy), `cases.service.spec.ts` (zaktualizowana asercja `setDecision`).

---

## 5. Backlog 2.0 (świadomie NIE wdrożone w tym przebiegu)

1. **Powiązanie "Poproś o uzupełnienie danych" z checklistą kompletności Portalu** — patrz wiersz tabeli wyżej. Wymaga: trwałego zapisu `requestedItems` per sprawa, rozszerzenia `computeCompleteness`, UI klienta do odhaczania konkretnych pozycji.
2. **Kosmetyka treści wiadomości "Poproś o uzupełnienie danych"** — usunąć redundancję "Prosimy o uzupełnienie: X. Prosimy o przesłanie: X".
3. **Limit rozmiaru załącznika PER PRODUCENT** (`Manufacturer.maxAttachmentSizeMb`, np. 15 MB dla Cybex Polska) — dziś egzekwowany wyłącznie globalny twardy limit 50 MB; to świadoma, udokumentowana luka z wcześniejszego zadania (`documents.service.ts` komentarz), nie regresja z tej sesji.

---

## 6. Co NIE zostało jeszcze przetestowane w tym przebiegu

- Pełny scenariusz jako **Serwis**/**Odczyt** (role o węższych uprawnieniach niż Pracownik) — nie było w bezpośrednim zakresie tego przebiegu.
- Portal Klienta: zakładka "Uzupełnij" z realnym wgraniem brakującego numeru seryjnego/ramy przez klienta i automatyczny powrót statusu (mechanizm `resumeIfComplete` zweryfikowany WYŁĄCZNIE przez lekturę kodu, nie live — z powodu problemu strukturalnego opisanego w Sekcji 3/5, klient w tym przebiegu i tak widział "kompletne" od razu).
- Retest live poprawki Next Action po decyzji (patrz Sekcja 1 i tabela).

---

## 7. Rekomendacja końcowa

Przed przekazaniem SmartRMA 1.0 do produkcyjnego użytku:

1. Wykonać jeden dodatkowy, czysty przebieg Sekcji 4 (nowa sprawa → zamknięcie) obejmujący ponowne ustawienie decyzji, żeby zamknąć jedyną niepełną weryfikację (Next Action).
2. Zdecydować, czy problem strukturalny (Portal "Uzupełnij" ↔ treść prośby) blokuje wydanie, czy trafia do backlogu 2.0 jako świadomie zaakceptowane ograniczenie na start.
3. Skonfigurować dla środowiska produkcyjnego realny, zweryfikowany dostawca e-mail (Resend z prawdziwą domeną nadawcy) — obecna konfiguracja testowa nie odzwierciedla zachowania produkcyjnego dla klientów o prawdziwych adresach.
