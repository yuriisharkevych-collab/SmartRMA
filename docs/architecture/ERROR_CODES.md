# ERROR_CODES.md — SmartRMA AI

## Katalog kodów błędów

Wspólny, ustabilizowany zestaw kodów błędów dla API i frontendu — klient
(web, Portal Klienta, przyszła aplikacja mobilna) reaguje na **kod**, nie
analizuje treści komunikatu (który może się zmienić, być
zlokalizowany, itp.). Komunikat w kolumnie "Treść (PL)" to **wartość
domyślna**, nadpisywalna przez `NotificationTemplate`/i18n frontendu —
sam kod jest stabilnym kontraktem między backendem a każdym klientem API.

**Konwencja:** `{MODUŁ}-{numer 3-cyfrowy}`. Numeracja w obrębie modułu
rośnie chronologicznie (kolejność dodawania), nie tematycznie — nowy błąd
zawsze dostaje kolejny wolny numer w swoim module, nigdy nie wstawiany
"pomiędzy" (żeby kody raz opublikowane w API nigdy nie zmieniły znaczenia).

**Struktura odpowiedzi błędu (rekomendacja dla API):**
```json
{
  "error": {
    "code": "CASE-004",
    "message": "Numer seryjny jest wymagany dla wybranego producenta.",
    "field": "product.serialNumber",
    "meta": { "manufacturerId": "..." }
  }
}
```
`field` i `meta` są opcjonalne — wypełniane, gdy błąd dotyczy konkretnego
pola formularza lub niesie dodatkowy kontekst.

---

## CASE — reklamacje (workflow, walidacja)

| Kod | HTTP | Treść (PL) | Kiedy występuje | Powiązana reguła |
|---|---|---|---|---|
| CASE-001 | 409 | Nieprawidłowe przejście statusu. | Próba zmiany statusu na wartość nieosiągalną z bieżącego statusu wg automatu stanów danej ścieżki | `WORKFLOW.md` §2, §8; `STATE_MACHINE.md`; `BUSINESS_RULES.md` BR-098 |
| CASE-002 | 422 | Brak wymaganych dokumentów. | Próba przejścia dalej bez kompletu wymaganych załączników (np. mniej niż 2 zdjęcia uszkodzenia) | `WORKFLOW.md` §8; `BUSINESS_RULES.md` BR-102 |
| CASE-003 | 422 | Wybrana marka nie jest obsługiwana przez wskazanego producenta. | `Brand.manufacturerId` nie zgadza się z wybranym/sugerowanym `Manufacturer` dla pozycji reklamacji | `DATABASE.md` §15; `BUSINESS_RULES.md` BR-076 |
| CASE-004 | 422 | Numer seryjny jest wymagany dla wybranego producenta. | `Manufacturer.requiresSerialNumber=true`, a pole puste | `WORKFLOW.md` §8; `BUSINESS_RULES.md` BR-102 |
| CASE-005 | 422 | Numer ramy jest wymagany dla wybranego producenta. | `Manufacturer.requiresFrameNumber=true`, a pole puste | jw. |
| CASE-006 | 422 | Dowód zakupu jest wymagany dla wybranego producenta. | `Manufacturer.requiresProofOfPurchase=true`, brak dokumentu i brak dopasowania do `OrderItem` | jw. |
| CASE-007 | 422 | Zgłoszenie bezpośrednio do producenta jest dostępne wyłącznie dla reklamacji gwarancyjnych. | Próba utworzenia sprawy `submissionMode=BezposrednioDoProducenta` + `complaintType=StatutoryWarranty` | `WORKFLOW.md` §1, §8; `BUSINESS_RULES.md` BR-097 |
| CASE-008 | 409 | Sprawa jest zamknięta/anulowana/zarchiwizowana i nie może być zmieniana. | Próba jakiejkolwiek modyfikacji sprawy w statusie końcowym | `WORKFLOW.md` §2.3, §8; `BUSINESS_RULES.md` BR-103 |
| CASE-009 | 422 | Nie można zrealizować decyzji — decyzja nie została jeszcze ustawiona. | Przejście `OczekiwanieNaDecyzjeProducenta`/`OczekiwanieNaDecyzjeKierownika` → `RealizacjaDecyzji` bez `Case.decision` | `WORKFLOW.md` §8 |
| CASE-010 | 403 | Ta decyzja wymaga zatwierdzenia przez Kierownika lub Administratora. | Próba ustawienia decyzji `ZwrotSrodkow` lub decyzji w sprawie rękojmi przez użytkownika bez `cases.decision.approve` | `RBAC.md`; `BUSINESS_RULES.md` BR-085 |
| CASE-011 | 422 | Podanie powodu jest wymagane przy anulowaniu sprawy. | `Case.status → Anulowana` bez towarzyszącej notatki/powodu | `WORKFLOW.md` §5 |
| CASE-012 | 404 | Nie znaleziono sprawy o podanym identyfikatorze/numerze. | Odczyt/operacja na nieistniejącym `Case.id`/`caseNumber` | — |
| CASE-013 | 409 | Numer sprawy już istnieje. | Kolizja generatora `caseNumber` (rzadkie, race condition przy równoczesnym tworzeniu) — do obsłużenia retry, patrz uwaga niżej | `DATABASE.md` §19 |
| CASE-014 | 409 | Rodzaj zgłoszenia (gwarancja/rękojmia) można zmienić wyłącznie przed przekazaniem sprawy do dalszego etapu procesu. | Próba zmiany `complaintType` po opuszczeniu statusu `Weryfikacja` (formularz publiczny nie pyta klienta o ten wybór — pracownik ustawia go podczas weryfikacji) | `case-status.rules.ts` (warunek `complaintType=...` na przejściu z `Weryfikacja`) |

