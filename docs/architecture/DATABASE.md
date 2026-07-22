# DATABASE.md — SmartRMA AI

## Kompletny model relacyjnej bazy danych

Ten dokument opisuje **każdą** tabelę systemu: pola i typy danych, klucz
główny, klucze obce, relacje, indeksy i ograniczenia. Źródło prawdy to
`apps/api/prisma/schema.prisma` — ten dokument jest jego czytelnym,
narracyjnym odpowiednikiem, nie odwrotnie (przy rozbieżności wygrywa
schemat).

**Historia dokumentu:** poprzednia wersja (z pierwszego etapu
architektury, bez podziału Kontrahent/Producent) jest zachowana jako
`DATABASE.v1-etap-architektury.md.reference`. `docs/source/DATABASE.md`
to oryginalna specyfikacja źródłowa — nadal obowiązuje jako punkt wyjścia
wymagań biznesowych, ten dokument ją rozszerza i domyka.

**Terminologia:** zachowano nazewnictwo `Case`/`CaseItem`/`CaseHistory`/
`Document` wypracowane w toku całego projektu, zamiast dosłownych
`Complaint`/`ComplaintItem`/`ComplaintStatusHistory`/`Attachment` z treści
zadań. Pełne uzasadnienie: patrz poprzednia wersja tego dokumentu,
sekcja "Terminologia" (bez zmian).

---

## 0. Nowość w tej wersji: rozdzielenie Kontrahent / Producent

Poprzedni model miał dane firmowe (nazwa, NIP, adres, kontakt) bezpośrednio
na `Manufacturer`. To zadanie wprost wymienia **Kontrahentów** i
**Producentów** jako dwie osobne pozycje listy modułów — co odzwierciedla
realną sytuację biznesową: nie każdy partner biznesowy sklepu obsługuje
reklamacje (np. firma logistyczna, dostawca opakowań), a niektórzy
kontrahenci mogą pełnić więcej niż jedną rolę.

**Decyzja:** `Contractor` (Kontrahent) to **ogólna** encja partnera
biznesowego — trzyma dane firmowe. `Manufacturer` (Producent) to
**wyspecjalizowany profil** kontrahenta, relacja **1:1 opcjonalna**,
dodający wyłącznie dane potrzebne do obsługi reklamacji (sposób
zgłoszenia, procedura, logistyka, automatyzacja). Kontrahent bez profilu
`Manufacturer` istnieje w systemie (np. jako firma logistyczna), ale nie
może zostać przypisany do żadnej marki/produktu — te relacje idą przez
`Manufacturer`, nie przez `Contractor` bezpośrednio.

To jest wzorzec **rozszerzenia encji przez relację 1:1** (podobny do
`User`/`Employee` z poprzedniego etapu — nie każdy `User` to `Employee`,
tu analogicznie: nie każdy `Contractor` to `Manufacturer`).

---

## 1. Zasady projektowe (bez zmian względem poprzedniej wersji)

1. Wszystkie klucze główne to **UUID** (`@default(uuid())`).
2. **`companyId`** jako korzeń dzierżawy (tenant) na encjach operacyjnych.
3. **Sekrety nigdy jawnym tekstem** — hashe dla haseł/kodów/tokenów,
   szyfrowanie aplikacyjne dla `Manufacturer.portalPasswordEncrypted`
   (musi być odzyskiwalne, więc to nie hash).
4. **Miękkie usuwanie przez `active`**, nie `DELETE`, dla encji o
   znaczeniu historycznym.
5. **`Decimal(10,2)`** dla kwot pieniężnych, nigdy `Float`.
6. **`Json`** tylko tam, gdzie kształt danych jest z natury zmienny
   (`AuditLog.previousValue/newValue`, `NotificationTemplate.variables`,
   `Setting.value`) — nie jako sposób na uniknięcie projektowania
   właściwych kolumn/tabel.

---

## Spis tabel wg modułów z zadania

| Moduł z zadania | Tabela(e) |
|---|---|
| Użytkownicy | `User` |
| Role | `Role`, `RolePermission`, `UserRoleAssignment` |
| Uprawnienia | `Permission` |
| Pracownicy | `Employee`, `LoginEvent` |
| Klienci | `Customer` |
| Sklepy | `Shop` (+ `Company` jako korzeń dzierżawy) |
| Kontrahenci | `Contractor` |
| Producenci | `Manufacturer`, `ManufacturerLogistics`, `ManufacturerAutomation`, `ManufacturerSLA` |
| Marki | `Brand` |
| Produkty | `Product` |
| Zamówienia | `Order`, `OrderItem` |
| Reklamacje | `Case` |
| Pozycje reklamacji | `CaseItem`, `ReplacementProduct` |
| Załączniki | `Document` |
| Historia statusów | `CaseHistory` |
| Notatki | `Note` |
| Wiadomości | `Message` |
| Logistyka | `Logistics` |
| Powiadomienia | `Notification` |
| Szablony wiadomości | `NotificationTemplate` |
| Audit Log | `AuditLog` |
| Ustawienia systemowe | `Setting` |

