import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { intakeApi, type PublicManufacturer } from '@/api/intake.api';
import { isPublicApiError } from '@/api/publicClient';
import { portalApi, type PortalDocumentCategory } from '@/api/portal.api';
import { setPortalSession } from '@/api/portal-token-storage';

type StepKey =
  'customer' | 'product' | 'proof' | 'description' | 'photos' | 'video' | 'gdpr' | 'summary';

const ALL_STEPS: { key: StepKey; title: string; desc: string }[] = [
  {
    key: 'customer',
    title: 'Twoje dane',
    desc: 'Na ten numer telefonu i e-mail wyślemy numer reklamacji oraz dostęp do Portalu Klienta.',
  },
  {
    key: 'product',
    title: 'Produkt',
    desc: 'Wybierz producenta i wpisz nazwę produktu — tak, jak jest napisana na paragonie lub fakturze.',
  },
  {
    key: 'proof',
    title: 'Dowód zakupu',
    desc: 'Podaj numer paragonu lub faktury. Możesz też dodać jego zdjęcie albo skan.',
  },
  {
    key: 'description',
    title: 'Opis problemu',
    desc: 'Opisz własnymi słowami, na czym polega usterka. Nie musi to być długi opis.',
  },
  {
    key: 'photos',
    title: 'Zdjęcia',
    desc: 'Dodaj zdjęcia usterki — najlepiej z bliska i przy dobrym świetle.',
  },
  { key: 'video', title: 'Film', desc: 'Krótki film pokazujący usterkę w działaniu.' },
  {
    key: 'gdpr',
    title: 'Zgoda RODO',
    desc: 'Ostatni krok przed wysłaniem — zgoda na przetwarzanie danych.',
  },
  { key: 'summary', title: 'Podsumowanie', desc: 'Sprawdź dane przed wysłaniem zgłoszenia.' },
];

const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: 'Jak długo trwa reklamacja?',
    answer:
      'Zwykle od kilku dni do kilku tygodni — zależy to od producenta i rodzaju usterki. Status swojej reklamacji zawsze sprawdzisz w Portalu Klienta.',
  },
  {
    question: 'Czy mogę dosłać zdjęcia później?',
    answer:
      'Tak. Po wysłaniu zgłoszenia otrzymasz dostęp do Portalu Klienta, gdzie w każdej chwili dodasz brakujące zdjęcia, filmy lub dokumenty.',
  },
  {
    question: 'Gdzie znajdę numer seryjny?',
    answer:
      'Zwykle na naklejce na produkcie (np. pod spodem, na ramie) albo w instrukcji obsługi lub na dowodzie zakupu.',
  },
  {
    question: 'Jakie pliki mogę przesłać?',
    answer:
      'Zdjęcia (JPG, PNG), krótkie filmy oraz skany lub zdjęcia dokumentów w formacie PDF, JPG lub PNG.',
  },
  {
    question: 'Czy mogę wrócić do formularza później?',
    answer:
      'Obecnie postęp wypełniania nie jest zapisywany, więc lepiej wypełnić formularz w jednym podejściu — zajmuje to około 5 minut. Warto wcześniej przygotować zdjęcia i numer paragonu.',
  },
];

interface PendingFile {
  key: string;
  file: File;
}

function extractError(err: unknown, fallback: string): string {
  if (isPublicApiError(err)) return err.response?.data.error.message ?? fallback;
  return fallback;
}

/**
 * Publiczny Formularz Reklamacyjny — pierwszy krok całego workflow SmartRMA
 * (patrz uzasadnienie modułu: to punkt wejścia, nie Portal Klienta). Klient
 * bez logowania zakłada nową reklamację; kompletność wg wymagań producenta
 * liczona jest NA BIEŻĄCO w przeglądarce (ten sam mechanizm co "Uzupełnienie
 * reklamacji" w Portalu, tu zastosowany PRZED utworzeniem sprawy — patrz
 * `computeMissing`).
 */
