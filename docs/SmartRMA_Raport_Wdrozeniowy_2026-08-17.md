# Raport wdrożeniowy SmartRMA — pełny test operacyjny na żywo

**Data:** 17.08.2026
**Zakres:** Faza stabilizacji przed produkcyjnym wdrożeniem w DAWIDAM (nie przygotowanie pod sprzedaż/inwestora)
**Środowisko:** lokalne (Postgres + Redis + Mailpit przez docker-compose, API i web w trybie dev), dane rzeczywiste DAWIDAM + organizacje testowe TekstylPro (Dystrybutor w łańcuchu) i FabrykaWłókiennicza (Producent)

Test wykonany metodą mieszaną: rzeczywiste wywołania API dokładnie odzwierciedlające akcje panelu pracownika (te same endpointy, te same DTO, ta sama walidacja co UI) + bezpośrednia weryfikacja w przeglądarce (formularz publiczny, panel pracownika, Portal Klienta) + odczyt rzeczywistych e-maili z Mailpit.

---

## 1. B2B — wynik całego scenariusza

**Wynik: PASS.** Pełny łańcuch DAWIDAM → TekstylPro → FabrykaWłókiennicza → decyzja Producenta → decyzja Dystrybutora → powrót informacji do DAWIDAM zadziałał poprawnie od początku do końca.

| Etap | Sprawa | Status po etapie | Wynik |
|---|---|---|---|
| Utworzenie sprawy w DAWIDAM | RMA/2026/00029 | Nowa | ✅ poprawna numeracja, poprawne dane klienta/produktu |
| Przekazanie DAWIDAM → TekstylPro | RMA/2026/00029 → RMA/2026/00030 (nowa, niezależna sprawa) | Nowa (obie) | ✅ `sentTo`/`receivedFrom` poprawne po obu stronach |
| Przyjęcie przez TekstylPro | RMA/2026/00030 | Przyjęta | ✅ |
| Przekazanie TekstylPro → FabrykaWłókiennicza | RMA/2026/00030 → RMA/2026/00031 | Nowa | ✅ TekstylPro poprawnie widzi jednocześnie `receivedFrom` (DAWIDAM) i `sentTo` (FabrykaWłókiennicza) |
| Decyzja Producenta (FabrykaWłókiennicza) | RMA/2026/00031 | Decyzja pozytywna — Naprawa | ✅ |
| Propagacja do Dystrybutora | RMA/2026/00030 | (bez zmiany statusu) | ✅ wpis historii „Aktualizacja od partnera B2B” pojawił się automatycznie |
| Propagacja do DAWIDAM (2 przeskoki) | RMA/2026/00029 | (bez zmiany statusu) | ✅ dotarła przez CAŁY łańcuch, nie tylko bezpośredniego partnera |
| Decyzja Dystrybutora (TekstylPro, własna) | RMA/2026/00030 | Decyzja pozytywna — Naprawa | ✅ propagacja do DAWIDAM ponownie zadziałała |
| Próba ponownego przekazania sprawy DAWIDAM | RMA/2026/00029 | — | ✅ poprawnie zablokowane: `409 PARTNERSHIP-006` |
| Zamknięcie sprawy w DAWIDAM (niezależnie od statusów partnerów) | RMA/2026/00029 | Zakończona | ✅ pełna, poprawna historia audytowa (17 wpisów) |