---

# 1. Company

Korzeń dzierżawy (tenant) — nie wymieniona wprost w liście modułów zadania,
ale niezbędna jako właściciel `Shop` (wielooddziałowość) i całej reszty
danych. Kontynuacja decyzji z poprzedniego etapu architektury.

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| name | String | nie |
| nip | String | tak |
| address | String | tak |
| email | String | tak |
| phone | String | tak |
| active | Boolean (domyślnie `true`) | nie |
| createdAt | DateTime | nie |
| updatedAt | DateTime (auto) | nie |

**Klucz główny:** `id`.
**Klucze obce:** brak (korzeń hierarchii).
**Relacje:** 1:N ze wszystkimi tabelami operacyjnymi (`Shop`, `User`,
`Employee`, `Customer`, `Contractor`, `Manufacturer`, `Brand`, `Product`,
`Order`, `Case`, `Role`, `NotificationTemplate`, `Notification`,
`AuditLog`, `Setting`).
**Indeksy:** `@@index([name])`.
**Ograniczenia:** brak dodatkowych — `name` wymagane (`NOT NULL`).

---

# 2. Shop (Sklepy)

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| companyId | UUID | nie |
| name | String | nie |
| address, city, postalCode, phone, email | String | tak |
| active | Boolean | nie |
| createdAt | DateTime | nie |

**Klucz główny:** `id`.
**Klucze obce:** `companyId → Company.id`.
**Relacje:** N:1 `Company`. 1:N `User`, `Employee`, `Order`, `Case`.
**Indeksy:** `@@index([companyId])`.
**Ograniczenia:** `companyId` wymagane (`ON DELETE` — restrykcyjnie:
usunięcie firmy z aktywnymi sklepami powinno być blokowane na poziomie
aplikacji, nie kaskadowe; Prisma domyślnie `Restrict` dla relacji
wymaganych, co jest tu pożądanym zachowaniem).

---

# 3. Role

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| companyId | UUID | tak (`null` = rola systemowa) |
| name | String | nie |
| code | String | nie |
| description | String | tak |
| isSystem | Boolean | nie |
| createdAt | DateTime | nie |

**Klucz główny:** `id`.
**Klucze obce:** `companyId → Company.id` (opcjonalne).
**Relacje:** N:1 `Company` (opcjonalna). 1:N `RolePermission`,
`UserRoleAssignment`.
**Indeksy:** brak dodatkowego poza unikalnym złożonym (patrz niżej —
Postgres tworzy indeks automatycznie dla `@@unique`).
**Ograniczenia:** `@@unique([companyId, code])` — kod roli unikalny w
obrębie firmy (rola systemowa ma `companyId=null`, więc jej `code` jest
unikalny globalnie wśród ról systemowych).

---

# 4. Permission

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| code | String | nie |
| module | String | nie |
| description | String | nie |

**Klucz główny:** `id`.
**Klucze obce:** brak.
**Relacje:** 1:N `RolePermission`.
**Indeksy:** `@@index([module])`.
**Ograniczenia:** `code` **unikalny globalnie** (`@unique`) — pełna lista
kodów w `RBAC.md`.

---

# 5. RolePermission (tabela łącząca N:M)

**Pola:** `roleId` (UUID), `permissionId` (UUID) — brak własnego `id`.
**Klucz główny:** złożony, `@@id([roleId, permissionId])`.
**Klucze obce:** `roleId → Role.id`, `permissionId → Permission.id`.
**Relacje:** N:1 `Role`, N:1 `Permission` (realizuje N:M `Role`↔`Permission`).
**Indeksy:** klucz złożony pełni też rolę indeksu; opcjonalnie dodatkowy
indeks na `permissionId` osobno, jeśli zapytania "które role mają to
uprawnienie" okażą się częste (nieujęte w MVP schematu — łatwa migracja
addytywna).
**Ograniczenia:** para `(roleId, permissionId)` unikalna z definicji
klucza głównego — nie da się przypisać tego samego uprawnienia do roli
dwukrotnie.

---

# 6. UserRoleAssignment (tabela łącząca N:M)

**Pola:** `userId` (UUID), `roleId` (UUID), `assignedAt` (DateTime).
**Klucz główny:** złożony, `@@id([userId, roleId])`.
**Klucze obce:** `userId → User.id`, `roleId → Role.id`.
**Relacje:** N:1 `User`, N:1 `Role` (realizuje N:M — wiele ról na
użytkownika, patrz `RBAC.md`).
**Indeksy:** klucz złożony. Rozważyć osobny indeks na `roleId` przy
zapytaniach "wszyscy użytkownicy z tą rolą" na dużą skalę.
**Ograniczenia:** unikalność pary z klucza głównego — ten sam użytkownik
nie może mieć tej samej roli przypisanej dwukrotnie.