> **CASE-013 — uwaga implementacyjna:** generator numeru sprawy
> (`RMA/{rok}/{sekwencja}`) oparty o `COUNT()` jest podatny na race
> condition przy dużej równoległości zapisów (patrz `case-new.js` w
> prototypie — ten sam problem był już świadomie odnotowany przy MVP).
> Backend powinien łapać ten błąd i **automatycznie ponowić** generowanie
> z nowym numerem, nie zwracać go bezpośrednio klientowi jako błąd do
> ręcznej obsługi — kod istnieje głównie do celów logowania/audytu.

---

## AUTH — uwierzytelnianie (pracownicy)

| Kod | HTTP | Treść (PL) | Kiedy występuje |
|---|---|---|---|
| AUTH-001 | 401 | Nieprawidłowy adres e-mail lub hasło. | Logowanie pracownika — błędne dane |
| AUTH-002 | 403 | Konto jest nieaktywne. | `User.active=false` |
| AUTH-003 | 401 | Sesja wygasła — zaloguj się ponownie. | Wygasły/nieprawidłowy token JWT |
| AUTH-004 | 400 | Hasło nie spełnia wymagań bezpieczeństwa. | Reset hasła / zmiana hasła — zbyt słabe hasło |
| AUTH-005 | 429 | Konto tymczasowo zablokowane z powodu zbyt wielu nieudanych prób logowania. | `maxLoginAttempts` nieudanych prób w oknie `lockoutDurationMinutes` (Ustawienia › Bezpieczeństwo, `CompanySettings`) |
| AUTH-006 | 429 | Zbyt wiele nieudanych prób logowania PIN-em — spróbuj ponownie później. | `maxPinAttempts` nieudanych prób PIN-u pod danym e-mailem w oknie `pinLockoutDurationMinutes` (`CompanySettings`) — licznik liczony per (współdzielony) e-mail w Redis, ODRĘBNY od `AUTH-005` (który liczy per konto przez `LoginEvent`), bo przy logowaniu PIN-em wiele kont może dzielić ten sam e-mail (`User.loginMethod=Pin`). |

---

## RBAC — role i uprawnienia

| Kod | HTTP | Treść (PL) | Kiedy występuje |
|---|---|---|---|
| RBAC-001 | 403 | Brak wymaganego uprawnienia do wykonania tej akcji. | Użytkownik bez odpowiedniego `Permission` w żadnej z przypisanych ról — patrz `RBAC.md` |
| RBAC-002 | 404 | Rola nie istnieje. | Odwołanie do nieistniejącego `Role.id` (np. przy przypisywaniu roli) |
| RBAC-003 | 403 | Nie można modyfikować ani usuwać roli systemowej. | Próba edycji/usunięcia roli z `isSystem=true` poza zakresem uprawnień (patrz `RBAC.md` §1) |
| RBAC-004 | 409 | Nie można odebrać użytkownikowi ostatniej roli. | Próba usunięcia jedynego przypisania `UserRoleAssignment` — każdy `User` musi mieć co najmniej jedną rolę |

