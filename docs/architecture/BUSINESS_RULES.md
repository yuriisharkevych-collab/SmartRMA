# BUSINESS_RULES.md — Rozszerzenie (Etap architektury)

## Relacja do dokumentu źródłowego

`docs/source/BUSINESS_RULES.md` (BR-001 – BR-061, sekcje 1–12) jest
**punktem wyjścia i wciąż obowiązuje w całości**. Ten dokument go **nie
zastępuje** — kontynuuje numerację (od BR-070) i dodaje sekcje 13–20,
pokrywające obszary, które wyszły podczas prototypowania i etapu
architektury: wieloelementowe reklamacje, katalog produktów/zamówienia,
Portal Klienta, logistyka, RBAC, wielooddziałowość, rozszerzony audyt i
scentralizowane powiadomienia.

Reguły poniżej odwołują się do modelu w `DATABASE.md`, automatu stanów w
`WORKFLOW.md` i uprawnień w `RBAC.md` — ten dokument **nie powiela** ich
treści, tylko wskazuje, gdzie żyją.

---

# 13. Wieloelementowe reklamacje (CaseItem)

## BR-070
Jedna sprawa (`Case`) może dotyczyć więcej niż jednego produktu/egzemplarza
(`CaseItem`) — np. klient reklamuje jednocześnie wózek i fotelik z tego
samego zamówienia. To rozszerzenie względem MVP, gdzie sprawa miała
dokładnie jeden produkt bezpośrednio (patrz `DATABASE.md`, sekcja o `Case`/
`CaseItem`).

## BR-071
Status i decyzja pozostają na poziomie **całej sprawy**, nie per pozycja.
Jeśli poszczególne pozycje wieloelementowej reklamacji wymagają
niezależnego statusu/decyzji (np. jedna pozycja naprawiona, druga
odrzucona), operacyjnie należy je rozdzielić na osobne sprawy — system w
obecnym modelu nie wspiera niezależnego cyklu życia pozycji w ramach
jednej sprawy. To świadome ograniczenie zakresu (patrz `DATABASE.md`),
podlegające rewizji, jeśli praktyka pokaże realną potrzebę.

## BR-072
Każda pozycja (`CaseItem`) ma własne, opcjonalne powiązanie z producentem
(`CaseItem.manufacturerId`) — sugerowane automatycznie z katalogu produktu
(`Product.manufacturerId`), edytowalne przez pracownika. W typowej,
jednoproduktowej sprawie wszystkie dokumenty/decyzje dotyczą tego samego
producenta; przy wieloelementowej sprawie z różnymi producentami pracownik
musi mieć świadomość, że proces (`WORKFLOW.md`) i tak przebiega jako jedna
całość — rozdzielenie na osobne sprawy jest rekomendowane, jeśli producenci
się różnią i mają różne SLA/procedury.

## BR-073
Produkt zastępczy (`ReplacementProduct`) jest przypisany do konkretnej
pozycji (`CaseItem`), nie do całej sprawy — każda pozycja wieloelementowej
reklamacji może mieć własny produkt zastępczy.

---

# 14. Katalog produktów i zamówienia

## BR-074
`Product` reprezentuje **pozycję katalogową** (typ/model produktu), nie
konkretny zakupiony egzemplarz. Konkretny egzemplarz — z numerem seryjnym,
datą zakupu, numerem dowodu zakupu — to `OrderItem`, powiązany z
`Order` (zamówieniem). To zmiana względem MVP — patrz `DATABASE.md` dla
pełnego uzasadnienia.

## BR-075
Rejestracja reklamacji (przez pracownika lub przez klienta w kreatorze
zgłoszenia) powinna w pierwszej kolejności próbować dopasować zgłaszany
produkt do istniejącego `OrderItem` po numerze zamówienia. Jeśli
dopasowanie się powiedzie — dane produktu (model, producent, numer
seryjny, dowód zakupu) uzupełniają się automatycznie i pola stają się
tylko do odczytu (z możliwością ręcznego nadpisania). Jeśli się nie
powiedzie — formularz przechodzi w tryb ręcznego wprowadzania danych
produktu, a nowo utworzony `CaseItem.productId` wskazuje na dopasowaną lub
nowo utworzoną pozycję katalogową.