---

# 7. User (Użytkownicy)

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| companyId | UUID | nie |
| shopId | UUID | tak |
| firstName, lastName | String | nie |
| email | String | nie |
| passwordHash | String | nie |
| active | Boolean | nie |
| lastLoginAt | DateTime | tak |
| createdAt | DateTime | nie |

**Klucz główny:** `id`.
**Klucze obce:** `companyId → Company.id`, `shopId → Shop.id` (opcjonalny).
**Relacje:** N:1 `Company`, N:1 `Shop`. N:M `Role` (przez
`UserRoleAssignment`). 1:1 `Employee` (opcjonalne). 1:N: `ownedCases`,
`decidedCases` (obie do `Case`, relacje nazwane — patrz §12), `Document`
(`uploadedDocuments`), `CaseHistory`, `Note`, `Message`, `AuditLog`,
`LoginEvent`.
**Indeksy:** `@@index([email])`, `@@index([companyId])`.
**Ograniczenia:** `email` **unikalny globalnie** (`@unique`) — patrz uwaga
w `BUSINESS_RULES.md` BR-086 o tym, że przy realnym multi-tenant to
powinno stać się unikalnością per `companyId`, nie globalną. `passwordHash`
nigdy nie przechowuje jawnego hasła.

---

# 8. Employee (Pracownicy)

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| userId | UUID | nie |
| companyId | UUID | nie |
| shopId | UUID | tak |
| employeeNumber | String | tak |
| position | String | tak |
| hireDate | DateTime | tak |
| terminationDate | DateTime | tak |
| active | Boolean | nie |

**Klucz główny:** `id`.
**Klucze obce:** `userId → User.id`, `companyId → Company.id`,
`shopId → Shop.id`.
**Relacje:** 1:1 `User` (opcjonalne z perspektywy `User` — nie każdy
`User` ma `Employee`). N:1 `Company`, N:1 `Shop`.
**Indeksy:** `@@index([companyId])`.
**Ograniczenia:** `userId` **unikalny** (`@unique`) — wymusza relację 1:1.

---

# 9. LoginEvent

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| userId | UUID | nie |
| ipAddress | String | tak |
| userAgent | String | tak |
| success | Boolean (domyślnie `true`) | nie |
| createdAt | DateTime | nie |

**Klucz główny:** `id`.
**Klucze obce:** `userId → User.id`.
**Relacje:** N:1 `User`.
**Indeksy:** `@@index([userId])`, `@@index([createdAt])`.
**Ograniczenia:** brak dodatkowych — celowo "otwarta" tabela zapisu
zdarzeń (insert-only, bez modyfikacji po zapisie).

---

# 10. Customer (Klienci)

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| companyId | UUID | nie |
| firstName, lastName | String | nie |
| phone | String | nie |
| email, address, notes | String | tak |
| createdAt | DateTime | nie |

**Klucz główny:** `id`.
**Klucze obce:** `companyId → Company.id`.
**Relacje:** N:1 `Company`. 1:N `Order`, `Case`.
**Indeksy:** `@@index([companyId])`, `@@index([lastName])`,
`@@index([phone])`, `@@index([email])` — wszystkie wspierają wyszukiwanie
klienta przy rejestracji reklamacji (BR-011).
**Ograniczenia:** brak unikalności na `email`/`phone` — ten sam klient
teoretycznie może mieć wiele rekordów przy braku deduplikacji (świadome
uproszczenie prototypu, patrz `DECISIONS.md`); deduplikacja to logika
aplikacji (wyszukiwanie przed utworzeniem), nie ograniczenie bazy.

---

# 11. Contractor (Kontrahenci) — NOWOŚĆ

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| companyId | UUID | nie |
| name | String | nie |
| category | enum `ContractorCategory` (Manufacturer/Distributor/LogisticsPartner/Supplier/Other) | nie, domyślnie `Manufacturer` |
| country, nip, address | String | tak |
| contactEmail, contactPhone, contactPerson | String | tak |
| active | Boolean | nie |
| createdAt | DateTime | nie |

**Klucz główny:** `id`.
**Klucze obce:** `companyId → Company.id`.
**Relacje:** N:1 `Company`. 1:1 `Manufacturer` (`manufacturerProfile`,
opcjonalne — patrz §0).
**Indeksy:** `@@index([companyId])`, `@@index([name])`.
**Ograniczenia:** `@@unique([companyId, nip])` — ten sam NIP nie może
wystąpić dwukrotnie w obrębie firmy (ale `nip` samo w sobie jest
nullable — kontrahenci zagraniczni bez polskiego NIP, lub dane niepełne
na etapie wprowadzania, są dopuszczalne; unikalność egzekwowana tylko
gdy `nip` wypełnione, zgodnie ze standardowym zachowaniem unikalnych
indeksów Postgres wobec `NULL`).

