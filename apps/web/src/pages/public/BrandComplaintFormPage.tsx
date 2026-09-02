import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  intakeApi,
  type BrandContactPreference,
  type BrandIssueType,
  type BrandPartnerRequestType,
  type BrandReporterType,
  type PublicManufacturer,
  type SubmitBrandComplaintPayload,
} from '@/api/intake.api';
import { isPublicApiError } from '@/api/publicClient';
import { portalApi, type PortalDocumentCategory } from '@/api/portal.api';
import { setPortalSession } from '@/api/portal-token-storage';

/**
 * Formularz rozgałęziony marki (np. Veres Meble) — odpowiednik `PublicComplaintFormPage.tsx`
 * (formularz firmowy pod `orgSlug`), ale z dynamicznym przebiegiem kroków zależnym od tego,
 * KTO składa zgłoszenie (klient detaliczny / partner B2B). Zamiast stałej tablicy kroków
 * (`ALL_STEPS` w formularzu firmowym) lista kroków jest liczona NA BIEŻĄCO funkcją
 * `computeSteps()` — dzięki temu dodanie kolejnej ścieżki/warunkowego kroku w przyszłości
 * (np. pytania zależne od kategorii produktu) nie wymaga przepisania silnika, tylko
 * rozszerzenia tej jednej funkcji (patrz WAŻNE — NIE ROZSZERZAJ TERAZ ZAKRESU w zadaniu).
 *
 * Backend: `POST /intake/brand/:brandSlug/complaints` (`IntakeService.submitBrandComplaint`) —
 * tworzy DOKŁADNIE taką samą sprawę jak formularz firmowy (ten sam `CasesService.create`,
 * ta sama numeracja RMA, te same dokumenty/statusy/workflow), tylko z dodatkowymi polami
 * `reportedByContractorId`/`contactPreference` gdy zgłoszenie przyszło od partnera.
 */
type StepKey =
  | 'reporter'
  | 'customer'
  | 'partner'
  | 'partnerRequestType'
  | 'endCustomer'
  | 'contactPreference'
  | 'partnerContact'
  | 'product'
  | 'proof'
  | 'issue'
  | 'description'
  | 'photos'
  | 'gdpr'
  | 'summary';

const STEP_META: Record<StepKey, { title: string; desc: string }> = {
  reporter: { title: 'Kto składa zgłoszenie?', desc: 'Od tego zależy dalszy przebieg formularza.' },
  customer: {
    title: 'Twoje dane',
    desc: 'Na ten numer telefonu i e-mail wyślemy numer reklamacji oraz dostęp do Portalu Klienta.',
  },
  partner: {
    title: 'Wybór partnera',
    desc: 'Wybierz firmę, w imieniu której składasz zgłoszenie.',
  },
  partnerRequestType: {
    title: 'Rodzaj zgłoszenia',
    desc: 'Czy zgłoszenie dotyczy konkretnego klienta, czy jest przedsprzedażowe?',
  },
  endCustomer: {
    title: 'Dane klienta końcowego',
    desc: 'Dane osoby, w imieniu której składane jest zgłoszenie.',
  },
  contactPreference: {
    title: 'Kontakt w sprawie zgłoszenia',
    desc: 'Z kim mamy się kontaktować w sprawie tej reklamacji?',
  },
  partnerContact: {
    title: 'Osoba kontaktowa',
    desc: 'Dane osoby kontaktowej po Państwa stronie — na ten adres wyślemy numer zgłoszenia.',
  },
  product: {
    title: 'Produkt',
    desc: 'Wybierz kategorię i podaj model — tak, jak jest napisany na dokumencie zakupu.',
  },
  proof: {
    title: 'Dokument zakupu',
    desc: 'Podaj numer paragonu lub faktury. Możesz też dodać jego zdjęcie albo skan.',
  },
  issue: { title: 'Czego dotyczy reklamacja?', desc: 'Wybierz rodzaj zgłoszenia.' },
  description: { title: 'Opis problemu', desc: 'Opisz własnymi słowami, na czym polega usterka.' },
  photos: {
    title: 'Zdjęcia i materiały',
    desc: 'Dodaj zdjęcia — najlepiej z bliska i przy dobrym świetle.',
  },
  gdpr: {
    title: 'Zgoda RODO',
    desc: 'Ostatni krok przed wysłaniem — zgoda na przetwarzanie danych.',
  },
  summary: { title: 'Podsumowanie', desc: 'Sprawdź dane przed wysłaniem zgłoszenia.' },
};

const ISSUE_TYPES: { value: BrandIssueType; label: string }[] = [
  { value: 'MissingPart', label: 'Brakuje elementu' },
  { value: 'DamagedPart', label: 'Uszkodzony element / uszkodzony produkt' },
  { value: 'Defect', label: 'Wada produktu' },
  { value: 'Other', label: 'Inny problem' },
];

interface PendingFile {
  key: string;
  file: File;
}

function extractError(err: unknown, fallback: string): string {
  if (isPublicApiError(err)) return err.response?.data.error.message ?? fallback;
  return fallback;
}