## BR-076
Marka (`Brand`) jest polem **pomocniczym** przy wyborze producenta, nie
zastępuje bezpośredniego wyboru producenta. Wybranie marki automatycznie
sugeruje (nie wymusza) powiązanego z nią producenta.

---

# 15. Portal Klienta i dostęp klienta

## BR-077
Dostęp klienta do Portalu Klienta odbywa się przez numer sprawy i kod
dostępu (hashowany, `Case.clientAccessCodeHash`) **lub** przez jednorazowy,
bezpieczny link z tokenem (`Case.clientAccessTokenHash`,
`clientAccessTokenUsed`). Klient **nie posiada** konta systemowego
(`User`) — Portal Klienta to odrębny mechanizm dostępu, nie logowanie do
systemu wewnętrznego.

## BR-078
Logowanie do Portalu Klienta jest blokowane po 5 nieudanych próbach
(mechanizm zaimplementowany i przetestowany w prototypie —
`client-login.js`). W docelowym backendzie licznik prób musi być
trzymany server-side (per adres IP i per sprawa), nie w przeglądarce
klienta — prototypowa implementacja w `localStorage` jest świadomie
niewystarczająca dla produkcji (można ją ominąć czyszcząc dane
przeglądarki) i służy wyłącznie do demonstracji UX.

## BR-079
Klient widzi w historii sprawy (`CaseHistory`) wyłącznie wpisy oznaczone
`visibleForCustomer=true`. Domyślna widoczność per typ zdarzenia jest
zdefiniowana w kodzie aplikacji (`CUSTOMER_VISIBLE_ACTIONS` w prototypie) —
zdarzenia wewnętrzne (przypisanie producenta, zmiana właściciela sprawy,
aktualizacja `nextAction`) pozostają ukryte.

## BR-080
Dokumenty (`Document`) mają widoczność `Public`/`Internal`
(`DocumentVisibility`). Tylko dokumenty `Public` są dostępne do pobrania w
Portalu Klienta.

## BR-081
Status sprawy prezentowany klientowi jest **uproszczony** — 5 etapów
ogólnych (Zgłoszona / Przyjęta / W trakcie / Decyzja / Zakończona), nie 14
wewnętrznych statusów `CaseStatus`. Mapowanie żyje w jednym miejscu
(`public-status-mapper.js` w prototypie, docelowo analogiczny moduł/serwis
w backendzie) — Portal Klienta **nigdy** nie odwołuje się bezpośrednio do
wartości `CaseStatus`.

---

# 16. Logistyka

## BR-082
Reguły logistyczne producenta (`ManufacturerLogistics`: kto organizuje
transport, czy wymagane oryginalne opakowanie, koszt kuriera) są
**konfiguracją**, odczytywaną i prezentowaną klientowi/pracownikowi w
momencie rejestracji reklamacji danego producenta. Konkretne zdarzenia
transportowe danej sprawy (`Logistics`) są odrębnymi rekordami — jedna
sprawa może mieć wiele zdarzeń logistycznych (odbiór od klienta, wysyłka
do producenta, zwrot od producenta, ponowna dostawa do klienta).

## BR-083
Jeżeli produkt nie spełnia wymogów stanu/opakowania producenta (BR-021 z
dokumentu źródłowego — produkt czysty, suchy, przygotowany), a klient nie
jest w stanie tego zapewnić, sklep może pobrać opłatę za przygotowanie
produktu (`Case.preparationFeeAccepted` — zgoda klienta zarejestrowana w
momencie zgłoszenia). Wysokość opłaty jest ustalana operacyjnie (w
prototypie: stała kwota 80 zł), docelowo możliwa do skonfigurowania per
`Company` przez `Setting`.

---

# 17. Role i uprawnienia (RBAC)

## BR-084
System ról jest **danymi** (`Role`), nie stałym zbiorem zakodowanym w
aplikacji — pozwala to przypisać użytkownikowi wiele ról jednocześnie,
zgodnie z `docs/source/ROLES_AND_PERMISSIONS.md`. Pełna macierz ról i
uprawnień: `RBAC.md`.

## BR-085
Operacje wymagające podwyższonej odpowiedzialności — zatwierdzenie zwrotu
środków, decyzje w sprawach rękojmi, zamknięcie spraw oznaczonych jako
nietypowe (`Case.isException=true`) — wymagają uprawnienia
`cases.decision.approve`, przypisanego rolom Kierownik i Administrator
(patrz `RBAC.md`).