---

# 12. Manufacturer (Producenci)

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| contractorId | UUID | nie |
| companyId | UUID | nie (denormalizacja) |
| submissionMethod | enum `SubmissionMethod` | nie, domyślnie `Email` |
| portalUrl, portalLogin | String | tak |
| portalPasswordEncrypted | String | tak |
| complaintProcedure, requiredDocumentsNote, requiredPhotosNote, requiredVideosNote | String | tak |
| requiresSerialNumber, requiresFrameNumber | Boolean | nie, domyślnie `false` |
| requiresProofOfPurchase | Boolean | nie, domyślnie `true` |
| maxPhotos | Int | nie, domyślnie `6` |
| maxAttachmentSizeMb | Int | nie, domyślnie `15` |
| active | Boolean | nie |
| createdAt | DateTime | nie |

**Klucz główny:** `id`.
**Klucze obce:** `contractorId → Contractor.id`, `companyId → Company.id`.
**Relacje:** 1:1 `Contractor` (odwrotność `manufacturerProfile`). N:1
`Company`. 1:1 `ManufacturerLogistics`, `ManufacturerAutomation`,
`ManufacturerSLA`. 1:N `Brand`, `Product`, `CaseItem`.
**Indeksy:** `@@index([companyId])`.
**Ograniczenia:** `contractorId` **unikalny** (`@unique`) — wymusza
relację 1:1 z `Contractor` (jeden kontrahent ma co najwyżej jeden profil
producenta).

---

# 13. ManufacturerLogistics

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| manufacturerId | UUID | nie |
| returnAddress | String | tak |
| transportOrganizer | enum `TransportOrganizer` (Klient/Sklep/Producent) | nie, domyślnie `Klient` |
| manufacturerProvidesLabel, shopCanOrderCourier | Boolean | nie, domyślnie `false` |
| shopCourierCost | Decimal(10,2) | nie, domyślnie `0` |
| originalPackagingRequired, substitutePackagingAllowed | Boolean | nie, domyślnie `true` |
| transportProtectionNote, productConditionNote | String | tak |

**Klucz główny:** `id`.
**Klucze obce:** `manufacturerId → Manufacturer.id`.
**Relacje:** 1:1 `Manufacturer`.
**Indeksy:** unikalny indeks na `manufacturerId` (z ograniczenia niżej).
**Ograniczenia:** `manufacturerId` **unikalny** (`@unique`) — wymusza 1:1.

---

# 14. ManufacturerAutomation

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| manufacturerId | UUID | nie |
| autoEmailEnabled, autoCloseEnabled | Boolean | nie, domyślnie `false` |
| autoCloseDays | Int | nie, domyślnie `30` |

**Klucz główny:** `id`.
**Klucze obce:** `manufacturerId → Manufacturer.id`.
**Relacje:** 1:1 `Manufacturer`.
**Indeksy:** unikalny indeks na `manufacturerId`.
**Ograniczenia:** `manufacturerId` **unikalny** (`@unique`).

> **Zmiana względem poprzedniej wersji:** pola `autoReminders`/
> `autoEscalation` (booleany) zostały **usunięte** z tej tabeli — zastąpione
> przez konkretne progi dniowe w nowej tabeli `ManufacturerSLA` (§14a).
> Dwa niezależne pola (flaga włącz/wyłącz + osobny próg dniowy gdzie
> indziej) tworzyłyby możliwość niespójnego stanu (`autoReminders=true`,
> ale brak zdefiniowanego progu) — jedno nullable pole (`null` = wyłączone)
> eliminuje tę możliwość strukturalnie, nie tylko przez walidację.

---

# 14a. ManufacturerSLA — NOWOŚĆ (SLA producenta)

Brakujący moduł zgłoszony w code review: różni producenci mają różne
warunki SLA (czas odpowiedzi, czas naprawy, terminy przypomnień i
eskalacji) — musi to być konfigurowalne **per producent**, nie globalnie.

**Pola:**
| Pole | Typ | Null? | Znaczenie |
|---|---|---|---|
| id | UUID | nie | |
| manufacturerId | UUID | nie | |
| responseDays | Int | tak | oczekiwany czas odpowiedzi producenta (liczony od wejścia sprawy w `WyslanaDoProducenta`) |
| repairDays | Int | tak | oczekiwany czas realizacji decyzji (liczony od wejścia w `RealizacjaDecyzji`) |
| reminderAfterDays | Int | tak | po ilu dniach bez odpowiedzi wysłać przypomnienie; `null` = przypomnienia wyłączone |
| escalationAfterDays | Int | tak | po ilu dniach eskalować do Kierownika; `null` = eskalacja wyłączona |
| createdAt, updatedAt | DateTime | nie | |