**Sprawdzone punkty z checklisty:**
- ✅ Utworzenie sprawy, poprawność numeracji *(w formacie — patrz jednak Problem 8b niżej)*
- ✅ Status na każdym etapie
- ✅ Przekazanie sprawy (handoff)
- ✅ `receivedFrom`/`sentTo` — widoczne w panelu jako sekcja „Partner B2B” na karcie sprawy
- ✅ Historia — kompletna, poprawnie rozdzielona na wpisy widoczne/niewidoczne dla klienta
- ✅ Dokumenty i wiadomości/notatki — działają na każdym etapie łańcucha niezależnie
- ✅ Decyzja producenta i jej propagacja przez cały łańcuch
- ✅ Powrót informacji do oryginalnej sprawy DAWIDAM
- ⚠️ Możliwość dalszego przekazania sprawy — **sprawa może zostać przekazana dokładnie RAZ w całej swojej historii** (zabezpieczenie `PARTNERSHIP-006`). To świadoma decyzja architektoniczna (Opcja B — osobne, powiązane sprawy), nie błąd, ale ma realne konsekwencje operacyjne — patrz punkt 11.
- ✅ Zamknięcie sprawy

Jedyny rzeczywisty problem znaleziony w tym scenariuszu: patrz **Problem 8c** (niejednoznaczność komunikatów propagacji przy łańcuchu >2 firm).

---

## 2. B2C — wynik całego scenariusza

**Wynik: PASS**, z jednym realnym brakiem w warstwie brandingu Portalu Klienta.

Przebieg: klient detaliczny (Ewa Kamińska) → formularz `/reklamacja/tekstylpro` → sprawa RMA/2026/00032 → e-mail potwierdzający z kodem dostępu → obsługa przez pracownika TekstylPro → decyzja (Wymiana produktu) → zamknięcie → e-mail zamknięcia → Portal Klienta.

- ✅ Formularz publiczny poprawnie rozpoznaje organizację po `slug` i pokazuje TYLKO jej własnego producenta/markę (TekstylPro) — brak wycieku katalogu innych firm.
- ✅ Zgoda RODO poprawnie wskazuje `TekstylPro` jako administratora danych.
- ✅ E-mail potwierdzający: poprawnie zaadresowany, poprawnie zabrandowany (`From: TekstylPro <no-reply@tekstylpro.local>`), zawiera działający link do Portalu Klienta z kodem dostępu.
- ✅ Obsługa przez pracownika: przyjęcie, ustawienie decyzji, wiadomość do klienta, zamknięcie — każdy krok zadziałał zgodnie z oczekiwaniem.
- ✅ E-mail zamknięcia dostarczony i poprawnie zabrandowany.
- ✅ Portal Klienta: poprawny status („Zakończona” + pasek postępu 5 kroków), poprawna decyzja („Wymiana produktu”), poprawne wiadomości (widoczna wiadomość pracownika + potwierdzenia zamknięcia), pusty stan dokumentów poprawnie wyświetlony.
- ✅ **Izolacja danych wewnętrznych**: klient w Portalu NIE widzi notatek wewnętrznych, uzasadnienia decyzji (`decisionJustification`), ani wpisów „Aktualizacja od partnera B2B” — wyłącznie zdarzenia oznaczone jako `visibleForCustomer: true`.
- ❌ **Marka firmy w Portalu Klienta** — nagłówek Portalu pokazuje na stałe „SmartRMA”, NIE nazwę organizacji, z którą klient faktycznie się kontaktował (TekstylPro). Zobacz **Problem 8e**.

Dodatkowo, w trakcie testu (przez mój błąd w danych — nieprawidłowa wartość enuma) przypadkowo zamknąłem sprawę bez ustawionej decyzji, po czym ją ponownie otworzyłem i poprawnie zamknąłem. To ujawniło dwa rzeczywiste zachowania systemu, oba udokumentowane niżej jako **Problem 8d** i **8f**.

---

## 3. CaseHandoff — wynik całego łańcucha

Opisany szczegółowo w sekcji 1. Mechanizm działa poprawnie na wszystkich sprawdzonych punktach: tworzenie niezależnej sprawy u partnera, kopiowanie danych klienta (bez ujawniania wewnętrznego ID oryginalnej firmy), wątek `receivedFrom`/`sentTo` widoczny w obu kierunkach, propagacja statusu/decyzji w górę całego łańcucha (nie tylko do bezpośredniego rodzica), blokada podwójnego przekazania tej samej sprawy.