---

# 18. Wielooddziałowość (Company / Shop)

## BR-086
System jest przygotowany na wielu najemców (`Company`) i wiele
oddziałów/sklepów (`Shop`) na najemcę, ale **MVP uruchamia dokładnie jedną
`Company`** (tworzoną przez seed). Pełna izolacja danych między firmami
(np. globalna unikalność `User.email` **w obrębie całego systemu**, nie
per firma) jest świadomym uproszczeniem MVP — przy realnym
wielonajemcowym wdrożeniu `User.email` powinien być unikalny per
`companyId`, nie globalnie. To zmiana modelu do rozważenia **przed**
uruchomieniem drugiej firmy w systemie, nie teraz.

## BR-087
Przypisanie pracownika do oddziału (`User.shopId`, `Employee.shopId`) jest
obecnie **informacyjne** — nie ogranicza automatycznie widoczności spraw
do oddziału pracownika. Pełne skalowanie uprawnień/widoczności danych do
wielu oddziałów to osobna decyzja biznesowa (patrz `RBAC.md`, uwagi
końcowe).

---

# 19. Audyt (rozszerzenie BR z sekcji 11 dokumentu źródłowego)

## BR-088
Każda operacja zmieniająca dane w systemie jest zapisywana w `AuditLog`
z: kto (`userId`, nullable dla zdarzeń systemowych), kiedy (`createdAt`),
z jakiego adresu IP (`ipAddress`), jaki typ encji i której (`entityType`,
`entityId`), jaka akcja (`action`), oraz **poprzednia i nowa wartość**
zmienionych pól jako dane strukturalne (`previousValue`/`newValue` typu
`Json`, nie opisowy tekst) — to bezpośrednia realizacja wymogu zadania
architektonicznego.

## BR-089
Logowania użytkowników są rejestrowane osobno (`LoginEvent`), nie w
`AuditLog` — żeby nie zaśmiecać dziennika zmian danych częstymi,
jednorodnymi wpisami. `LoginEvent` rejestruje też **nieudane** próby
logowania (`success=false`).

## BR-090
Log audytowy jest **tylko do odczytu** z poziomu aplikacji — żadna rola,
łącznie z Administratorem, nie ma możliwości edycji ani usuwania wpisów
przez interfejs systemu (ewentualna retencja/czyszczenie to operacja
bazodanowa poza aplikacją, zgodna z polityką przechowywania danych z
`docs/source/SECURITY_AND_GDPR.md`).

---

# 20. Powiadomienia (rozszerzenie BR-060/BR-061 dokumentu źródłowego)

## BR-091
Powiadomienia są generowane z szablonów (`NotificationTemplate`), nie jako
tekst zakodowany w logice aplikacji — pozwala to na edycję treści
komunikatów bez zmiany kodu oraz na przyszłą wielojęzyczność (każdy
szablon ma `code` + `channel`, więc dodanie wariantu językowego to nowy
wiersz danych, nie nowa gałąź kodu — analogicznie do `client-labels.js` w
prototypie, który już był budowany z myślą o takiej rozszerzalności).

## BR-092
Pełna lista zdarzeń wyzwalających powiadomienia (rozszerzenie BR-060):
patrz `WORKFLOW.md`, sekcja 6 "Akcje automatyczne", oraz sekcja 7 (kolumna
"Powiadom klienta?"). Kanał `SMS` jest zamodelowany w schemacie
(`NotificationChannel.SMS`) jako przygotowanie na przyszłość — **żadna
funkcjonalność wysyłki SMS nie jest częścią obecnego zakresu**, zgodnie z
poleceniem zadania architektonicznego ("przyszła możliwość SMS").

## BR-093
Powiadomienia systemowe (`NotificationChannel.System`, w aplikacji, nie
e-mail) informują pracowników o zdarzeniach wymagających ich uwagi:
odpowiedź klienta po `OczekiwanieNaKlienta`, przekroczony termin
`nextActionDueDate`, przypomnienie o długim oczekiwaniu na odpowiedź
producenta (rozszerzenie BR-061 o mechanizm dostarczenia, nie tylko
listę zdarzeń).

---

# 21. SLA producentów