export function PublicComplaintFormPage() {
  const navigate = useNavigate();
  // Każda organizacja (Sklep, Producent/Dystrybutor) ma WŁASNY formularz pod swoim
  // slugiem — patrz `router.tsx` (`/reklamacja/:orgSlug`) i `intake.api.ts`.
  const { orgSlug } = useParams<{ orgSlug: string }>();

  const brandingQuery = useQuery({
    queryKey: ['intake', 'branding', orgSlug],
    queryFn: () => intakeApi.getBranding(orgSlug!),
    enabled: !!orgSlug,
    retry: false,
  });
  const manufacturersQuery = useQuery({
    queryKey: ['intake', 'manufacturers', orgSlug],
    queryFn: () => intakeApi.getManufacturers(orgSlug!),
    enabled: !!orgSlug,
    retry: false,
  });

  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdCaseNumber, setCreatedCaseNumber] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');

  const [manufacturerId, setManufacturerId] = useState<string | null>(null);
  const [productName, setProductName] = useState('');

  const [purchaseProofNumber, setPurchaseProofNumber] = useState('');
  const [proofFiles, setProofFiles] = useState<PendingFile[]>([]);

  const [description, setDescription] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [frameNumber, setFrameNumber] = useState('');
  const [incompleteOrder, setIncompleteOrder] = useState(false);
  const [incompleteOrderDetails, setIncompleteOrderDetails] = useState('');

  const [photoFiles, setPhotoFiles] = useState<PendingFile[]>([]);
  const [videoFiles, setVideoFiles] = useState<PendingFile[]>([]);

  const [requiredConsent, setRequiredConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [documentSharingConsent, setDocumentSharingConsent] = useState(false);

  const [stepError, setStepError] = useState<string | null>(null);

  const proofInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const manufacturer: PublicManufacturer | null = useMemo(
    () => manufacturersQuery.data?.find((m) => m.id === manufacturerId) ?? null,
    [manufacturersQuery.data, manufacturerId],
  );

  const activeSteps = ALL_STEPS;
  const currentStep = activeSteps[Math.min(stepIndex, activeSteps.length - 1)];

  /** Ten sam silnik reguł co "Uzupełnienie reklamacji" w Portalu (`CasesService.computeCompleteness`) — tu liczony po stronie klienta, PRZED utworzeniem sprawy. */
  const missing = useMemo(() => {
    if (!manufacturer) return [];
    const items: string[] = [];
    if (manufacturer.requiresSerialNumber && !serialNumber.trim()) items.push('Numer seryjny');
    if (manufacturer.requiresFrameNumber && !frameNumber.trim()) items.push('Numer ramy');
    if (
      manufacturer.requiresProofOfPurchase &&
      !purchaseProofNumber.trim() &&
      proofFiles.length === 0
    ) {
      items.push('Dowód zakupu (numer lub skan)');
    }
    if (manufacturer.minPhotos > 0 && photoFiles.length < manufacturer.minPhotos) {
      items.push(`Zdjęcia usterki (min. ${manufacturer.minPhotos}, dodano ${photoFiles.length})`);
    }
    if (manufacturer.requiresVideo && videoFiles.length === 0)
      items.push('Film przedstawiający usterkę');
    return items;
  }, [
    manufacturer,
    serialNumber,
    frameNumber,
    purchaseProofNumber,
    proofFiles,
    photoFiles,
    videoFiles,
  ]);

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

  function validateStep(key: StepKey): string | null {
    switch (key) {
      case 'customer':
        if (!firstName.trim() || !lastName.trim()) return 'Podaj imię i nazwisko.';
        if (!phone.trim()) return 'Podaj numer telefonu.';
        if (!email.trim() || !email.includes('@')) return 'Podaj prawidłowy adres e-mail.';
        if (!address.trim()) return 'Podaj ulicę i numer domu/mieszkania.';
        if (!postalCode.trim()) return 'Podaj kod pocztowy.';
        if (!city.trim()) return 'Podaj miejscowość.';
        return null;
      case 'product':
        if (!manufacturerId) return 'Wybierz producenta.';
        if (!productName.trim()) return 'Wpisz nazwę lub model produktu.';
        return null;
      case 'description':
        if (!description.trim()) return 'Opisz problem — to pole jest wymagane.';
        if (incompleteOrder && !incompleteOrderDetails.trim())
          return 'Napisz, czego brakuje w przesyłce.';
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
    const err = validateStep(currentStep.key);
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

  async function handleSubmit() {
    if (!canSubmit || !manufacturerId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await intakeApi.submitComplaint(orgSlug!, {
        customer: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
          city: city.trim(),
          postalCode: postalCode.trim(),
        },
        manufacturerId,
        productName: productName.trim(),
        serialNumber: serialNumber.trim() || undefined,
        frameNumber: frameNumber.trim() || undefined,
        purchaseProofNumber: purchaseProofNumber.trim() || undefined,
        description: description.trim(),
        incompleteOrder: incompleteOrder || undefined,
        incompleteOrderDetails: incompleteOrder ? incompleteOrderDetails.trim() : undefined,
        requiredConsent,
        marketingConsent,
        documentSharingConsent,
      });

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

  // Nieznany/błędny `orgSlug` w adresie (literówka w linku, stary/skasowany link) — bez tego
  // formularz renderowałby się dalej z pustą listą producentów i bez nazwy firmy, a klient
  // dowiadywałby się o problemie dopiero po wypełnieniu całego formularza, przy wysyłce.
  if (!orgSlug || brandingQuery.isError) {
    return (
      <div className="wizard-page">
        <main className="wizard-main">
          <div className="wizard-success">
            <h1>Formularz niedostępny</h1>
            <p>
              Link, z którego Państwo korzystają, jest nieprawidłowy albo nieaktualny — sprawdź, czy
              adres został skopiowany w całości, albo poproś sklep/producenta o aktualny link do
              zgłoszenia reklamacji.
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
                Kod dostępu do Portalu Klienta został wysłany na adres {email}. Prosimy sprawdzić
                skrzynkę odbiorczą oraz folder SPAM.
              </strong>
              <p style={{ margin: '10px 0 0' }}>
                Jeżeli wiadomość nie dojdzie, prosimy sprawdzić folder SPAM lub złożyć zgłoszenie
                ponownie i sprawdzić podany adres e-mail.
              </p>
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
            {branding?.name ? (
              <p>
                Dzień dobry,
                <br />
                znajdują się Państwo na stronie zgłoszeń reklamacyjnych firmy{' '}
                <strong>{branding.name}</strong>. Prosimy o wypełnienie formularza krok po kroku —
                na podstawie podanych informacji przygotujemy zgłoszenie i sprawnie rozpoczniemy
                jego obsługę.
              </p>
            ) : (
              <p>
                Prosimy o wypełnienie formularza krok po kroku — na podstawie podanych informacji
                przygotujemy zgłoszenie i sprawnie rozpoczniemy jego obsługę.
              </p>
            )}
            <span className="wizard-time-hint">⏱ Zajmie ok. 5 minut</span>
          </div>
        )}

        {stepIndex === 0 && <PrepChecklist />}

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

          {currentStep.key === 'customer' && (
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

          {currentStep.key === 'product' && (
            <>
              <div className="field">
                <label htmlFor="manufacturer">
                  Producent <span className="required-star">*</span>
                </label>
                <select
                  id="manufacturer"
                  value={manufacturerId ?? ''}
                  onChange={(e) => setManufacturerId(e.target.value || null)}
                  disabled={manufacturersQuery.isLoading}
                >
                  <option value="">— wybierz —</option>
                  {(manufacturersQuery.data ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor="productName">
                  Nazwa produktu <span className="required-star">*</span>
                </label>
                <input
                  id="productName"
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="np. Wózek Cybex Balios S Lux"
                />
              </div>

              {manufacturer &&
                (manufacturer.requiresSerialNumber || manufacturer.requiresFrameNumber) && (
                  <>
                    <div className="form-grid" style={{ marginTop: 14 }}>
                      {manufacturer.requiresSerialNumber && (
                        <div className="field">
                          <label htmlFor="serialNumber">
                            Numer seryjny <span className="required-star">*</span>
                          </label>
                          <input
                            id="serialNumber"
                            type="text"
                            value={serialNumber}
                            onChange={(e) => setSerialNumber(e.target.value)}
                          />
                        </div>
                      )}
                      {manufacturer.requiresFrameNumber && (
                        <div className="field">
                          <label htmlFor="frameNumber">
                            Numer ramy <span className="required-star">*</span>
                          </label>
                          <input
                            id="frameNumber"
                            type="text"
                            value={frameNumber}
                            onChange={(e) => setFrameNumber(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                    <p className="field-hint-static">
                      Nie wiesz, gdzie szukać? Numer seryjny lub ramy znajdziesz zwykle na naklejce
                      na produkcie albo w instrukcji obsługi.
                    </p>
                  </>
                )}
            </>
          )}

          {currentStep.key === 'proof' && (
            <>
              <div className="field">
                <label htmlFor="purchaseProofNumber">
                  Numer paragonu / faktury{' '}
                  {manufacturer?.requiresProofOfPurchase && (
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

          {currentStep.key === 'description' && (
            <div className="field">
              <label htmlFor="description">
                Opis usterki <span className="required-star">*</span>
              </label>
              <p className="field-hint-static" style={{ marginTop: 0, marginBottom: 10 }}>
                Prosimy dokładnie opisać problem. Napisz, co się stało, kiedy pojawiła się usterka i
                w jakich sytuacjach występuje.
              </p>
              <textarea
                id="description"
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Np. Wózek skrzypi podczas składania i rozkładania. Problem pojawił się około dwóch tygodni temu i występuje za każdym razem."
                style={{ width: '100%', resize: 'vertical' }}
              />

              <div className="consent-row" style={{ marginTop: 14 }}>
                <input
                  id="incompleteOrder"
                  type="checkbox"
                  checked={incompleteOrder}
                  onChange={(e) => setIncompleteOrder(e.target.checked)}
                />
                <label htmlFor="incompleteOrder">Zamówienie jest niekompletne</label>
              </div>

              {incompleteOrder && (
                <div style={{ marginTop: 10 }}>
                  <label htmlFor="incompleteOrderDetails">
                    Czego brakuje w przesyłce? <span className="required-star">*</span>
                  </label>
                  <p className="field-hint-static" style={{ marginTop: 0, marginBottom: 10 }}>
                    Prosimy opisać, jakich elementów brakuje. Prosimy również o zachowanie całej
                    otrzymanej zawartości przesyłki oraz dowodu zakupu — mogą być potrzebne do
                    rozpatrzenia zgłoszenia.
                  </p>
                  <textarea
                    id="incompleteOrderDetails"
                    rows={3}
                    value={incompleteOrderDetails}
                    onChange={(e) => setIncompleteOrderDetails(e.target.value)}
                    placeholder="Np. Brakuje instrukcji obsługi i jednej z osłon bocznych."
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>
              )}
            </div>
          )}

          {currentStep.key === 'photos' && (
            <FileDropzone
              label={`Zdjęcia usterki${manufacturer && manufacturer.minPhotos > 0 ? ` (min. ${manufacturer.minPhotos})` : ''}`}
              hint="Prosimy o dodanie wyraźnych zdjęć produktu oraz miejsca usterki — z galerii albo prosto z aparatu"
              accept="image/*"
              inputRef={photoInputRef}
              files={photoFiles}
              onPick={(files) => pickFiles(setPhotoFiles, files)}
              onRemove={(key) => removeFile(setPhotoFiles, key)}
              counterOk={manufacturer ? photoFiles.length >= manufacturer.minPhotos : true}
              counterLabel={
                manufacturer && manufacturer.minPhotos > 0
                  ? `${photoFiles.length} / ${manufacturer.minPhotos} wymaganych`
                  : `${photoFiles.length} dodanych`
              }
            />
          )}

          {currentStep.key === 'video' && (
            <>
              <FileDropzone
                label="Film przedstawiający usterkę"
                hint="Jeżeli to możliwe, nagraj krótki film pokazujący problem podczas użytkowania produktu"
                accept="video/*"
                capture
                inputRef={videoInputRef}
                files={videoFiles}
                onPick={(files) => pickFiles(setVideoFiles, files)}
                onRemove={(key) => removeFile(setVideoFiles, key)}
                counterOk={manufacturer?.requiresVideo ? videoFiles.length > 0 : true}
                counterLabel={
                  videoFiles.length > 0
                    ? 'Dodano'
                    : manufacturer?.requiresVideo
                      ? 'Wymagane'
                      : 'Opcjonalne'
                }
              />
              <p className="field-hint-static">
                {manufacturer?.requiresVideo
                  ? 'Producent wymaga filmu dla tego zgłoszenia. '
                  : 'Film nie jest obowiązkowy, ale bardzo nam pomaga w ocenie usterki. '}
                Prosimy o nagranie długości od 5 do 15 sekund.
              </p>
            </>
          )}

          {currentStep.key === 'gdpr' && (
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

          {currentStep.key === 'summary' && (
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
                  label="Klient"
                  value={`${firstName} ${lastName} · ${phone} · ${email}`}
                />
                <SummaryRow label="Adres" value={`${address}, ${postalCode} ${city}`} />
                <SummaryRow label="Producent" value={manufacturer?.name ?? '—'} />
                <SummaryRow label="Produkt" value={productName || '—'} />
                <SummaryRow label="Opis usterki" value={description || '—'} />
                {incompleteOrder && (
                  <SummaryRow
                    label="Niekompletne zamówienie"
                    value={incompleteOrderDetails || '—'}
                  />
                )}
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

        {stepIndex === 0 && <FaqSection />}
      </main>

      <nav className="wizard-nav">
        <button
          className="btn btn-secondary"
          onClick={goBack}
          disabled={stepIndex === 0 || submitting}
        >
          Wstecz
        </button>
        {currentStep.key === 'summary' ? (
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

const PREP_ITEMS: { icon: string; title: string; desc: string }[] = [
  { icon: '📄', title: 'Dowód zakupu', desc: 'Paragon, faktura lub inne potwierdzenie zakupu.' },
  {
    icon: '📦',
    title: 'Dane produktu',
    desc: 'Nazwa, producent, model, numer seryjny/ramy — jeśli dotyczy.',
  },
  { icon: '📷', title: 'Zdjęcia', desc: '2–3 wyraźne zdjęcia produktu i usterki.' },
  {
    icon: '🎥',
    title: 'Film (jeśli wymagany)',
    desc: 'Krótkie nagranie pokazujące usterkę w działaniu.',
  },
];

/** Krótka, skanowalna (~20-30 s) checklista przed wejściem w formularz — celowo BEZ ściany tekstu, patrz uzasadnienie w treści zadania "dopracowanie formularza publicznego". */
function PrepChecklist() {
  return (
    <section className="wizard-prep">
      <h2>Przed rozpoczęciem przygotuj</h2>
      <div className="prep-grid">
        {PREP_ITEMS.map((item) => (
          <div key={item.title} className="prep-item">
            <span className="prep-icon" aria-hidden="true">
              {item.icon}
            </span>
            <div>
              <p className="prep-title">{item.title}</p>
              <p className="prep-desc">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <div className="wizard-faq">
      <h2>Najczęściej zadawane pytania</h2>
      {FAQ_ITEMS.map((item) => (
        <details key={item.question} className="wizard-faq-item">
          <summary>{item.question}</summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
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
  branding: ReturnType<typeof useQuery<Awaited<ReturnType<typeof intakeApi.getBranding>>>>['data'];
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

      {branding && (
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--text-secondary)',
            marginBottom: 14,
            lineHeight: 1.6,
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--text)' }}>{branding.name}</p>
          {branding.address && <p style={{ margin: 0 }}>{branding.address}</p>}
          {branding.nip && <p style={{ margin: 0 }}>NIP: {branding.nip}</p>}
        </div>
      )}

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