**Jedyny znaleziony problem:** komunikaty propagacji („Status u partnera: X”, „Decyzja partnera: Y”) nie identyfikują, KTÓRA firma w łańcuchu wywołała zmianę — przy łańcuchu 3-firmowym (Sklep→Dystrybutor→Producent) pracownik Sklepu widzi w historii swojej sprawy dwa pozornie identyczne wpisy „Status u partnera: Przyjęta” — jeden od Dystrybutora, jeden (dwa przeskoki dalej) od Producenta — bez możliwości ich rozróżnienia. Zweryfikowane zarówno przez API, jak i wizualnie w zakładce „Historia” karty sprawy. Źródło: `apps/api/src/modules/case-handoff/handlers/case-handoff-partner-update.handler.ts:73-88` (funkcja `propagateToAncestors` używa jednego, przechwyconego na starcie tekstu komunikatu dla całego łańcucha przeskoków).

---

## 4. E-mail/powiadomienia — co działa i co wymaga konfiguracji

**Co działa:**
- Wysyłka SMTP (przetestowana przez Mailpit) dla: potwierdzenia zgłoszenia, wiadomości od pracownika, zamknięcia sprawy, wiadomości testowej z Ustawień.
- Poprawny branding nadawcy per organizacja (`senderName`/`senderEmail` z `EmailSettings` danej firmy) — potwierdzone na dwóch różnych organizacjach (TekstylPro, świeżo założona „Nowy Klient 2”).
- Jasny, zrozumiały komunikat błędu (`502 NOTIFICATION-001 — Brak konfiguracji e-mail (Ustawienia → E-mail)`), gdy organizacja nie ma jeszcze skonfigurowanej poczty — pracownik/administrator od razu wie, co zrobić.
- Endpoint testowej wiadomości (`POST /settings/email/test-send`) działa poprawnie i jest dostępny z panelu Ustawień.

**Co wymaga ręcznej konfiguracji (potwierdzone empirycznie — patrz sekcja 6):**
- **Żaden** z dwóch mechanizmów zakładania nowej organizacji (`create-admin.ts` dla Sklepu, `create-organization.ts` dla Producenta/Dystrybutora) nie tworzy wiersza `EmailSettings`. Świeżo założona organizacja ma WYŁĄCZONĄ pocztę do czasu, aż administrator ręcznie wypełni Ustawienia → E-mail. To jest zgodne z instrukcją „nie konfiguruj SMTP na sztywno w kodzie” — dane logowania do prawdziwej skrzynki nie mogą być zgadywane przez system.

---

## 5. Portal Klienta — co działa

- ✅ Logowanie kodem dostępu (wielorazowym, z e-maila) i bezpiecznym linkiem jednorazowym (z panelu pracownika) — oba przetestowane.
- ✅ Pasek postępu (5 kroków), aktualny status, decyzja.
- ✅ Wiadomości (odczyt + odpowiedź), dokumenty (pusty stan poprawny), historia ograniczona do zdarzeń oznaczonych jako widoczne dla klienta.
- ✅ **Izolacja danych** — potwierdzona: brak wycieku notatek wewnętrznych, uzasadnień decyzji, wpisów o partnerach B2B.
- ❌ **Brak marki organizacji** — `apps/web/src/layouts/PortalLayout.tsx:18` ma na stałe wpisany tekst `"SmartRMA"` zamiast nazwy/loga firmy, z którą klient faktycznie rozmawia. To jedyne miejsce w całej podróży klienta (formularz → e-mail → Portal), które NIE pokazuje właściwej marki — mimo że dane potrzebne do tego (nazwa firmy) są już dostępne w API. Patrz **Problem 8e**.

---

## 6. Onboarding nowej organizacji — dokładne wymagania