**Klucz główny:** `id`.
**Klucze obce:** `manufacturerId → Manufacturer.id`.
**Relacje:** 1:1 `Manufacturer`.
**Indeksy:** unikalny indeks na `manufacturerId`.
**Ograniczenia:** `manufacturerId` **unikalny** (`@unique`) — jeden zestaw
SLA na producenta. Wszystkie progi dniowe **nullable niezależnie od
siebie** — producent może mieć skonfigurowany `responseDays` bez
`reminderAfterDays` (np. Producent B z przykładu w `DECISIONS.md`: sam
termin odpowiedzi, bez przypomnień). Egzekwowanie tych progów (kiedy
faktycznie wysłać przypomnienie/eskalację) to zadanie cykliczne w
backendzie, opisane w `WORKFLOW.md` §6.

**Przykład danych (z code review):**

| Producent | responseDays | repairDays | reminderAfterDays | escalationAfterDays |
|---|---|---|---|---|
| Producent A | 14 | 21 | 10 | 14 |
| Producent B | 30 | `null` | `null` | `null` |

---

# 15. Brand (Marki)

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| companyId | UUID | nie |
| manufacturerId | UUID | nie |
| name | String | nie |
| active | Boolean | nie |

**Klucz główny:** `id`.
**Klucze obce:** `companyId → Company.id`, `manufacturerId → Manufacturer.id`.
**Relacje:** N:1 `Company`, N:1 `Manufacturer` (jeden producent — wiele
marek). 1:N `Product`.
**Indeksy:** `@@index([companyId])`, `@@index([manufacturerId])`.
**Ograniczenia:** brak unikalności na `name` — dwie różne marki (różnych
producentów) teoretycznie mogą nazywać się tak samo; unikalność per
producent (`@@unique([manufacturerId, name])`) jest rozsądną przyszłą
migracją addytywną, jeśli okaże się potrzebna operacyjnie.

---

# 16. Product (Produkty)

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| companyId | UUID | nie |
| manufacturerId | UUID | nie |
| brandId | UUID | tak |
| name | String | nie |
| sku, category | String | tak |
| active | Boolean | nie |
| createdAt | DateTime | nie |

**Klucz główny:** `id`.
**Klucze obce:** `companyId → Company.id`, `manufacturerId → Manufacturer.id`,
`brandId → Brand.id` (opcjonalny).
**Relacje:** N:1 `Company`, `Manufacturer`, `Brand`. 1:N `OrderItem`,
`CaseItem`.
**Indeksy:** `@@index([companyId])`, `@@index([manufacturerId])`,
`@@index([name])`.
**Ograniczenia:** brak unikalności na `sku` w obecnej wersji — do
rozważenia `@@unique([companyId, sku])`, jeśli SKU ma być identyfikatorem
biznesowym (nieujęte, bo prototyp nie operował na SKU).

---

# 17. Order (Zamówienia)

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| companyId | UUID | nie |
| shopId | UUID | tak |
| customerId | UUID | nie |
| orderNumber | String | nie |
| orderDate | DateTime | nie |
| totalAmount | Decimal(10,2) | tak |
| currency | String | nie, domyślnie `"PLN"` |
| createdAt | DateTime | nie |

**Klucz główny:** `id`.
**Klucze obce:** `companyId → Company.id`, `shopId → Shop.id` (opcjonalny),
`customerId → Customer.id`.
**Relacje:** N:1 `Company`, `Shop`, `Customer`. 1:N `OrderItem`.
**Indeksy:** `@@index([customerId])`.
**Ograniczenia:** `@@unique([companyId, orderNumber])` — numer zamówienia
unikalny w obrębie firmy (nie globalnie — różne firmy mogą mieć
zamówienie `ZAM/2026/001`).

---

# 18. OrderItem

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| orderId | UUID | nie |
| productId | UUID | nie |
| quantity | Int | nie, domyślnie `1` |
| unitPrice | Decimal(10,2) | tak |
| serialNumber, frameNumber, invoiceNumber | String | tak |

**Klucz główny:** `id`.
**Klucze obce:** `orderId → Order.id`, `productId → Product.id`.
**Relacje:** N:1 `Order`, `Product`. 1:N `CaseItem` (jedna pozycja
zamówienia może być podstawą wielu reklamacji w czasie — np. produkt
reklamowany, naprawiony, potem reklamowany ponownie).
**Indeksy:** `@@index([orderId])`, `@@index([productId])`,
`@@index([serialNumber])`.
**Ograniczenia:** brak unikalności na `serialNumber` na poziomie bazy —
walidacja "czy numer seryjny już istnieje" to logika aplikacji
(wspomaga, nie blokuje — ten sam numer seryjny mógłby teoretycznie
wystąpić w danych błędnie wprowadzonych ręcznie, baza nie powinna tego
uniemożliwiać).

---