## BR-094
Warunki SLA (czas odpowiedzi, czas naprawy, terminy przypomnień i
eskalacji) są konfigurowalne **osobno dla każdego producenta**
(`ManufacturerSLA`, patrz `DATABASE.md` §14a) — różni producenci mają
różne warunki umowne, np.:

| Producent | Odpowiedź | Naprawa | Przypomnienie po | Eskalacja po |
|---|---|---|---|---|
| Producent A | 14 dni | 21 dni | 10 dniach | 14 dniach |
| Producent B | 30 dni | — | — | — |

## BR-095
Brak skonfigurowanej wartości progu (`null`) oznacza, że dany mechanizm
jest **wyłączony** dla tego producenta — nie oznacza wartości domyślnej
ani dziedziczenia z ustawień globalnych. Jeśli w przyszłości pojawi się
potrzeba wartości domyślnej "dla producentów bez skonfigurowanego SLA",
powinna to być jawna decyzja (np. `Setting` `manufacturer.sla.defaultResponseDays`
odczytywana tylko gdy `ManufacturerSLA` dla danego producenta nie
istnieje w ogóle, nie gdy pole jest jawnie ustawione na `null`).

## BR-096
Terminy SLA są liczone od **wejścia sprawy w odpowiedni status**
(`responseDays` od `WyslanaDoProducenta`, `repairDays` od
`RealizacjaDecyzji`), nie od utworzenia sprawy — patrz `WORKFLOW.md` §6,
pozycja 6.

---

# 22. Walidacja procesu reklamacji (Zadanie 6)

**Uwaga o numeracji:** `ERROR_CODES.md` (CASE-001, CASE-007) już przed tym
krokiem odwoływał się do `BR-097`/`BR-098` dla dokładnie tych dwóch reguł —
formalizacja poniżej **wypełnia** oczekiwane, wcześniej nieopisane numery,
zamiast rezerwować nowe. Zobacz uwagę w `DECISIONS.md` ("Zadanie 6") o
renumeracji reguł Zadania 5, które omyłkowo zajęły te same numery.

## BR-097
Sprawa z `submissionMode=BezposrednioDoProducenta` jest dopuszczalna
**wyłącznie** dla `complaintType=Warranty` — rękojmia zawsze idzie przez
sklep, z mocy prawa (patrz `WORKFLOW.md` §1). Próba utworzenia sprawy
`StatutoryWarranty` + `BezposrednioDoProducenta` jest odrzucana przez
warstwę aplikacji (`ERROR_CODES.md` CASE-007). Reguła istniała w prozie
`WORKFLOW.md` §1 i jako ograniczenie aplikacyjne w `DATABASE.md` §19 od
etapu architektury, ale nie miała dotąd numeru `BR`.