**Kluczowe ustalenie: obecnie NIE ma samoobsługowego ekranu zakładania nowej organizacji.** `POST /companies` (tworzenie nowej firmy) nie istnieje jako endpoint API — jedyne dwie ścieżki to skrypty CLI uruchamiane z dostępem do serwera/zmiennych środowiskowych:

| Typ organizacji | Skrypt | Co zakłada automatycznie |
|---|---|---|
| Sklep (np. kolejny punkt sprzedaży niezależny od DAWIDAM) | `apps/api/scripts/create-admin.ts` | Firma + slug, katalog 9 statusów domyślnych *(naprawione w tej sesji — patrz sekcja 9)*, pierwsze konto Administratora |
| Producent/Dystrybutor (partner B2B) | `apps/api/scripts/create-organization.ts` | Firma + slug, siedziba (Shop), samoopisany profil Producenta/Kontrahenta/Marki, katalog 9 statusów domyślnych, pierwsze konto Administratora |

Żaden z nich **nie** zakłada: `EmailSettings`, katalogu producentów/kontrahentów (dla Sklepu), partnerstw B2B. To musi zrobić administrator organizacji samodzielnie, przez panel, po pierwszym zalogowaniu.

**Checklista administratora nowej organizacji (weryfikowana na żywo na przykładzie świeżo założonej firmy):**

1. Zaloguj się kontem Administratora przekazanym przez osobę, która uruchomiła skrypt zakładający firmę.
2. **Ustawienia → E-mail** — skonfiguruj SMTP (host/port/login/hasło/szyfrowanie) lub Resend, zapisz, wyślij wiadomość testową i sprawdź jej dostarczenie. Bez tego kroku żaden e-mail do klienta (potwierdzenie, zamknięcie, kod dostępu do Portalu) nie zostanie wysłany — użytkownik dostanie jasny komunikat `NOTIFICATION-001`, ale samego e-maila nie będzie.
3. **Producenci** — dodaj przynajmniej jednego producenta/kontrahenta. Bez tego formularz publiczny nie ma czego pokazać w polu „Producent”, a pracownik nie może utworzyć sprawy.
4. **Partnerzy B2B** *(opcjonalnie, jeśli firma współpracuje w modelu Sklep↔Dystrybutor↔Producent)* — zaproś partnera z ekranu Partnerzy, poczekaj na akceptację.
5. **Użytkownicy** — dodaj pracowników i przypisz role. Role systemowe (Administrator/Kierownik/Pracownik/Serwis/Odczyt) są **globalne i gotowe od razu** — nie trzeba ich konfigurować per firma.
6. **Ustawienia → Statusy reklamacji** — sprawdź domyślny katalog 9 statusów, dostosuj do własnego procesu, jeśli potrzeba.
7. **Ustawienia → Numeracja spraw** — sprawdź prefiks/format (uwaga: patrz Problem 8b — numeracja nie jest dziś odizolowana między firmami na tej samej instancji).
8. Sprawdź działanie formularza publicznego pod `/reklamacja/:slug` i utwórz sprawę testową od początku do końca.

---

## 7. Multi-tenant/security — wynik testu

**Wynik: PASS.** Wykonano żywy test (nie tylko automatyczny pakiet) z realnymi kontami trzech niezależnych organizacji (DAWIDAM, TekstylPro, świeżo założona „Nowy Klient 2” — bez żadnego partnerstwa z pozostałymi dwoma):

