/**
 * Wersja TREŚCI klauzuli RODO — WSPÓŁDZIELONA przez Portal Klienta ("Uzupełnienie
 * reklamacji") i Publiczny Formularz Reklamacyjny (krok 8 "RODO"), oba zapisują
 * `CaseConsent` względem tej samej sprawy. Zapisywana jako migawka na każdym
 * `CaseConsent`, żeby przyszła zmiana treści (np. inne sformułowanie, nowy cel
 * przetwarzania) nie nadpisała historycznie tego, na co klient faktycznie się
 * zgodził — podnieś tę wartość przy KAŻDEJ zmianie tekstu w kodzie frontendu.
 *
 * Treść jest STAŁA APLIKACJI, NIE per-firma — w przeciwieństwie do danych
 * administratora i linku do polityki prywatności (`Company.privacyPolicyUrl`/
 * `privacyPolicyVersion`/`termsUrl`), które SĄ per firma (SaaS wielonajemcze, patrz
 * komentarz przy `Company.privacyPolicyUrl` w schemacie).
 */
export const GDPR_CLAUSE_VERSION = '1.0';

/** Klient nigdy nie powinien zobaczyć nazwy własnej platformy jako "administratora" — zawsze prawdziwa nazwa firmy (`Company.name`), tak jak już robi to formularz publiczny (`PublicComplaintFormPage.tsx`). */
export function buildGdprInfoText(companyName: string): string {
  return (
    `Administratorem Państwa danych osobowych jest ${companyName}. ` +
    'Dane osobowe są przetwarzane wyłącznie w celu realizacji procesu reklamacyjnego, zgodnie z ' +
    'obowiązującymi przepisami RODO. Szczegółowe informacje znajdują się w Polityce Prywatności Administratora.'
  );
}

export const GDPR_REQUIRED_CONSENT_TEXT =
  'Oświadczam, że zapoznałem(-am) się z informacją o przetwarzaniu danych osobowych i wyrażam zgodę ' +
  'na przetwarzanie moich danych w celu obsługi procesu reklamacyjnego.';

export const GDPR_MARKETING_CONSENT_TEXT =
  'Wyrażam zgodę na kontakt drogą elektroniczną (e-mail/SMS) w sprawach związanych z obsługą reklamacji.';

export const GDPR_DOCUMENT_SHARING_CONSENT_TEXT =
  'Wyrażam zgodę na udostępnienie załączonych dokumentów i zdjęć producentowi lub dystrybutorowi produktu ' +
  'w celu weryfikacji zgłoszenia, jeśli sprawa zostanie do niego przekazana.';