## BR-098
Zmiana `Case.status` musi być zgodna z dozwolonymi przejściami automatu
stanów właściwej ścieżki (`complaintType`/`submissionMode`) opisanego w
`WORKFLOW.md` §2 i zakodowanego maszynowo w `STATE_MACHINE.md`. Próba
przejścia nieosiągalnego z bieżącego statusu jest odrzucana
(`ERROR_CODES.md` CASE-001). Reguła jest sformułowana wprost w notce
projektowej na początku `WORKFLOW.md` ("dozwolone przejścia... walidowane
w warstwie aplikacji"), ale nie miała dotąd numeru `BR`.

---

# 23. Ujednolicenie modelu domenowego (Zadanie 5)

## BR-099
Producent (`Manufacturer`) jest odbiorcą powiadomień
(`NotificationRecipientType.Manufacturer`), nie tylko podmiotem opisywanym
w treści powiadomień do pracownika. Dotyczy to w szczególności przypomnień
o przekroczonym terminie SLA (`WORKFLOW.md` §6 poz. 7, `NOTIFICATIONS.md`
§5–7), które istniały jako funkcjonalność opisana w dokumentacji od etapu
SLA producentów, zanim model formalnie pozwalał wyrazić tego odbiorcę.

## BR-100
Każda zmiana statusu zdarzenia logistycznego (`Logistics.status`) oraz
każda automatyczna zmiana priorytetu sprawy wynikająca z eskalacji SLA
(`Case.priority`, `WORKFLOW.md` §6 poz. 8) pozostawia wpis w `CaseHistory`
(`CaseHistoryAction.LogisticsStatusChanged` / `PriorityChanged`) —
domyka to wymóg, żeby **każda istotna operacja** miała ślad w historii
sprawy (kontynuacja BR-002 z dokumentu źródłowego), wcześniej spełniany
tylko częściowo: obie operacje zmieniały dane systemu, ale nie miały
odpowiednika w zamkniętym enumie historii.

## BR-101
Wydanie i zwrot produktu zastępczego (`ReplacementProduct.issuedAt`/
`returnedAt`) są zdarzeniami widocznymi dla klienta w historii sprawy
(`CaseHistory.visibleForCustomer=true` dla akcji
`ReplacementProductIssued`/`ReplacementProductReturned`, które już
istniały w enumie, ale nie miały odpowiednika w `WORKFLOW.md`) — klient
fizycznie posiada produkt zastępczy i musi wiedzieć, kiedy go otrzymał
oraz jaki jest planowany termin zwrotu, patrz `WORKFLOW.md` §6 poz. 15–16.

---

# 24. Kompletność dokumentacji przejść i załączników (Zadanie 6)

## BR-102
Przejście `Weryfikacja` → `GotowaDoWysylki` (`Warranty`) lub
`WeryfikacjaWewnetrzna` (`StatutoryWarranty`) wymaga **kompletnej
dokumentacji pozycji reklamacji**: numeru seryjnego, jeśli
`Manufacturer.requiresSerialNumber=true` (`ERROR_CODES.md` CASE-004);
numeru ramy, jeśli `requiresFrameNumber=true` (CASE-005); dowodu zakupu,
jeśli `requiresProofOfPurchase=true` i brak dopasowania do `OrderItem`
(CASE-006); minimum 2 zdjęć uszkodzenia (FILE-004); liczby/rozmiaru
załączników w granicach `Manufacturer.maxPhotos`/`maxAttachmentSizeMb`
(FILE-001/FILE-002). Zbiorczo egzekwowane jako CASE-002 "Brak wymaganych
dokumentów" — patrz `WORKFLOW.md` §8.

## BR-103
Sprawa w statusie końcowym (`Zamknieta`/`Anulowana`/`Zarchiwizowana` —
patrz `WORKFLOW.md` §2.3 "status aktywny") nie może być dalej
modyfikowana (status, decyzja, dokumenty, notatki) — patrz
`ERROR_CODES.md` CASE-008, `WORKFLOW.md` §8.

---

# 25. Widoczność pól wewnętrznych sprawy (Zadanie 6)

## BR-104
Zmiana opiekuna sprawy (`Case.ownerId`, `cases.assign`) i ręczna edycja
`nextAction`/`nextActionDueDate` (`cases.edit`) to pola **wyłącznie
operacyjne/wewnętrzne** — obie zmiany są zapisywane w `CaseHistory`
(`OwnerChanged`/`NextActionUpdated`, `WORKFLOW.md` §6 poz. 17/22), ale
zawsze z `visibleForCustomer=false`, zgodnie z ogólną zasadą BR-079
(klient widzi wyłącznie wpisy jawnie oznaczone jako publiczne). Klient nie
ma potrzeby ani prawa wiedzieć, **który konkretnie pracownik** aktualnie
prowadzi jego sprawę wewnętrznie, poza ogólnymi danymi opiekuna
udostępnianymi celowo w Portalu Klienta (`RBAC.md` §3a, wiersz "Podgląd
danych opiekuna sprawy").

---

# 26. Kompletność opisu sprawy (Zadanie 9)

## BR-105
`Case.description` i `Case.requestedResolution` są wymagane przez warstwę
aplikacji dla **każdej** sprawy utworzonej jakąkolwiek ścieżką **poza**
`submissionMode=BezposrednioDoProducenta` ze zgodą klienta na monitoring
(`WORKFLOW.md` §3.2) — tam producent zbiera opis usterki bezpośrednio,
sklep go nie zna w momencie utworzenia sprawy, więc oba pola pozostają
`NULL` (nie syntetyczny tekst zastępczy). W `schema.prisma` oba pola są
nullable (`String?`) — baza danych celowo nie wymusza tej zależności
warunkowej (nie potrafi, tak jak `submissionMode`/`complaintType` z
BR-097), egzekwuje ją wyłącznie walidacja przy tworzeniu sprawy. Decyzja
końcowa — patrz `DECISIONS.md` ("Zadanie 9 — Zamrożenie architektury").