- ❌ (poprawnie zablokowane) Pracownik DAWIDAM nie mógł odczytać sprawy TekstylPro po realnym UUID → `404 CASE-012`.
- ❌ (poprawnie zablokowane) Pracownik DAWIDAM nie mógł zmienić statusu ani dodać notatki do sprawy TekstylPro → `404 CASE-012`.
- ❌ (poprawnie zablokowane) Klient TekstylPro nie pojawia się na liście klientów DAWIDAM.
- ❌ (poprawnie zablokowane) Zupełnie niepowiązana, świeżo założona organizacja nie mogła odczytać sprawy DAWIDAM ani TekstylPro.
- ❌ (poprawnie zablokowane) Pracownik DAWIDAM nie mógł odczytać wątku przekazania (`handoff-thread`) cudzej sprawy.
- ❌ (poprawnie zablokowane) TekstylPro nie mógł odczytać klienta zupełnie niepowiązanej organizacji.
- ❌ (poprawnie zablokowane) DAWIDAM nie mógł edytować samoopisanego profilu Producenta należącego do TekstylPro.
- ❌ (poprawnie zablokowane) Próba wstrzyknięcia parametru `?companyId=...` w zapytaniu listy spraw została odrzucona przez walidację (`422`, pole spoza DTO), nie zignorowana po cichu.
- ✅ Lista partnerstw poprawnie ograniczona do własnych relacji firmy.

Wynik w pełni spójny z automatycznym pakietem `multi-tenant-idor.e2e-spec.ts` (23/23 zielone).

---

## 8. Problemy znalezione podczas testu

**a. [NAPRAWIONE] Świeży Sklep nie mógł utworzyć pierwszej sprawy — 500 Internal Server Error.**
`apps/api/scripts/create-admin.ts` (skrypt zakładający nową organizację typu Sklep — dokładnie ten, którym powstał DAWIDAM) nie seedował katalogu statusów. Pierwsza próba `POST /cases` kończyła się gołym `500 INTERNAL-ERROR` bez żadnej wskazówki. DAWIDAM nie jest tym dotknięty (jego katalog powstał wcześniej, jednorazowym backfillem), ale KAŻDA przyszła nowa organizacja Sklepu byłaby. Naprawione i zweryfikowane na żywo (patrz sekcja 9).

**b. [DO DALSZEGO WDROŻENIA] Numeracja spraw nie jest odizolowana między firmami.**
`apps/api/src/modules/cases/cases.repository.ts:156-173` (`findMaxSequenceInYear`/`findMaxSequenceTotal`) liczy najwyższy numer sprawy globalnie po samym prefiksie (`RMA/2026/...`), **bez filtra `companyId`**. W tej sesji DAWIDAM, TekstylPro i FabrykaWłókiennicza — trzy różne firmy — dostały kolejno numery RMA/2026/00029, 00030, 00031 z jednej, wspólnej puli. Numery pozostają unikalne (nic się nie psuje technicznie), ale tracą sens biznesowy: numeracja DAWIDAM będzie nieprzewidywalnie „skakać” w zależności od aktywności zupełnie innych, niepowiązanych organizacji na tej samej instalacji. Dziś DAWIDAM jest jedyną realną organizacją, więc efekt jest niewidoczny — ujawni się natychmiast, gdy tylko druga organizacja zacznie realnie pracować na tej samej instancji.

**c. [DO DALSZEGO WDROŻENIA] Niejednoznaczne komunikaty propagacji przy łańcuchu >2 firm.**
Opisane w sekcji 3. `apps/api/src/modules/case-handoff/handlers/case-handoff-partner-update.handler.ts:73-88`.

**d. [OBSERWACJA, konfigurowalne bez zmian w kodzie] Można zamknąć sprawę bez zapisanej decyzji.**
Żaden z 9 domyślnych statusów katalogu nie ma ustawionego `requiredCheck='CASE-009'` (twardy wymóg „decyzja musi być ustawiona”), więc domyślnie system na to pozwala. Mechanizm wymuszenia JUŻ ISTNIEJE i działa (zweryfikowany w Fazie testów statusów) — trzeba go świadomie włączyć w Ustawieniach → Statusy reklamacji dla wybranego statusu końcowego, jeśli DAWIDAM chce to wymusić.

**e. [DO DALSZEGO WDROŻENIA] Portal Klienta nie pokazuje marki organizacji.**
`apps/web/src/layouts/PortalLayout.tsx:18` — nagłówek na stałe pokazuje „SmartRMA” zamiast nazwy firmy, z którą klient faktycznie się kontaktował. Jedyne niespójne miejsce w całej podróży klienta — formularz i e-maile są poprawnie brandowane.