---

## FILE — załączniki

| Kod | HTTP | Treść (PL) | Kiedy występuje | Powiązana reguła |
|---|---|---|---|---|
| FILE-001 | 413 | Załącznik przekracza dopuszczalny rozmiar. | Rozmiar pliku > `Manufacturer.maxAttachmentSizeMb` (lub domyślny limit systemowy, jeśli sprawa nie ma jeszcze przypisanego producenta) | `WORKFLOW.md` §8; `BUSINESS_RULES.md` BR-102 |
| FILE-002 | 422 | Przekroczono maksymalną liczbę zdjęć. | Liczba zdjęć w danej kategorii > `Manufacturer.maxPhotos` | jw. |
| FILE-003 | 415 | Nieobsługiwany format pliku. | Typ pliku spoza `DocumentType` (PDF/JPG/PNG/HEIC/MP4) | `DATABASE.md` §25 |
| FILE-004 | 422 | Wymagane minimum 2 zdjęcia uszkodzenia. | Próba przejścia dalej z mniej niż 2 zdjęciami w kategorii `Photo`/uszkodzenie | `WORKFLOW.md` §8; `BUSINESS_RULES.md` BR-102 |

---

## SLA — terminy producentów

| Kod | HTTP | Treść (PL) | Kiedy występuje | Powiązana reguła |
|---|---|---|---|---|
| SLA-001 | — *(zdarzenie, nie błąd blokujący)* | Termin SLA producenta został przekroczony. | Zadanie cykliczne wykrywa sprawę przekraczającą `ManufacturerSLA.responseDays`/`repairDays` | `WORKFLOW.md` §6, §9; `BUSINESS_RULES.md` BR-094–096 |
| SLA-002 | 200 *(informacyjny)* | Ten producent nie ma skonfigurowanego SLA. | Próba odczytu/raportu SLA dla producenta bez rekordu `ManufacturerSLA` lub z polami `null` | `DATABASE.md` §14a |

> **SLA-001 nie jest błędem w sensie odrzucenia żądania** — to zdarzenie
> systemowe (patrz `EVENTS.md`, `SLABreached`), zwracane w API wyłącznie
> jako część odpowiedzi informacyjnej (np. `GET /cases/:id` może zawierać
> `warnings: ["SLA-001"]`), nigdy jako kod błędu blokujący operację.

---

## PORTAL — Portal Klienta

| Kod | HTTP | Treść (PL) | Kiedy występuje | Powiązana reguła |
|---|---|---|---|---|
| PORTAL-001 | 401 | Nieprawidłowy numer reklamacji lub kod dostępu. | Logowanie klienta — błędne dane | `BUSINESS_RULES.md` BR-077 |
| PORTAL-002 | 403 | Portal klienta nie jest włączony dla tej sprawy. | `Case.clientPortalEnabled=false` | jw. |
| PORTAL-003 | 429 | Zbyt wiele nieudanych prób logowania. Spróbuj ponownie później lub skontaktuj się ze sklepem. | 5. nieudana próba logowania dla danego numeru sprawy | `BUSINESS_RULES.md` BR-078 |
| PORTAL-004 | 401 | Link jest nieprawidłowy lub wygasł. | `clientAccessTokenHash` nie pasuje / nie istnieje | jw. |
| PORTAL-005 | 401 | Ten link został już wykorzystany. | `clientAccessTokenUsed=true` — token jednorazowy | jw. |
| PORTAL-006 | 401 | Sesja Portalu wygasła lub jest nieprawidłowa — zaloguj się ponownie. | Brak/nieprawidłowy/wygasły token sesji Portalu (`PortalAccessGuard`) na dowolnym żądaniu poza logowaniem — dodany w Zadaniu 9, żeby nie pożyczać `AUTH-003` (moduł AUTH to jawnie "uwierzytelnianie (pracownicy)") | `RBAC.md` §1.2.1 |

---

## USER — użytkownicy i pracownicy

