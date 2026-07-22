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

---

## 2. Pełna lista uprawnień (`Permission`)

Konwencja nazewnictwa: `moduł.encja.akcja` lub `moduł.akcja`.

### Moduł: Cases (reklamacje)

| Kod | Opis |
|---|---|
| `cases.view` | Przeglądanie listy i szczegółów spraw |
| `cases.create` | Rejestracja nowej reklamacji |
| `cases.edit` | Edycja danych sprawy (opis, oczekiwane rozwiązanie, priorytet) |
| `cases.status.change` | Zmiana statusu sprawy zgodnie z dozwolonymi przejściami (`WORKFLOW.md`) |
| `cases.decision.set` | Ustawienie decyzji (naprawa/wymiana/odrzucenie) |
| `cases.decision.approve` | Zatwierdzenie decyzji **wymagających dodatkowej odpowiedzialności** (zwrot środków, sprawy rękojmi, sprawy nietypowe) |
| `cases.cancel` | Anulowanie sprawy |
| `cases.archive` | Ręczna archiwizacja sprawy (poza automatyczną) |
| `cases.assign` | Przenoszenie spraw pomiędzy pracownikami |
| `cases.delete` | Trwałe usunięcie sprawy (wyjątkowe, patrz §5) |
| `cases.infoRequest.send` | Wysłanie prośby o uzupełnienie danych do klienta |
| `cases.portal.manage` | Włączanie/wyłączanie Portalu Klienta, generowanie kodów/linków dostępu |
| `cases.replacement.manage` | Wydawanie i przyjmowanie produktów zastępczych |

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
| `brands.manage` | Zarządzanie markami przypisanymi do producentów |

### Moduł: Users / Roles (administracja)

| Kod | Opis |
|---|---|
| `users.view` | Przeglądanie listy użytkowników |
| `users.create` | Dodawanie nowych użytkowników |
| `users.edit` | Edycja danych użytkownika |
| `users.deactivate` | Dezaktywacja konta (patrz `DATABASE.md` §1.4 — nie fizyczne usunięcie) |
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
| `cases.delete` | 🟡 *(patrz §5 — wyjątkowe)* | ⬜ | ⬜ | ⬜ | ⬜ |
| `cases.infoRequest.send` | ✅ | ✅ | ✅ | ⬜ | ⬜ |
| `cases.portal.manage` | ✅ | ✅ | ✅ | ⬜ | ⬜ |
| `cases.replacement.manage` | ✅ | ✅ | ✅ | ✅ | ⬜ |
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
| `contractors.view` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `contractors.manage` | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| `brands.manage` | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| `users.view` | ✅ | 🟡 *(tylko pracownicy własnego oddziału)* | ⬜ | ⬜ | ⬜ |
| `users.create` / `.edit` / `.deactivate` | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
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

- **`cases.delete` (trwałe usunięcie sprawy)** — celowo nieprzypisane
  żadnej roli w standardowej macierzy. `docs/source/ROLES_AND_PERMISSIONS.md`
  nie przewiduje usuwania spraw przez nikogo (Pracownik *"nie może usuwać
  spraw"*, o Kierowniku/Administratorze dokument milczy w tej kwestii —
  interpretacja: nie przewidziano tej operacji w ogóle). Jeśli operacyjnie
  okaże się potrzebna (np. RODO — prawo do usunięcia danych), powinna być
  osobną, silnie audytowaną procedurą (np. wymagającą potwierdzenia
  dwuosobowego), nie zwykłym uprawnieniem — **rekomendacja**, nie
  gotowa decyzja.
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