**f. [OBSERWACJA, przypadek brzegowy] Ponowne otwarcie i zamknięcie sprawy wysyła e-mail „zakończona” ponownie.**
Każde WEJŚCIE w status końcowy (nie tylko pierwsze) uruchamia powiadomienie klienta. To sensowne przy normalnym przepływie, ale jeśli pracownik omyłkowo zamknie sprawę, cofnie status i zamknie ponownie (żeby np. poprawnie ustawić decyzję), klient dostanie DWA e-maile „reklamacja zakończona” pod rząd. Nie blokuje obsługi, ale może wprowadzić klienta w błąd.

**g. [OBSERWACJA, nie blokujące] Brak samoobsługowego zakładania nowych organizacji.**
Opisane w sekcji 6 — dziś wymaga dostępu do serwera/CLI. Nie jest to problem dla samego DAWIDAM (już istnieje), ale ogranicza, kto może onboardować przyszłych partnerów B2B.

---

## 9. Problemy naprawione

| Problem | Plik | Zmiana |
|---|---|---|
| 8a — brak katalogu statusów dla nowego Sklepu → 500 przy pierwszej sprawie | `apps/api/scripts/create-admin.ts` | Dodano seedowanie `DEFAULT_STATUS_CATALOG` (dokładnie ten sam, sprawdzony mechanizm, którego już poprawnie używa `create-organization.ts`), idempotentne — bezpieczne przy ponownym uruchomieniu na istniejącej firmie. Zweryfikowane na żywo: przed poprawką `POST /cases` kończył się `500`, po poprawce `201` z poprawnym numerem sprawy. |

*(Dla pełnego obrazu: w poprzednim etapie tej sesji — stabilizacji zestawu testów e2e — naprawiono też dwa mniejsze, niezwiązane z B2B/B2C problemy: brak walidacji formatu e-maila przy logowaniu przez kolejność Guard→Pipe w NestJS, oraz `GET /orders/search` zwracający pustą odpowiedź zamiast JSON `null`. Oba potwierdzone pełnym zielonym zestawem 376 testów jednostkowych + 152 e2e.)*

---

## 10. Problemy pozostawione do dalszego wdrożenia

- 8b — numeracja spraw współdzielona między firmami (wymaga dodania `companyId` do zapytań w `cases.repository.ts` — mała, ale realna zmiana, celowo NIE wykonana teraz, bo nie blokuje bieżącej pracy DAWIDAM).
- 8c — niejednoznaczne komunikaty propagacji handoff przy łańcuchu >2 firm.
- 8e — brak marki organizacji w nagłówku Portalu Klienta.
- 8f — podwójny e-mail zamknięcia przy ponownym otwarciu/zamknięciu sprawy.
- 8g — brak samoobsługowego zakładania nowych organizacji (świadomie odłożone — nie dotyczy samego DAWIDAM).

Żadna z tych zmian nie została wykonana w tej sesji zgodnie z instrukcją „nie rób kolejnych zmian w kodzie, chyba że błąd blokuje prawidłową obsługę reklamacji” — żadna z nich nie blokuje pracy DAWIDAM dzisiaj.

---

## 11. Rzeczy, które mogą utrudniać codzienną pracę pracowników DAWIDAM