# 19. Case (Reklamacje)

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| companyId | UUID | nie |
| shopId | UUID | tak |
| caseNumber | String | nie |
| customerId | UUID | nie |
| ownerId | UUID | tak |
| complaintType | enum `ComplaintType` (Warranty/StatutoryWarranty) | nie |
| submissionMode | enum `SubmissionMode` (PrzezSklep/BezposrednioDoProducenta) | nie, domyślnie `PrzezSklep` |
| source | enum `ComplaintSource` | nie, domyślnie `SklepStacjonarny` |
| requestedResolution, description | String | nie |
| customerStatement | String | tak |
| status | enum `CaseStatus` (15 wartości — patrz `WORKFLOW.md`) | nie, domyślnie `Nowa` |
| priority | enum `CasePriority` | nie, domyślnie `Normalny` |
| decision | enum `Decision` | tak |
| decisionAt | DateTime | tak |
| decisionByUserId | UUID | tak |
| nextAction | String | tak |
| nextActionDueDate | DateTime | tak |
| requiresManagerApproval, isException | Boolean | nie, domyślnie `false` |
| deliveryAddress | String | tak |
| courierRequested, preparationFeeAccepted | Boolean | nie, domyślnie `false` |
| clientPortalEnabled | Boolean | nie, domyślnie `false` |
| clientAccessCodeHash, clientAccessTokenHash | String | tak |
| clientAccessTokenUsed | Boolean | nie, domyślnie `false` |
| clientLastLoginAt | DateTime | tak |
| createdAt | DateTime | nie |
| closedAt, cancelledAt, archivedAt | DateTime | tak |

**Klucz główny:** `id`.
**Klucze obce:** `companyId → Company.id`, `shopId → Shop.id` (opcjonalny),
`customerId → Customer.id`, `ownerId → User.id` (opcjonalny, relacja
nazwana `CaseOwner`), `decisionByUserId → User.id` (opcjonalny, relacja
nazwana `CaseDecisionBy`).
**Relacje:** N:1 `Company`, `Shop`, `Customer`, `User`×2 (nazwane, patrz
wyżej — dwie różne relacje do tej samej tabeli wymagają jawnej nazwy w
Prisma, żeby uniknąć niejednoznaczności). 1:N `CaseItem`, `Document`,
`CaseHistory`, `Note`, `Message`, `Logistics`, `Notification`.
**Indeksy:** `@@index([companyId])`, `@@index([caseNumber])`,
`@@index([status])`, `@@index([ownerId])`, `@@index([createdAt])`.
**Ograniczenia:** `caseNumber` **unikalny globalnie** (`@unique`, format
`RMA/{rok}/{sekwencja}`). Ograniczenie biznesowe (aplikacyjne, nie bazy
danych — enumy nie potrafią wyrazić zależności warunkowej):
`submissionMode=BezposrednioDoProducenta` dopuszczalne tylko przy
`complaintType=Warranty` (patrz `WORKFLOW.md` §1).

---

# 20. CaseItem (Pozycje reklamacji)

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| caseId | UUID | nie |
| orderItemId | UUID | tak |
| productId | UUID | nie |
| manufacturerId | UUID | tak |
| description | String | nie |
| quantity | Int | nie, domyślnie `1` |

**Klucz główny:** `id`.
**Klucze obce:** `caseId → Case.id`, `orderItemId → OrderItem.id`
(opcjonalny), `productId → Product.id`, `manufacturerId → Manufacturer.id`
(opcjonalny).
**Relacje:** N:1 `Case`, `OrderItem` (opcjonalna), `Product`,
`Manufacturer` (opcjonalna). 1:1 `ReplacementProduct` (opcjonalne). 1:N
`Document`.
**Indeksy:** `@@index([caseId])`, `@@index([productId])`.
**Ograniczenia:** `productId` **wymagane** nawet gdy `orderItemId` puste
(patrz `DATABASE.md` poprzedniej wersji — fallback/denormalizacja).

---

# 21. ReplacementProduct

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| caseItemId | UUID | nie |
| productIdentifier | String | nie |
| issuedAt | DateTime | nie |
| plannedReturnAt, returnedAt | DateTime | tak |
| conditionOnReturn, notes | String | tak |

**Klucz główny:** `id`.
**Klucze obce:** `caseItemId → CaseItem.id`.
**Relacje:** 1:1 `CaseItem`.
**Indeksy:** unikalny indeks na `caseItemId`.
**Ograniczenia:** `caseItemId` **unikalny** (`@unique`) — co najwyżej
jeden produkt zastępczy na pozycję reklamacji.

---

# 22. CaseHistory (Historia statusów)

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| caseId | UUID | nie |
| userId | UUID | tak |
| action | enum `CaseHistoryAction` (18 wartości) | nie |
| previousValue, newValue | String | tak |
| visibleForCustomer | Boolean | nie, domyślnie `false` |
| createdAt | DateTime | nie |

