# Bezpieczeństwo i RODO — stan faktyczny

> Ten plik był REFERENCJONOWANY z `WORKFLOW.md` ("patrz `docs/source/SECURITY_AND_GDPR.md`
> dla zasad retencji/usuwania") od dawna, ale nigdy faktycznie nie istniał —
> wykryte w audycie gotowości produkcyjnej (Etap 7). Treść niżej opisuje
> WYŁĄCZNIE to, co system faktycznie robi dzisiaj, oraz wprost nazywa to,
> czego jeszcze nie robi. To NIE jest gotowa polityka prywatności do
> publikacji — to wewnętrzny dokument techniczno-proceduralny, punkt
> wyjścia do rozmowy z prawnikiem/IOD przed pierwszym prawdziwym klientem.

## 1. Jakie dane osobowe SmartRMA przetwarza

| Kategoria | Przykłady pól | Gdzie |
|---|---|---|
| Klient detaliczny/końcowy | imię, nazwisko, telefon, e-mail, adres | `Customer` |
| Pracownik organizacji-klienta | imię, nazwisko, e-mail, hash hasła | `User` |
| Osoba kontaktowa partnera B2B | imię, nazwisko, telefon, e-mail | `BrandComplaintPartnerContactDto` → `Customer` |
| Treść zgłoszenia/korespondencja | opis usterki, wiadomości, notatki | `Case`, `Message`, `Note` |
| Załączniki | zdjęcia/wideo usterki, dokumenty zakupu | dysk lokalny (`IStorageService`) |
| Metadane techniczne | adres IP, user-agent przy zgłoszeniu | `CaseConsent.ipAddress/userAgent` |

Każda organizacja (firma-klient SmartRMA) jest **administratorem danych** swoich
klientów końcowych — SmartRMA jest wobec nich **procesorem** (podmiotem
przetwarzającym). Wymaga to umowy powierzenia przetwarzania danych (UPD/DPA) z
każdą organizacją przed produkcyjnym startem — dokument POZA zakresem tego repo.

## 2. Podstawa prawna i zgoda — co jest ZROBIONE

- Zgoda RODO jest **obowiązkowa** przy każdym zgłoszeniu przez formularz
  publiczny (`CaseConsent.requiredConsent`, `Equals(true)` w DTO — formularz
  fizycznie nie wysyła się bez niej).
- Zgoda jest **wersjonowana** (`GDPR_CLAUSE_VERSION`, `clauseVersion` na
  wierszu) — zmiana treści klauzuli w przyszłości nie nadpisuje historycznych
  zgód.
- Zapisywany jest link do **Polityki Prywatności/Regulaminu aktualny w
  momencie zgody** (`Company.privacyPolicyUrl/privacyPolicyVersion`,
  `termsUrl`) — nie ogólny link "dziś", tylko to, na co klient faktycznie się
  zgodził.
- Zgoda marketingowa i zgoda na udostępnienie dokumentów producentowi są
  **opcjonalne i rozdzielone** od zgody obowiązkowej (`marketingConsent`,
  `documentSharingConsent`) — brak automatycznego "zaznaczenia wszystkiego".
- Zapisywane są `ipAddress`/`userAgent` w chwili zgody — dowód, nie profilowanie.

## 3. Retencja i usuwanie danych — CO NIE JEST ZROBIONE

**To jest najważniejsza, szczera część tego dokumentu.**

- Nie istnieje ŻADNE zadanie cykliczne usuwające/anonimizujące dane po
  okresie przechowywania. Pole `case.archival.retentionMonths` pojawia się
  wyłącznie jako nazwa w komentarzu kodu (`settings.service.ts`) — nie ma
  odpowiadającego mu zadania `@Cron`.
- Nie istnieje samoobsługowy endpoint "usuń moje dane"/"prawo do bycia
  zapomnianym" dla klienta końcowego ani pracownika.
- Usunięcie danych dziś oznacza: administrator organizacji ręcznie
  dezaktywuje/edytuje rekord przez panel, ALBO administrator SmartRMA
  wykonuje zapytanie SQL na żądanie — obie ścieżki manualne, nieaudytowane
  jako "realizacja żądania RODO" (audyt ogólny `AuditLog` istnieje, ale nie
  ma dedykowanego typu zdarzenia "DATA_ERASURE_REQUEST").
- Załączniki (`uploads/`) nie są nigdy automatycznie usuwane — nawet po
  "usunięciu" sprawy z bazy pliki fizycznie zostają na dysku
  (`DocumentsService.markInvalid` to soft-delete, nie kasowanie pliku).

**Zalecana procedura tymczasowa (do czasu automatyzacji):** żądanie dostępu/
usunięcia danych zgłoszone do organizacji-klienta → administrator organizacji
loguje się i ręcznie edytuje/anonimizuje dane klienta w panelu → jeśli
potrzebne trwałe usunięcie z bazy, kontakt z operatorem SmartRMA (dziś: dostęp
SQL). Każde takie żądanie powinno być odnotowane poza systemem (arkusz/e-mail)
do czasu powstania dedykowanego mechanizmu.

## 4. Bezpieczeństwo techniczne — co JEST zrobione

- Hasła: wyłącznie bcrypt (`PasswordService`), nigdy w postaci jawnej ani
  odwracalnej.
- Sekrety modułu e-mail (hasło SMTP, klucz API Resend): szyfrowane
  AES-256-GCM (`EncryptionService`), nie plaintext w bazie.
- Izolacja tenantów: strukturalna, każde zapytanie domenowe filtrowane po
  `companyId` — potwierdzone dziesiątkami testów IDOR (Etapy 4–6) i ręcznym
  testem na żywo (`docs/SmartRMA_Raport_Wdrozeniowy_2026-08-17.md`, sekcja 7).
- Nagłówki bezpieczeństwa (`helmet()`), redakcja `Authorization`/`Cookie` w
  logach, `ValidationPipe` z `forbidNonWhitelisted` (odrzuca nieznane pola
  zamiast je po cichu ignorować).
- Ograniczenie liczby żądań (throttling) na publicznych endpointach
  tworzących rekordy (`/companies/signup`, `/intake/*/complaints`).
- Transport: TLS jest odpowiedzialnością reverse proxy (Etap 7,
  `docker-compose.prod.yml` + Caddy) — bez niego hasła/tokeny idą po zwykłym
  HTTP.

**Znane, świadome kompromisy (patrz audyt Etapu 7 po pełną listę):**
tokeny sesji w `localStorage` przeglądarki (podatne na kradzież przez XSS,
brak `httpOnly`), brak automatycznego backupu bazy do czasu wdrożenia
`scripts/backup-postgres.sh`, `.env` musi mieć realne (nie przykładowe)
sekrety — nic w kodzie tego dziś nie wymusza poza długością.

## 5. Podprocesorzy (subprocessors)

Dane osobowe klientów organizacji mogą trafiać do:
- Dostawcy hostingu VPS (przechowywanie bazy/plików) — do ustalenia przy
  wyborze dostawcy.
- Resend (jeśli organizacja wybierze go jako dostawcę poczty w Ustawieniach)
  albo dowolny SMTP wskazany przez organizację — SmartRMA nie narzuca
  jednego dostawcy.

Lista musi zostać uzupełniona nazwą faktycznego dostawcy VPS przed publikacją
jakiejkolwiek polityki prywatności klientom.

## 6. Zgłaszanie naruszeń (breach notification)

Brak dziś zautomatyzowanego wykrywania naruszeń (patrz audyt Etapu 7, punkt
"Monitoring" — brak error trackingu/alertingu). Procedura na czas ręczny:
1. Ustalić zakres (które organizacje/rekordy dotknięte).
2. Zabezpieczyć dowody (logi, zrzut bazy).
3. Poinformować dotknięte organizacje (administratorzy danych) — mają 72h na
   zgłoszenie do UODO, jeśli naruszenie tego wymaga.
4. Udokumentować incydent (nawet jeśli nie wymaga zgłoszenia do organu).

## 7. Do zrobienia przed pierwszym prawdziwym klientem (skrót)

Pełna lista priorytetów jest w raporcie audytu Etapu 7 — z perspektywy RODO
najważniejsze to: (1) realna umowa powierzenia przetwarzania danych z każdą
organizacją-klientem, (2) ustalona i spisana wartość `retentionMonths` (nawet
jeśli egzekwowana ręcznie na początek), (3) backup działający (sekcja 4),
(4) TLS wdrożony (sekcja 4).