1. **Status sprawy NIE zmienia się automatycznie po przekazaniu partnerowi.** Po `POST /cases/:id/handoff` sprawa w DAWIDAM zostaje w statusie sprzed przekazania (np. „Nowa”), dopóki pracownik ręcznie nie zmieni statusu. Lista spraw może więc mylnie sugerować, że sprawa czeka na reakcję pracownika, mimo że faktycznie czeka już na partnera.
2. **Niejednoznaczna historia przy dłuższych łańcuchach** (Problem 8c) — Kierownik czytający historię sprawy nie zawsze rozpozna, czy aktualizacja pochodzi od bezpośredniego partnera, czy od kogoś dalej w łańcuchu.
3. **Sprawę można przekazać partnerowi TYLKO RAZ w całej jej historii.** Nie ma ścieżki „cofnij przekazanie i wyślij do innego partnera” — jedyna droga to założenie nowej sprawy od zera. Warto to uwzględnić w szkoleniu pracowników, żeby nie próbowali szukać nieistniejącej opcji.
4. **Brak wymuszonej decyzji przed zamknięciem** (Problem 8d) — przy dużym wolumenie spraw możliwe jest zamknięcie bez zapisanej decyzji, co utrudni późniejsze raportowanie/analitykę. Do rozważenia: włączenie wymogu w Ustawieniach.
5. **Rozjazd marki w Portalu Klienta** (Problem 8e) — klient może zadzwonić zdezorientowany „kim jest SmartRMA”, mimo że kontaktował się z konkretnym sklepem/producentem.

---

## 12. Lista konkretnych zadań przed rozpoczęciem normalnego użytkowania systemu przez pracowników

1. **[Zalecane przed pójściem produkcyjnie z drugą organizacją]** Naprawić numerację spraw per firma (Problem 8b) — inaczej numeracja DAWIDAM zacznie nieprzewidywalnie skakać w momencie, gdy na tej samej instalacji zacznie realnie działać kolejna organizacja.
2. **[Zalecane]** Dodać nazwę/markę organizacji do nagłówka Portalu Klienta (Problem 8e).
3. **[Zalecane]** Doprecyzować komunikaty propagacji handoff o nazwę firmy-źródła (Problem 8c).
4. **[Do decyzji właściciela, możliwe bez zmian w kodzie]** Zdecydować, czy wymusić ustawienie decyzji przed zamknięciem sprawy — konfiguracja w Ustawieniach → Statusy reklamacji.
5. **[Operacyjne, obowiązkowe przed startem]** Sprawdzić i potwierdzić konfigurację prawdziwego SMTP/e-mail DAWIDAM w Ustawieniach → E-mail, wysłać wiadomość testową (checklista z sekcji 6).
6. **[Operacyjne, szkolenie]** Poinformować pracowników, że po przekazaniu sprawy partnerowi trzeba ręcznie zmienić jej status — nie dzieje się to automatycznie (punkt 11.1).
7. **[Operacyjne, szkolenie]** Poinformować pracowników, że przekazanie sprawy partnerowi jest jednorazowe i nieodwracalne (punkt 11.3).
8. **[Opcjonalne, nie pilne]** Rozważyć docelowo self-service ekran zakładania nowych organizacji, jeśli DAWIDAM planuje częściej onboardować nowych partnerów B2B — dziś wymaga to dostępu do serwera (Problem 8g).
9. **[Porządkowe]** Jeśli ta sama baza danych ma być użyta produkcyjnie: usunąć nagromadzone dane testowe (liczne organizacje `E2E ...`, `Dist/Shop/Outsider ...` powstałe podczas testów automatycznych i tej sesji) — nie wpływa to na DAWIDAM, ale zaśmieca instalację.

---

**Podsumowanie:** System w obecnym stanie **nadaje się do stabilnego uruchomienia w DAWIDAM** — pełny scenariusz B2B, B2C, onboarding i izolacja wielo-organizacyjna działają poprawnie w realnych warunkach. Jeden rzeczywisty, blokujący błąd (brak katalogu statusów dla nowej organizacji) został znaleziony i naprawiony w trakcie tego testu. Pozostałe znalezione problemy są realne, ale nie blokują bieżącej pracy DAWIDAM — każdy z nich jest jasno opisany, zlokalizowany w kodzie i gotowy do zaplanowania jako osobne, świadome zadanie.