| Kod | HTTP | Treść (PL) | Kiedy występuje |
|---|---|---|---|
| USER-001 | 409 | Ten adres e-mail jest już zajęty. | Próba utworzenia/edycji `User` z `email` już istniejącym w systemie |
| USER-002 | 404 | Nie znaleziono użytkownika. | Odwołanie do nieistniejącego `User.id` |
| USER-003 | 200 *(ostrzeżenie, nie blokada)* | Użytkownik jest właścicielem otwartych spraw. | Dezaktywacja `User` będącego `Case.ownerId` dla spraw aktywnych — dezaktywacja jest dozwolona, ale interfejs powinien pokazać ostrzeżenie i zasugerować przeniesienie spraw (`cases.assign`) |
| USER-004 | 409 | Nie można trwale usunąć użytkownika — ma powiązaną historię działań w systemie. Dezaktywuj konto zamiast usuwać. | `DELETE /users/:id` (`users.delete`, RBAC.md §5) dla konta z jakąkolwiek historią (sprawy, dokumenty, notatki, wiadomości, audyt jako aktor) — dezaktywacja pozostaje dostępna |
| USER-005 | 409 | Nie możesz usunąć własnego konta. | `DELETE /users/:id` (`users.delete`) wywołane na własnym `User.id` zalogowanego administratora |
| USER-006 | 409 | Konto logujące się PIN-em nie może mieć roli Administrator ani Kierownik. | `UsersService.create`/`assignRoles` — próba połączenia `loginMethod=Pin` z rolą `Administrator`/`Kierownik`, w dowolną stronę |
| USER-007 | 422 | PIN nie spełnia wymagań firmy. | `UsersService.create`/reset PIN-u — PIN nie ma dokładnie `pinLength` cyfr albo zawiera znaki inne niż cyfry (`CompanySettings.pinLength`, Ustawienia › Bezpieczeństwo) |
| USER-008 | 409 | Logowanie PIN-em nie jest włączone dla tej firmy (Ustawienia → Bezpieczeństwo). | Próba utworzenia/zresetowania konta `loginMethod=Pin`, gdy `CompanySettings.pinLoginEnabled=false` |
| USER-009 | 409 | To konto loguje się hasłem, nie PIN-em. | `POST /users/:id/reset-pin` wywołane na koncie `loginMethod=Password` — odpowiednikiem dla takich kont jest `POST /users/:id/reset-password` |

---

## CONTRACTOR / MANUFACTURER — kontrahenci i producenci

| Kod | HTTP | Treść (PL) | Kiedy występuje | Powiązana reguła |
|---|---|---|---|---|
| CONTRACTOR-001 | 409 | Kontrahent o podanym NIP już istnieje w tej firmie. | Naruszenie `@@unique([companyId, nip])` | `DATABASE.md` §11 |
| MANUFACTURER-001 | 422 | Ten kontrahent nie ma profilu producenta. | Próba przypisania marki/produktu do `Contractor` bez powiązanego `Manufacturer` | `DATABASE.md` §0 |
| MANUFACTURER-002 | 409 | Ten kontrahent ma już profil producenta. | Próba utworzenia drugiego `Manufacturer` dla tego samego `Contractor` (narusza `@@unique` na `contractorId`) | `DATABASE.md` §12 |
| MANUFACTURER-003 | 409 | Nie można trwale usunąć producenta — ma przypisane produkty lub marki. Dezaktywuj go zamiast usuwać. | `DELETE /manufacturers/:id` (`manufacturers.delete`, RBAC.md §5) dla producenta z choć jednym `Product`/`Brand` — `Product.manufacturerId` jest wymagane, więc usunięcie osierociłoby dane katalogowe |

---

Producent/Dystrybutor + Partnerzy B2B (Faza 2):