**Klucz główny:** `id`.
**Klucze obce:** `caseId → Case.id`, `userId → User.id` (opcjonalny —
wpisy systemowe).
**Relacje:** N:1 `Case`, `User` (opcjonalna).
**Indeksy:** `@@index([caseId])`.
**Ograniczenia:** brak `UPDATE`/`DELETE` z poziomu aplikacji — tabela
insert-only (niemodyfikowalny dziennik biznesowy), egzekwowane w warstwie
usług backendu, nie jako ograniczenie bazy danych (Postgres nie ma
natywnego "insert-only"; alternatywa: trigger `BEFORE UPDATE/DELETE RAISE
EXCEPTION`, do rozważenia przy hardening bezpieczeństwa).

---

# 23. Note (Notatki)

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| caseId | UUID | nie |
| userId | UUID | nie |
| content | String | nie |
| createdAt, updatedAt | DateTime | nie |

**Klucz główny:** `id`.
**Klucze obce:** `caseId → Case.id`, `userId → User.id`.
**Relacje:** N:1 `Case`, `User`.
**Indeksy:** `@@index([caseId])`.
**Ograniczenia:** brak — notatka zawsze ma autora (`userId` wymagane, w
przeciwieństwie do `CaseHistory.userId`, bo notatka jest zawsze
inicjowana przez człowieka, nigdy przez system).

---

# 24. Message (Wiadomości)

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| caseId | UUID | nie |
| senderType | enum `SenderType` (Customer/Employee/System) | nie |
| senderUserId | UUID | tak |
| direction | enum `MessageDirection` (Inbound/Outbound) | nie |
| channel | enum `MessageChannel` (Portal/Email) | nie |
| subject | String | tak |
| content | String | nie |
| sentAt | DateTime | nie |
| readAt | DateTime | tak |

**Klucz główny:** `id`.
**Klucze obce:** `caseId → Case.id`, `senderUserId → User.id` (opcjonalny
— wypełnione tylko gdy `senderType=Employee`).
**Relacje:** N:1 `Case`, `User` (opcjonalna).
**Indeksy:** `@@index([caseId])`.
**Ograniczenia:** brak dodatkowych na poziomie bazy — spójność
`senderType=Employee ⟺ senderUserId wypełnione` to walidacja aplikacyjna.

---

# 25. Document (Załączniki)

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| caseId | UUID | nie |
| caseItemId | UUID | tak |
| fileName | String | nie |
| fileType | enum `DocumentType` (PDF/JPG/PNG/HEIC/MP4) | nie |
| mimeType | String | nie |
| fileSize | Int | nie |
| storagePath | String | nie |
| category | enum `DocumentCategory` | nie, domyślnie `Other` |
| visibility | enum `DocumentVisibility` (Public/Internal) | nie, domyślnie `Internal` |
| status | enum `DocumentStatus` (Aktywny/Bledny) | nie, domyślnie `Aktywny` |
| uploadedById | UUID | nie |
| uploadedAt | DateTime | nie |
| version | Int | nie, domyślnie `1` |

**Klucz główny:** `id`.
**Klucze obce:** `caseId → Case.id`, `caseItemId → CaseItem.id`
(opcjonalny), `uploadedById → User.id`.
**Relacje:** N:1 `Case`, `CaseItem` (opcjonalna), `User`.
**Indeksy:** `@@index([caseId])`.
**Ograniczenia:** brak `DELETE` z poziomu aplikacji — dokumenty błędne są
oznaczane `status=Bledny`, nie usuwane (BR-020).

---

# 26. Logistics

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| caseId | UUID | nie |
| type | enum `LogisticsType` (4 wartości) | nie |
| status | enum `LogisticsStatus` (6 wartości) | nie, domyślnie `Requested` |
| courierProvider, trackingNumber | String | tak |
| cost | Decimal(10,2) | tak |
| addressSnapshot | String | tak |
| scheduledAt, completedAt | DateTime | tak |
| createdAt | DateTime | nie |

**Klucz główny:** `id`.
**Klucze obce:** `caseId → Case.id`.
**Relacje:** N:1 `Case` (jedna sprawa — wiele zdarzeń logistycznych w
czasie, patrz `BUSINESS_RULES.md` BR-082).
**Indeksy:** `@@index([caseId])`.
**Ograniczenia:** brak dodatkowych.

---

# 27. NotificationTemplate (Szablony wiadomości)

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| companyId | UUID | tak (`null` = szablon globalny) |
| code | String | nie |
| channel | enum `NotificationChannel` (Email/System/SMS) | nie |
| subject | String | tak |
| bodyTemplate | String | nie |
| variables | Json | nie |
| active | Boolean | nie |
| createdAt | DateTime | nie |