/** Silnik rozgałęzień — jedyne miejsce, które trzeba rozszerzyć, żeby dodać kolejną warunkową ścieżkę (patrz doc-comment komponentu). */
function computeSteps(
  reporterType: BrandReporterType | null,
  partnerRequestType: BrandPartnerRequestType | null,
): StepKey[] {
  const steps: StepKey[] = ['reporter'];
  if (reporterType === 'Customer') {
    steps.push('customer');
  } else if (reporterType === 'Partner') {
    steps.push('partner', 'partnerRequestType');
    if (partnerRequestType === 'OnBehalfOfCustomer') {
      steps.push('endCustomer', 'contactPreference');
    } else if (partnerRequestType === 'Presale') {
      steps.push('partnerContact');
    }
  }
  steps.push('product', 'proof', 'issue', 'description', 'photos', 'gdpr', 'summary');
  return steps;
}

export function BrandComplaintFormPage() {
  const navigate = useNavigate();
  const { brandSlug } = useParams<{ brandSlug: string }>();

  const brandingQuery = useQuery({
    queryKey: ['intake-brand', 'branding', brandSlug],
    queryFn: () => intakeApi.getBrandBranding(brandSlug!),
    enabled: !!brandSlug,
    retry: false,
  });
  const manufacturerQuery = useQuery({
    queryKey: ['intake-brand', 'manufacturer', brandSlug],
    queryFn: () => intakeApi.getBrandManufacturer(brandSlug!),
    enabled: !!brandSlug,
    retry: false,
  });
  const partnersQuery = useQuery({
    queryKey: ['intake-brand', 'partners', brandSlug],
    queryFn: () => intakeApi.getBrandPartners(brandSlug!),
    enabled: !!brandSlug,
    retry: false,
  });

  // Zadeklarowany tu (przed `brandsQuery` niżej, który go czyta), a nie razem z resztą stanu
  // formularza poniżej — inaczej `brandsQuery` odwoływałby się do zmiennej przed jej inicjalizacją.
  const [partnerCompanyId, setPartnerCompanyId] = useState<string | null>(null);

  // Etap 4 — Organizacja → Producent → Marka → Kategoria → Produkt. Etap 5 — dla partnera B2B
  // zawężone do marek objętych JEGO `PartnershipBrand` (`partnerCompanyId` w kluczu zapytania,
  // żeby lista odświeżyła się po wyborze partnera w kroku wcześniejszym).
  const brandsQuery = useQuery({
    queryKey: ['intake-brand', 'brands', brandSlug, partnerCompanyId],
    queryFn: () => intakeApi.getBrandBrands(brandSlug!, partnerCompanyId),
    enabled: !!brandSlug,
    retry: false,
  });
  const categoriesQuery = useQuery({
    queryKey: ['intake-brand', 'categories', brandSlug],
    queryFn: () => intakeApi.getBrandCategories(brandSlug!),
    enabled: !!brandSlug,
    retry: false,
  });

  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdCaseNumber, setCreatedCaseNumber] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  const [reporterType, setReporterType] = useState<BrandReporterType | null>(null);

  // Klient detaliczny LUB klient końcowy (B2B "w imieniu klienta") — te same pola, jeden formularz.
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');

  const [partnerRequestType, setPartnerRequestType] = useState<BrandPartnerRequestType | null>(
    null,
  );
  const [contactPreference, setContactPreference] = useState<BrandContactPreference | null>(null);

  // Osoba kontaktowa partnera — wyłącznie ścieżka przedsprzedażowa (brak klienta końcowego).
  const [partnerFirstName, setPartnerFirstName] = useState('');
  const [partnerLastName, setPartnerLastName] = useState('');
  const [partnerPhone, setPartnerPhone] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');

  // Etap 4 — Organizacja → Producent → Marka → Kategoria → Produkt (zastępuje
  // dawną wolnotekstową kategorię+model z Etapu 3).
  const [brandId, setBrandId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [color, setColor] = useState('');
  const [serialNumber, setSerialNumber] = useState('');

  const [purchaseProofNumber, setPurchaseProofNumber] = useState('');
  const [proofFiles, setProofFiles] = useState<PendingFile[]>([]);

  const [issueType, setIssueType] = useState<BrandIssueType | null>(null);
  const [affectedPartNumber, setAffectedPartNumber] = useState('');

  const [description, setDescription] = useState('');

  const [photoFiles, setPhotoFiles] = useState<PendingFile[]>([]);
  const [videoFiles, setVideoFiles] = useState<PendingFile[]>([]);

  const [requiredConsent, setRequiredConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [documentSharingConsent, setDocumentSharingConsent] = useState(false);

  const proofInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const manufacturer: PublicManufacturer | undefined = manufacturerQuery.data;

  // Etap 4 — krok "Marka" pomijany w UI, gdy producent ma dokładnie jedną aktywną
  // markę (typowy przypadek samoopisanej organizacji, patrz `create-organization.ts`)
  // — auto-wybór, żeby nie pytać klienta o coś, co i tak ma tylko jedną odpowiedź.
  const brands = brandsQuery.data ?? [];
  const effectiveBrandId = brandId ?? (brands.length === 1 ? brands[0].id : null);
  const showBrandStep = brands.length > 1;

  const categories = categoriesQuery.data ?? [];
  const showCategoryStep = categories.length > 0;

  const productsQuery = useQuery({
    queryKey: ['intake-brand', 'products', brandSlug, effectiveBrandId, categoryId],
    queryFn: () =>
      intakeApi.getBrandProducts(brandSlug!, {
        brandId: effectiveBrandId ?? undefined,
        categoryId: categoryId ?? undefined,
      }),
    enabled:
      !!brandSlug && (!showBrandStep || !!effectiveBrandId) && (!showCategoryStep || !!categoryId),
    retry: false,
  });
  const products = productsQuery.data ?? [];
  const selectedProduct = products.find((p) => p.id === productId) ?? null;

  // Ten sam resolver co `CasesService`/Portal Klienta (`resolveRequirements`) — checklista
  // pokazuje dokładnie to, co faktycznie zostanie wyegzekwowane po wysłaniu DLA WYBRANEJ marki,
  // nie tylko domyślne wartości producenta (`manufacturer.requiresXxx` to fallback przed wyborem marki).
  const requirementsQuery = useQuery({
    queryKey: ['intake-brand', 'requirements', brandSlug, effectiveBrandId],
    queryFn: () => intakeApi.getBrandRequirements(brandSlug!, effectiveBrandId ?? undefined),
    enabled: !!brandSlug,
    retry: false,
  });
  const requirements = requirementsQuery.data ?? manufacturer;

  const activeSteps = useMemo(
    () => computeSteps(reporterType, partnerRequestType),
    [reporterType, partnerRequestType],
  );
  const currentStep = STEP_META[activeSteps[Math.min(stepIndex, activeSteps.length - 1)]];
  const currentKey = activeSteps[Math.min(stepIndex, activeSteps.length - 1)];

  const requiresPartNumber = issueType === 'MissingPart' || issueType === 'DamagedPart';

  /** Ten sam silnik reguł co formularz firmowy (`PublicComplaintFormPage`) — liczony po stronie klienta, PRZED utworzeniem sprawy. Od Etapu 4: `requirements` rozwiązane DLA WYBRANEJ marki (`resolveRequirements`), nie tylko domyślne wartości producenta. */
  const missing = useMemo(() => {
    if (!requirements) return [];
    const items: string[] = [];
    if (requirements.requiresSerialNumber && !serialNumber.trim()) items.push('Numer seryjny');
    if (
      requirements.requiresProofOfPurchase &&
      !purchaseProofNumber.trim() &&
      proofFiles.length === 0
    ) {
      items.push('Dowód zakupu (numer lub skan)');
    }
    if (requirements.minPhotos > 0 && photoFiles.length < requirements.minPhotos) {
      items.push(`Zdjęcia (min. ${requirements.minPhotos}, dodano ${photoFiles.length})`);
    }
    if (requirements.requiresVideo && videoFiles.length === 0)
      items.push('Film przedstawiający usterkę');
    return items;
  }, [requirements, serialNumber, purchaseProofNumber, proofFiles, photoFiles, videoFiles]);

  const canSubmit = missing.length === 0 && requiredConsent;

  function pickFiles(setter: typeof setProofFiles, files: FileList | null) {
    if (!files || files.length === 0) return;
    const picked = Array.from(files).map((file) => ({
      key: `${file.name}:${file.size}:${Date.now()}:${Math.random()}`,
      file,
    }));
    setter((prev) => [...prev, ...picked]);
  }

  function removeFile(setter: typeof setProofFiles, key: string) {
    setter((prev) => prev.filter((f) => f.key !== key));
  }

  function validateCustomerFields(): string | null {
    if (!firstName.trim() || !lastName.trim()) return 'Podaj imię i nazwisko.';
    if (!phone.trim()) return 'Podaj numer telefonu.';
    if (!email.trim() || !email.includes('@')) return 'Podaj prawidłowy adres e-mail.';
    if (!address.trim()) return 'Podaj ulicę i numer domu/mieszkania.';
    if (!postalCode.trim()) return 'Podaj kod pocztowy.';
    if (!city.trim()) return 'Podaj miejscowość.';
    return null;
  }

  function validateStep(key: StepKey): string | null {
    switch (key) {
      case 'reporter':
        if (!reporterType) return 'Wybierz, kto składa zgłoszenie.';
        return null;
      case 'customer':
      case 'endCustomer':
        return validateCustomerFields();
      case 'partner':
        if (!partnerCompanyId) return 'Wybierz partnera z listy.';
        return null;
      case 'partnerRequestType':
        if (!partnerRequestType) return 'Wybierz rodzaj zgłoszenia.';
        return null;
      case 'contactPreference':
        if (!contactPreference) return 'Wybierz, z kim mamy się kontaktować.';
        return null;
      case 'partnerContact':
        if (!partnerFirstName.trim() || !partnerLastName.trim())
          return 'Podaj imię i nazwisko osoby kontaktowej.';
        if (!partnerPhone.trim()) return 'Podaj numer telefonu osoby kontaktowej.';
        if (!partnerEmail.trim() || !partnerEmail.includes('@'))
          return 'Podaj prawidłowy adres e-mail osoby kontaktowej.';
        return null;
      case 'product':
        if (showBrandStep && !brandId) return 'Wybierz markę.';
        if (showCategoryStep && !categoryId) return 'Wybierz kategorię produktu.';
        if (!productId) return 'Wybierz produkt z listy.';
        return null;
      case 'issue':
        if (!issueType) return 'Wybierz, czego dotyczy reklamacja.';
        if (requiresPartNumber && !affectedPartNumber.trim())
          return 'Podaj numer elementu zgodnie z instrukcją montażu.';
        return null;
      case 'description':
        if (!description.trim()) return 'Opisz problem — to pole jest wymagane.';
        return null;
      case 'gdpr':
        if (!requiredConsent)
          return 'Zaznacz zgodę na przetwarzanie danych osobowych, aby przejść dalej.';
        return null;
      default:
        return null;
    }
  }

  function goNext() {
    const err = validateStep(currentKey);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    setStepIndex((i) => Math.min(i + 1, activeSteps.length - 1));
  }

  function goBack() {
    setStepError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  const contactEmail =
    reporterType === 'Partner' && partnerRequestType === 'Presale' ? partnerEmail : email;

  async function handleSubmit() {
    if (!canSubmit || !reporterType || !productId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: SubmitBrandComplaintPayload = {
        reporterType,
        brandId: effectiveBrandId ?? undefined,
        productId,
        color: color.trim() || undefined,
        serialNumber: serialNumber.trim() || undefined,
        purchaseProofNumber: purchaseProofNumber.trim() || undefined,
        issueType: issueType!,
        affectedPartNumber: requiresPartNumber ? affectedPartNumber.trim() || undefined : undefined,
        description: description.trim(),
        requiredConsent,
        marketingConsent,
        documentSharingConsent,
      };

      if (reporterType === 'Customer') {
        payload.customer = {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
          city: city.trim(),
          postalCode: postalCode.trim(),
        };
      } else {
        payload.partnerCompanyId = partnerCompanyId!;
        payload.partnerRequestType = partnerRequestType!;
        if (partnerRequestType === 'OnBehalfOfCustomer') {
          payload.customer = {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone.trim(),
            email: email.trim(),
            address: address.trim(),
            city: city.trim(),
            postalCode: postalCode.trim(),
          };
          payload.contactPreference = contactPreference!;
        } else {
          payload.partnerContact = {
            firstName: partnerFirstName.trim(),
            lastName: partnerLastName.trim(),
            phone: partnerPhone.trim(),
            email: partnerEmail.trim(),
          };
        }
      }

      const created = await intakeApi.submitBrandComplaint(brandSlug!, payload);
      setPortalSession({
        accessToken: created.accessToken,
        expiresIn: created.expiresIn,
        caseNumber: created.caseNumber,
      });

      const uploads: { files: PendingFile[]; category: PortalDocumentCategory }[] = [
        { files: proofFiles, category: 'PurchaseProof' },
        { files: photoFiles, category: 'Photo' },
        { files: videoFiles, category: 'Video' },
      ];
      for (const group of uploads) {
        for (const pending of group.files) {
          await portalApi.uploadDocument(pending.file, group.category);
        }
      }

      setCreatedCaseNumber(created.caseNumber);
    } catch (err) {
      setSubmitError(extractError(err, 'Nie udało się wysłać zgłoszenia. Spróbuj ponownie.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (!brandSlug || brandingQuery.isError) {
    return (
      <div className="wizard-page">
        <main className="wizard-main">
          <div className="wizard-success">
            <h1>Formularz niedostępny</h1>
            <p>
              Link, z którego Państwo korzystają, jest nieprawidłowy albo nieaktualny — sprawdź, czy
              adres został skopiowany w całości, albo poproś o aktualny link do zgłoszenia
              reklamacji.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (createdCaseNumber) {
    return (
      <div className="wizard-page">
        <main className="wizard-main">
          <div className="wizard-success">
            <div className="success-icon">✓</div>
            <h1>Zgłoszenie zostało wysłane</h1>
            <p>Numer reklamacji:</p>
            <div className="rma-number">{createdCaseNumber}</div>

            <div className="wizard-next-steps">
              <h2>Co dalej?</h2>
              <ul>
                <li>
                  <span className="step-emoji">1️⃣</span> Otrzymają Państwo wiadomość e-mail z
                  potwierdzeniem zgłoszenia.
                </li>
                <li>
                  <span className="step-emoji">2️⃣</span> W wiadomości znajdą Państwo kod dostępu do
                  Portalu Klienta.
                </li>
                <li>
                  <span className="step-emoji">3️⃣</span> W Portalu Klienta można śledzić status
                  reklamacji oraz przesyłać dodatkowe informacje i dokumenty.
                </li>
                <li>
                  <span className="step-emoji">4️⃣</span> Jeżeli będziemy potrzebować dodatkowych
                  informacji, skontaktujemy się z Państwem.
                </li>
              </ul>
            </div>

            <div className="validation-summary complete" style={{ textAlign: 'left' }}>
              <strong>
                Kod dostępu do Portalu Klienta został wysłany na adres {contactEmail}. Prosimy
                sprawdzić skrzynkę odbiorczą oraz folder SPAM.
              </strong>
            </div>

            <button
              className="btn btn-primary"
              style={{ marginTop: 18 }}
              onClick={() => navigate('/portal/case')}
            >
              Przejdź do Portalu Klienta
            </button>
          </div>
        </main>
      </div>
    );
  }

  const progressPct = ((stepIndex + 1) / activeSteps.length) * 100;
  const branding = brandingQuery.data;

  return (
    <div className="wizard-page">
      <header className="wizard-header">
        <div className="wizard-header-top">
          <span className="wizard-step-label">
            Krok {stepIndex + 1} z {activeSteps.length}: {currentStep.title}
          </span>
          {branding?.name && <span className="wizard-completion-badge">{branding.name}</span>}
        </div>
        <div className="wizard-progress-track">
          <div className="wizard-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </header>

      <main className="wizard-main">
        {stepIndex === 0 && (
          <div className="wizard-intro">
            {branding?.logoUrl && (
              <img
                src={`${import.meta.env.VITE_API_BASE_URL}${branding.logoUrl}`}
                alt={branding.name}
                style={{ display: 'block', maxHeight: 56, margin: '0 auto 16px' }}
              />
            )}
            {branding?.name && <p className="wizard-company-name">{branding.name}</p>}
            <h1>Zgłoszenie reklamacji</h1>
            <p>
              Dzień dobry,
              <br />
              znajdują się Państwo na stronie zgłoszeń reklamacyjnych{' '}
              {branding?.name ? <strong>{branding.name}</strong> : 'naszej firmy'}. Prosimy o
              wypełnienie formularza krok po kroku.
            </p>
            <span className="wizard-time-hint">⏱ Zajmie ok. 5 minut</span>
          </div>
        )}

        <div className="wizard-card">
          <h2>{currentStep.title}</h2>
          <p className="step-desc">{currentStep.desc}</p>

          {stepError && (
            <p
              className="field-error"
              role="alert"
              aria-live="polite"
              style={{ display: 'block', marginBottom: 14 }}
            >
              {stepError}
            </p>
          )}

          {currentKey === 'reporter' && (
            <div className="form-grid">
              <ReporterOption
                selected={reporterType === 'Customer'}
                title="Klient detaliczny"
                desc="Zgłaszam reklamację jako osoba prywatna, która kupiła produkt."
                onClick={() => setReporterType('Customer')}
              />
              <ReporterOption
                selected={reporterType === 'Partner'}
                title="Partner B2B"
                desc="Zgłaszam reklamację jako firma współpracująca."
                onClick={() => setReporterType('Partner')}
              />
            </div>
          )}

          {(currentKey === 'customer' || currentKey === 'endCustomer') && (
            <div className="form-grid">
              <div className="field">
                <label htmlFor="firstName">
                  Imię <span className="required-star">*</span>
                </label>
                <input
                  id="firstName"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="lastName">
                  Nazwisko <span className="required-star">*</span>
                </label>
                <input
                  id="lastName"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="phone">
                  Numer telefonu <span className="required-star">*</span>
                </label>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="email">
                  Adres e-mail <span className="required-star">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="address">
                  Ulica i numer domu/mieszkania <span className="required-star">*</span>
                </label>
                <input
                  id="address"
                  type="text"
                  autoComplete="street-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="postalCode">
                  Kod pocztowy <span className="required-star">*</span>
                </label>
                <input
                  id="postalCode"
                  type="text"
                  autoComplete="postal-code"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="00-000"
                />
              </div>
              <div className="field">
                <label htmlFor="city">
                  Miejscowość <span className="required-star">*</span>
                </label>
                <input
                  id="city"
                  type="text"
                  autoComplete="address-level2"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
            </div>
          )}

          {currentKey === 'partner' && (
            <div className="field">
              <label htmlFor="partner">
                Partner <span className="required-star">*</span>
              </label>
              <select
                id="partner"
                value={partnerCompanyId ?? ''}
                onChange={(e) => setPartnerCompanyId(e.target.value || null)}
                disabled={partnersQuery.isLoading}
              >
                <option value="">— wybierz —</option>
                {(partnersQuery.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {(partnersQuery.data ?? []).length === 0 && !partnersQuery.isLoading && (
                <p className="field-hint-static">
                  Brak zarejestrowanych partnerów — skontaktuj się z nami, aby ustalić współpracę.
                </p>
              )}
            </div>
          )}

          {currentKey === 'partnerRequestType' && (
            <div className="form-grid">
              <ReporterOption
                selected={partnerRequestType === 'Presale'}
                title="Reklamacja przedsprzedażowa"
                desc="Zgłoszenie dotyczy towaru jeszcze niesprzedanego klientowi końcowemu."
                onClick={() => setPartnerRequestType('Presale')}
              />
              <ReporterOption
                selected={partnerRequestType === 'OnBehalfOfCustomer'}
                title="W imieniu klienta końcowego"
                desc="Zgłaszam reklamację w imieniu konkretnego klienta."
                onClick={() => setPartnerRequestType('OnBehalfOfCustomer')}
              />
            </div>
          )}

          {currentKey === 'contactPreference' && (
            <div className="form-grid">
              <ReporterOption
                selected={contactPreference === 'Partner'}
                title="Z partnerem B2B"
                desc="Dalsza komunikacja w sprawie zgłoszenia pozostaje po stronie partnera."
                onClick={() => setContactPreference('Partner')}
              />
              <ReporterOption
                selected={contactPreference === 'Customer'}
                title="Bezpośrednio z klientem końcowym"
                desc="Będziemy kontaktować się bezpośrednio z klientem, którego dane podano w poprzednim kroku."
                onClick={() => setContactPreference('Customer')}
              />
            </div>
          )}

          {currentKey === 'partnerContact' && (
            <div className="form-grid">
              <div className="field">
                <label htmlFor="partnerFirstName">
                  Imię <span className="required-star">*</span>
                </label>
                <input
                  id="partnerFirstName"
                  type="text"
                  value={partnerFirstName}
                  onChange={(e) => setPartnerFirstName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="partnerLastName">
                  Nazwisko <span className="required-star">*</span>
                </label>
                <input
                  id="partnerLastName"
                  type="text"
                  value={partnerLastName}
                  onChange={(e) => setPartnerLastName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="partnerPhone">
                  Telefon <span className="required-star">*</span>
                </label>
                <input
                  id="partnerPhone"
                  type="tel"
                  value={partnerPhone}
                  onChange={(e) => setPartnerPhone(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="partnerEmail">
                  E-mail <span className="required-star">*</span>
                </label>
                <input
                  id="partnerEmail"
                  type="email"
                  value={partnerEmail}
                  onChange={(e) => setPartnerEmail(e.target.value)}
                />
              </div>
            </div>
          )}

          {currentKey === 'product' && (
            <>
              {showBrandStep && (
                <div className="field">
                  <label htmlFor="brand">
                    Marka <span className="required-star">*</span>
                  </label>
                  <select
                    id="brand"
                    value={brandId ?? ''}
                    onChange={(e) => {
                      setBrandId(e.target.value || null);
                      setCategoryId(null);
                      setProductId(null);
                    }}
                    disabled={brandsQuery.isLoading}
                  >
                    <option value="">— wybierz —</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {showCategoryStep && (!showBrandStep || !!effectiveBrandId) && (
                <div className="field" style={{ marginTop: showBrandStep ? 14 : 0 }}>
                  <label htmlFor="category">
                    Kategoria produktu <span className="required-star">*</span>
                  </label>
                  <select
                    id="category"
                    value={categoryId ?? ''}
                    onChange={(e) => {
                      setCategoryId(e.target.value || null);
                      setProductId(null);
                    }}
                    disabled={categoriesQuery.isLoading}
                  >
                    <option value="">— wybierz —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {(!showBrandStep || !!effectiveBrandId) && (!showCategoryStep || !!categoryId) && (
                <div
                  className="field"
                  style={{ marginTop: showBrandStep || showCategoryStep ? 14 : 0 }}
                >
                  <label htmlFor="product">
                    Produkt <span className="required-star">*</span>
                  </label>
                  <select
                    id="product"
                    value={productId ?? ''}
                    onChange={(e) => setProductId(e.target.value || null)}
                    disabled={productsQuery.isLoading}
                  >
                    <option value="">— wybierz —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {products.length === 0 && !productsQuery.isLoading && (
                    <p className="field-hint-static">
                      Brak produktów w tej kategorii — skontaktuj się z nami, aby zgłosić reklamację
                      ręcznie.
                    </p>
                  )}
                </div>
              )}
              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor="color">Kolor</label>
                <input
                  id="color"
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </div>
              {requirements?.requiresSerialNumber && (
                <div className="field" style={{ marginTop: 14 }}>
                  <label htmlFor="serialNumber">
                    Numer seryjny <span className="required-star">*</span>
                  </label>
                  <input
                    id="serialNumber"
                    type="text"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                  />
                  <p className="field-hint-static">
                    Numer seryjny może znajdować się na naklejce/pieczątce fabrycznej na opakowaniu
                    produktu lub bezpośrednio na produkcie.
                  </p>
                </div>
              )}
            </>
          )}

          {currentKey === 'proof' && (
            <>
              <div className="field">
                <label htmlFor="purchaseProofNumber">
                  Numer paragonu / faktury{' '}
                  {requirements?.requiresProofOfPurchase && (
                    <span className="required-star">*</span>
                  )}
                </label>
                <input
                  id="purchaseProofNumber"
                  type="text"
                  value={purchaseProofNumber}
                  onChange={(e) => setPurchaseProofNumber(e.target.value)}
                />
              </div>
              <FileDropzone
                label="Skan lub zdjęcie dowodu zakupu"
                hint="PDF, JPG lub PNG"
                accept="image/*,application/pdf"
                inputRef={proofInputRef}
                files={proofFiles}
                onPick={(files) => pickFiles(setProofFiles, files)}
                onRemove={(key) => removeFile(setProofFiles, key)}
              />
            </>
          )}

          {currentKey === 'issue' && (
            <div className="form-grid">
              {ISSUE_TYPES.map((opt) => (
                <ReporterOption
                  key={opt.value}
                  selected={issueType === opt.value}
                  title={opt.label}
                  desc=""
                  onClick={() => setIssueType(opt.value)}
                />
              ))}
              {requiresPartNumber && (
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="affectedPartNumber">
                    Numer {issueType === 'MissingPart' ? 'brakującego' : 'uszkodzonego'} elementu
                    (wg instrukcji montażu) <span className="required-star">*</span>
                  </label>
                  <input
                    id="affectedPartNumber"
                    type="text"
                    value={affectedPartNumber}
                    onChange={(e) => setAffectedPartNumber(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {currentKey === 'description' && (
            <div className="field">
              <label htmlFor="description">
                Opis usterki <span className="required-star">*</span>
              </label>
              <p className="field-hint-static" style={{ marginTop: 0, marginBottom: 10 }}>
                Prosimy podać: co jest nieprawidłowe, kiedy problem został zauważony, czego dotyczy
                oraz czego Państwo oczekują.
              </p>
              <textarea
                id="description"
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Np. Boczna ścianka szafy jest porysowana od dostawy. Zauważyliśmy to od razu po rozpakowaniu."
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>
          )}

          {currentKey === 'photos' && (
            <>
              <FileDropzone
                label={`Zdjęcia${requirements && requirements.minPhotos > 0 ? ` (min. ${requirements.minPhotos})` : ''}`}
                hint={
                  requiresPartNumber
                    ? 'Dodaj zdjęcie całego produktu ORAZ zdjęcie konkretnego uszkodzonego/brakującego elementu — z galerii albo prosto z aparatu'
                    : 'Dodaj zdjęcie całego produktu oraz zdjęcie usterki — z galerii albo prosto z aparatu'
                }
                accept="image/*"
                inputRef={photoInputRef}
                files={photoFiles}
                onPick={(files) => pickFiles(setPhotoFiles, files)}
                onRemove={(key) => removeFile(setPhotoFiles, key)}
                counterOk={requirements ? photoFiles.length >= requirements.minPhotos : true}
                counterLabel={
                  requirements && requirements.minPhotos > 0
                    ? `${photoFiles.length} / ${requirements.minPhotos} wymaganych`
                    : `${photoFiles.length} dodanych`
                }
              />
              <FileDropzone
                label="Film (opcjonalnie)"
                hint="Jeżeli film lepiej pokazuje problem niż zdjęcia"
                accept="video/*"
                capture
                inputRef={videoInputRef}
                files={videoFiles}
                onPick={(files) => pickFiles(setVideoFiles, files)}
                onRemove={(key) => removeFile(setVideoFiles, key)}
              />
            </>
          )}

          {currentKey === 'gdpr' && (
            <GdprStep
              branding={branding}
              requiredConsent={requiredConsent}
              marketingConsent={marketingConsent}
              documentSharingConsent={documentSharingConsent}
              onRequiredChange={setRequiredConsent}
              onMarketingChange={setMarketingConsent}
              onDocumentSharingChange={setDocumentSharingConsent}
            />
          )}

          {currentKey === 'summary' && (
            <>
              <div
                className={`validation-summary ${missing.length === 0 ? 'complete' : 'incomplete'}`}
                role="status"
                aria-live="polite"
              >
                {missing.length === 0 ? (
                  <strong>Zgłoszenie jest kompletne — możesz je wysłać.</strong>
                ) : (
                  <>
                    <strong>Do wysłania brakuje:</strong>
                    <ul>
                      {missing.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <dl className="summary-list">
                <SummaryRow
                  label="Typ zgłoszenia"
                  value={reporterType === 'Partner' ? 'Partner B2B' : 'Klient detaliczny'}
                />
                {reporterType === 'Partner' && (
                  <SummaryRow
                    label="Partner"
                    value={
                      (partnersQuery.data ?? []).find((p) => p.id === partnerCompanyId)?.name ?? '—'
                    }
                  />
                )}
                {reporterType === 'Partner' && (
                  <SummaryRow
                    label="Rodzaj zgłoszenia B2B"
                    value={
                      partnerRequestType === 'Presale'
                        ? 'Przedsprzedażowe'
                        : 'W imieniu klienta końcowego'
                    }
                  />
                )}
                {reporterType === 'Partner' && partnerRequestType === 'OnBehalfOfCustomer' && (
                  <SummaryRow
                    label="Kontakt"
                    value={
                      contactPreference === 'Partner'
                        ? 'Z partnerem B2B'
                        : 'Bezpośrednio z klientem'
                    }
                  />
                )}
                {(reporterType === 'Customer' || partnerRequestType === 'OnBehalfOfCustomer') && (
                  <>
                    <SummaryRow
                      label="Klient"
                      value={`${firstName} ${lastName} · ${phone} · ${email}`}
                    />
                    <SummaryRow label="Adres" value={`${address}, ${postalCode} ${city}`} />
                  </>
                )}
                {reporterType === 'Partner' && partnerRequestType === 'Presale' && (
                  <SummaryRow
                    label="Osoba kontaktowa"
                    value={`${partnerFirstName} ${partnerLastName} · ${partnerPhone} · ${partnerEmail}`}
                  />
                )}
                {showBrandStep && (
                  <SummaryRow
                    label="Marka"
                    value={brands.find((b) => b.id === effectiveBrandId)?.name ?? '—'}
                  />
                )}
                {showCategoryStep && (
                  <SummaryRow
                    label="Kategoria"
                    value={categories.find((c) => c.id === categoryId)?.name ?? '—'}
                  />
                )}
                <SummaryRow label="Produkt" value={selectedProduct?.name ?? '—'} />
                <SummaryRow label="Kolor" value={color || '—'} />
                <SummaryRow label="Numer seryjny" value={serialNumber || '—'} />
                <SummaryRow
                  label="Dokument zakupu"
                  value={purchaseProofNumber || (proofFiles.length > 0 ? 'załącznik' : '—')}
                />
                <SummaryRow
                  label="Rodzaj reklamacji"
                  value={ISSUE_TYPES.find((i) => i.value === issueType)?.label ?? '—'}
                />
                {requiresPartNumber && (
                  <SummaryRow label="Numer elementu" value={affectedPartNumber || '—'} />
                )}
                <SummaryRow label="Opis" value={description || '—'} />
                <SummaryRow
                  label="Załączniki"
                  value={`${proofFiles.length + photoFiles.length + videoFiles.length} plik(ów)`}
                />
              </dl>

              {submitError && (
                <p
                  className="field-error"
                  role="alert"
                  aria-live="polite"
                  style={{ display: 'block', marginTop: 14 }}
                >
                  {submitError}
                </p>
              )}
            </>
          )}
        </div>
      </main>

      <nav className="wizard-nav">
        <button
          className="btn btn-secondary"
          onClick={goBack}
          disabled={stepIndex === 0 || submitting}
        >
          Wstecz
        </button>
        {currentKey === 'summary' ? (
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
          >
            {submitting ? 'Wysyłanie…' : 'Wyślij zgłoszenie'}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={goNext}>
            Dalej
          </button>
        )}
      </nav>
    </div>
  );
}

function ReporterOption({
  selected,
  title,
  desc,
  onClick,
}: {
  selected: boolean;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`field-option-card${selected ? ' selected' : ''}`}
      style={{
        textAlign: 'left',
        padding: '14px 16px',
        borderRadius: 10,
        border: selected ? '2px solid var(--primary)' : '1px solid var(--border)',
        background: selected ? 'var(--primary-soft)' : 'var(--surface)',
        cursor: 'pointer',
      }}
    >
      <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{title}</p>
      {desc && (
        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>{desc}</p>
      )}
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
        fontSize: 13,
      }}
    >
      <dt style={{ color: 'var(--text-muted)' }}>{label}</dt>
      <dd style={{ margin: 0, textAlign: 'right', maxWidth: '65%' }}>{value}</dd>
    </div>
  );
}

function GdprStep({
  branding,
  requiredConsent,
  marketingConsent,
  documentSharingConsent,
  onRequiredChange,
  onMarketingChange,
  onDocumentSharingChange,
}: {
  branding: ReturnType<
    typeof useQuery<Awaited<ReturnType<typeof intakeApi.getBrandBranding>>>
  >['data'];
  requiredConsent: boolean;
  marketingConsent: boolean;
  documentSharingConsent: boolean;
  onRequiredChange: (v: boolean) => void;
  onMarketingChange: (v: boolean) => void;
  onDocumentSharingChange: (v: boolean) => void;
}) {
  return (
    <div>
      <p
        style={{
          fontSize: 12.5,
          color: 'var(--text-secondary)',
          lineHeight: 1.55,
          marginBottom: 14,
        }}
      >
        Administratorem Państwa danych osobowych jest{' '}
        {branding?.name || 'administrator wskazany poniżej'}. Dane wykorzystujemy wyłącznie do
        obsługi zgłoszonej reklamacji, zgodnie z RODO. Pełne informacje znajdą Państwo w Polityce
        Prywatności.
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        {branding?.privacyPolicyUrl && (
          <a
            href={branding.privacyPolicyUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
          >
            Polityka Prywatności
          </a>
        )}
        {branding?.termsUrl && (
          <a
            href={branding.termsUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
          >
            Regulamin
          </a>
        )}
      </div>

      <div className="consent-row">
        <input
          id="requiredConsent"
          type="checkbox"
          checked={requiredConsent}
          onChange={(e) => onRequiredChange(e.target.checked)}
        />
        <label htmlFor="requiredConsent">
          Oświadczam, że zapoznałem(-am) się z informacją o przetwarzaniu danych osobowych i wyrażam
          zgodę na przetwarzanie moich danych w celu obsługi procesu reklamacyjnego.
        </label>
      </div>
      <div className="consent-row">
        <input
          id="marketingConsent"
          type="checkbox"
          checked={marketingConsent}
          onChange={(e) => onMarketingChange(e.target.checked)}
        />
        <label htmlFor="marketingConsent">
          Wyrażam zgodę na kontakt drogą elektroniczną (e-mail/SMS) w sprawach związanych z obsługą
          reklamacji.
        </label>
      </div>
      <div className="consent-row">
        <input
          id="documentSharingConsent"
          type="checkbox"
          checked={documentSharingConsent}
          onChange={(e) => onDocumentSharingChange(e.target.checked)}
        />
        <label htmlFor="documentSharingConsent">
          Wyrażam zgodę na udostępnienie załączonych dokumentów i zdjęć producentowi lub
          dystrybutorowi produktu w celu weryfikacji zgłoszenia, jeśli sprawa zostanie do niego
          przekazana.
        </label>
      </div>
    </div>
  );
}

function FileDropzone({
  label,
  hint,
  accept,
  capture,
  inputRef,
  files,
  onPick,
  onRemove,
  counterOk,
  counterLabel,
}: {
  label: string;
  hint: string;
  accept: string;
  capture?: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  files: PendingFile[];
  onPick: (files: FileList | null) => void;
  onRemove: (key: string) => void;
  counterOk?: boolean;
  counterLabel?: string;
}) {
  return (
    <div className="dropzone-group">
      <div className="dropzone-group-label">{label}</div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        capture={capture ? 'environment' : undefined}
        hidden
        onChange={(e) => {
          onPick(e.target.files);
          e.target.value = '';
        }}
      />
      <div
        className="dropzone"
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <div className="dz-icon">📎</div>
        <div className="dz-title">Dotknij, aby wybrać plik</div>
        <div className="dz-hint">{hint}</div>
      </div>
      {counterLabel && (
        <div className={`dz-counter ${counterOk ? 'ok' : 'pending'}`} aria-live="polite">
          {counterLabel}
        </div>
      )}
      {files.length > 0 && (
        <div className="file-preview-grid">
          {files.map((f) => (
            <div key={f.key} className="file-preview-item">
              {f.file.type.startsWith('image/') ? (
                <img src={URL.createObjectURL(f.file)} alt={f.file.name} />
              ) : (
                <div className="file-generic">{f.file.name}</div>
              )}
              <button
                type="button"
                className="remove-btn"
                aria-label={`Usuń plik ${f.file.name}`}
                onClick={() => onRemove(f.key)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