| Kod | HTTP | Treść (PL) | Kiedy występuje |
|---|---|---|---|
| PARTNERSHIP-001 | 422 | Wskazana organizacja nie jest producentem ani dystrybutorem. | `POST /partnerships/invite` na organizację `type != ManufacturerDistributor` |
| PARTNERSHIP-002 | 409 | Partnerstwo z tą organizacją już istnieje. | Naruszenie `@@unique([shopCompanyId, distributorCompanyId])` |
| PARTNERSHIP-003 | 403 | Tylko zaproszona organizacja może zaakceptować lub odrzucić partnerstwo. | `POST /partnerships/:id/accept`\|`reject` wołane przez `shopCompanyId` zamiast `distributorCompanyId` |
| PARTNERSHIP-004 | 422 | Wskazana marka nie należy do zapraszanej organizacji. | `brandId` w `POST /partnerships/invite` nie wskazuje `Brand` należącej do samoopisanego `Manufacturer` dystrybutora |
| PARTNERSHIP-005 | 409 | Brak aktywnego partnerstwa obejmującego markę tej sprawy. | `CaseHandoffService.send` — brak `Active` `Partnership`+`PartnershipBrand` dla pary Sklep/Dystrybutor i marki pozycji |
| PARTNERSHIP-006 | 409 | Ta sprawa została już przekazana partnerowi. | Naruszenie `@@unique` na `CaseHandoff.originCaseId` — druga próba przekazania tej samej sprawy |

---

## ORDER — zamówienia i katalog

| Kod | HTTP | Treść (PL) | Kiedy występuje |
|---|---|---|---|
| ORDER-001 | 200 *(informacyjny, nie błąd)* | Nie znaleziono zamówienia o podanym numerze. | Wyszukiwanie w kreatorze zgłoszenia bez trafienia — formularz przechodzi w tryb ręcznego wprowadzania danych, to oczekiwany przepływ, nie awaria |
| ORDER-002 | 409 | Numer zamówienia już istnieje w tej firmie. | Naruszenie `@@unique([companyId, orderNumber])` |

---

## VALIDATION — walidacja ogólna formularzy

| Kod | HTTP | Treść (PL) | Kiedy występuje |
|---|---|---|---|
| VALIDATION-001 | 422 | To pole jest wymagane. | Puste pole oznaczone jako wymagane |
| VALIDATION-002 | 422 | Nieprawidłowy format adresu e-mail. | Walidacja formatu `email` |
| VALIDATION-003 | 422 | Nieprawidłowy numer telefonu. | Walidacja formatu `phone` |
| VALIDATION-004 | 422 | Wymagane zaznaczenie wszystkich zgód. | Formularz zgłoszenia — brak jednej z wymaganych zgód (BR z `docs/source/BUSINESS_RULES.md`, sekcja zgód) |
| VALIDATION-005 | 422 | Nieprawidłowy adres — musi zaczynać się od http:// lub https://. | Walidacja formatu URL (`website`/`privacyPolicyUrl`/`termsUrl` w `UpdateCompanyDto`) |

---

## NOTIFICATION — powiadomienia

| Kod | HTTP | Treść (PL) | Kiedy występuje | Powiązana reguła |
|---|---|---|---|---|
| NOTIFICATION-001 | 502 | Nie udało się wysłać powiadomienia. | Błąd dostawcy e-mail/SMS (zewnętrzna usługa) — `Notification.status=Failed`, `failureReason` wypełnione | `DATABASE.md` §28 |
| NOTIFICATION-002 | 500 | Brak szablonu powiadomienia dla tego zdarzenia. | Próba wysyłki bez pasującego `NotificationTemplate` (`code`+`channel`+`companyId`/globalny) | `DATABASE.md` §27 |

---

## Zasady rozszerzania tego katalogu

1. Nowy kod **zawsze** dostaje kolejny wolny numer w swoim module —
   nigdy nie wstawiany "pomiędzy" istniejącymi.
2. Kody **nigdy nie są usuwane ani przemianowywane** po opublikowaniu w
   API — jeśli reguła biznesowa się zmienia na tyle, że kod przestaje
   mieć sens, oznacza się go jako `deprecated` w komentarzu, nie usuwa.
3. Każdy nowy kod błędu wprowadzany podczas implementacji backendu
   powinien mieć odpowiadający wiersz w tym dokumencie **zanim** trafi do
   kodu — ten plik jest źródłem prawdy, nie odwrotnie (podobnie jak
   `schema.prisma` dla modelu danych).
4. Kody informacyjne/ostrzeżenia (oznaczone HTTP `200` lub `—`) nie
   blokują operacji — służą do przekazania kontekstu klientowi API, nie
   do odrzucenia żądania.