**Klucz główny:** `id`.
**Klucze obce:** `companyId → Company.id` (opcjonalny).
**Relacje:** N:1 `Company` (opcjonalna). 1:N `Notification`.
**Indeksy:** unikalny indeks złożony (patrz ograniczenia).
**Ograniczenia:** `@@unique([companyId, code, channel])` — jeden szablon
danego kodu na kanał, per firma (lub globalnie dla `companyId=null`).

---

# 28. Notification (Powiadomienia)

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| companyId | UUID | nie |
| templateId | UUID | tak |
| channel | enum `NotificationChannel` | nie |
| recipientType | enum `NotificationRecipientType` (Customer/Employee) | nie |
| recipientUserId | UUID | tak |
| recipientEmail, recipientPhone | String | tak |
| relatedCaseId | UUID | tak |
| subject | String | tak |
| body | String | nie |
| status | enum `NotificationStatus` (Pending/Sent/Failed/Read) | nie, domyślnie `Pending` |
| sentAt, readAt | DateTime | tak |
| failureReason | String | tak |
| createdAt | DateTime | nie |

**Klucz główny:** `id`.
**Klucze obce:** `companyId → Company.id`, `templateId →
NotificationTemplate.id` (opcjonalny), `relatedCaseId → Case.id`
(opcjonalny).
**Relacje:** N:1 `Company`, `NotificationTemplate` (opcjonalna), `Case`
(opcjonalna).
**Indeksy:** `@@index([companyId])`, `@@index([relatedCaseId])`,
`@@index([status])` — ostatni wspiera zadanie cykliczne "znajdź
powiadomienia `Pending` do wysłania".
**Ograniczenia:** brak dodatkowych — treść (`subject`/`body`) to kopia
**po** podstawieniu placeholderów, nie referencja do szablonu (żeby
zmiana szablonu w przyszłości nie zmieniła historycznie wysłanej treści).

---

# 29. AuditLog

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| companyId | UUID | tak |
| userId | UUID | tak |
| action | String | nie |
| entityType | String | nie |
| entityId | String | tak |
| ipAddress | String | tak |
| previousValue, newValue | Json | tak |
| createdAt | DateTime | nie |

**Klucz główny:** `id`.
**Klucze obce:** `companyId → Company.id` (opcjonalny), `userId →
User.id` (opcjonalny — zdarzenia systemowe).
**Relacje:** N:1 `Company` (opcjonalna), `User` (opcjonalna).
**Indeksy:** `@@index([companyId])`, `@@index([userId])`,
`@@index([entityType, entityId])` (indeks złożony — wspiera "cała
historia zmian tego konkretnego rekordu"), `@@index([createdAt])`.
**Ograniczenia:** insert-only z poziomu aplikacji (analogicznie do
`CaseHistory`, patrz §22).

---

# 30. Setting (Ustawienia systemowe)

**Pola:**
| Pole | Typ | Null? |
|---|---|---|
| id | UUID | nie |
| companyId | UUID | tak (`null` = wartość domyślna systemu) |
| key | String | nie |
| value | Json | nie |
| type | enum `SettingValueType` (String/Number/Boolean/Json) | nie, domyślnie `String` |
| description | String | tak |
| updatedAt | DateTime | nie |

**Klucz główny:** `id`.
**Klucze obce:** `companyId → Company.id` (opcjonalny).
**Relacje:** N:1 `Company` (opcjonalna).
**Indeksy:** unikalny indeks złożony (patrz ograniczenia).
**Ograniczenia:** `@@unique([companyId, key])` — nadpisanie per firma
współistnieje z wartością domyślną (`companyId=null`); przykłady kluczy:
`case.archival.retentionMonths`, `manufacturer.sla.days`,
`case.preparationFee.amount` (patrz `BUSINESS_RULES.md` BR-083).

---

## Znane ograniczenia tego dokumentu

- `prisma validate` nie mogło zostać uruchomione w tym środowisku (brak
  dostępu do `binaries.prisma.sh`) — walidacja ograniczona do
  sprawdzenia strukturalnego (zbalansowanie nawiasów, ręczna weryfikacja
  wszystkich relacji, w tym nowego podziału `Contractor`/`Manufacturer`).
  Do wykonania w środowisku z pełnym dostępem sieciowym przed pierwszą
  migracją.
- `seed.ts` nadal nie został zaktualizowany (odziedziczone ograniczenie z
  poprzedniej wersji tego dokumentu) — wymaga przepisania pod aktualny
  schemat, w tym pod nowy podział Kontrahent/Producent.
- Indeksy oznaczone jako "do rozważenia" (np. `Brand.@@unique([manufacturerId,
  name])`, `Product.@@unique([companyId, sku])`) są **rekomendacjami**, nie
  częścią zatwierdzonego schematu — dodanie ich to migracja addytywna,
  bezpieczna do wykonania w dowolnym momencie, gdy potrzeba się
  potwierdzi operacyjnie.
