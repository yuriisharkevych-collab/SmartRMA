/* Kreator zgłoszenia reklamacyjnego (Wizard) — pierwszy kontakt klienta
   z systemem SmartRMA. Osobny moduł od reszty Portalu Klienta (ten jest
   WYŁĄCZNIE do tworzenia nowej sprawy - Portal Klienta pozostaje wyłącznie
   do odczytu, zgodnie z wcześniejszą decyzją).

   Architektura zgodna z resztą prototypu:
   - cały tekst przez t()/CLIENT_LABELS (client-labels.js),
   - dane w jednym obiekcie "draft" (wymóg zadania: model Draft + autosave),
   - walidacja real-time, procent kompletności liczony z jednej listy
     wymaganych pól (REQUIRED_CHECKS), nie rozproszony po funkcjach.

   Świadomie zamockowane (bez udawania realnej implementacji):
   - kompresja zdjęć: pokazujemy fikcyjny, ale realistyczny procent
     zmniejszenia rozmiaru; plik faktycznie wysyłany do "bazy" to wciąż
     oryginalny rozmiar w metadanych (prawdziwa kompresja wymaga biblioteki
     canvas-based, poza zakresem prototypu UX),
   - wyszukiwanie zamówienia: płaska tablica w data.js (MOCK_ORDERS) zamiast
     zapytania do systemu sprzedażowego,
   - wysyłka e-mail z potwierdzeniem: toast + wpis w konsoli, nie prawdziwy
     e-mail.
   - Podglądy zdjęć (URL.createObjectURL) działają tylko w bieżącej sesji -
     po odświeżeniu strony wznowiony draft pokaże nazwy/rozmiary plików,
     ale nie miniatury (surowe dane pliku nie są zapisywane w localStorage -
     nie nadaje się do tego jako trwały magazyn plików). */

const WIZARD_DRAFT_KEY = 'smartrma_wizard_draft_v1';

// Krok 0 ("method") jest wspólny dla obu ścieżek. Dalsze kroki zależą od
// wyboru klienta - zgłoszenie przez sklep to pełny formularz (7 kroków),
// zgłoszenie bezpośrednio do producenta to jeden, krótki krok informacyjny
// (dane producenta + instrukcja krok po kroku + opcjonalne monitorowanie
// przez sklep). getActiveSteps() jest JEDYNYM miejscem decydującym, jakie
// kroki są aktywne - reszta kodu nie sprawdza submissionMode bezpośrednio.
const METHOD_STEP = { key: 'method', titleKey: 'wizard_step_method_title', descKey: 'wizard_step_method_desc' };

const SHOP_STEPS = [
  { key: 'info', titleKey: 'wizard_step_info_title', descKey: 'wizard_step_info_desc' },
  { key: 'customer', titleKey: 'wizard_step_customer_title', descKey: 'wizard_step_customer_desc' },
  { key: 'address', titleKey: 'wizard_step_address_title', descKey: 'wizard_step_address_desc' },
  { key: 'purchase', titleKey: 'wizard_step_purchase_title', descKey: 'wizard_step_purchase_desc' },
  { key: 'description', titleKey: 'wizard_step_description_title', descKey: 'wizard_step_description_desc' },
  { key: 'attachments', titleKey: 'wizard_step_attachments_title', descKey: 'wizard_step_attachments_desc' },
  { key: 'summary', titleKey: 'wizard_step_summary_title', descKey: 'wizard_step_summary_desc' },
];

const DIRECT_STEPS = [
  { key: 'producerInfo', titleKey: 'wizard_step_producer_title', descKey: 'wizard_step_producer_desc' },
];

function getActiveSteps() {
  const rest = draft.submissionMode === 'BezposrednioDoProducenta' ? DIRECT_STEPS : SHOP_STEPS;
  return [METHOD_STEP, ...rest];
}

function defaultDraft() {
  return {
    submissionMode: null, // 'PrzezSklep' | 'BezposrednioDoProducenta'
    infoAcknowledged: false,
    customer: { firstName: '', lastName: '', phone: '', email: '' },
    address: { street: '', number: '', postalCode: '', city: '', country: 'Polska' },
    courierRequested: false,
    orderNumber: '',
    orderLookup: null, // wynik SMARTRMA_DATA.findOrder() po ostatnim sprawdzeniu
    manualProductEntry: false,
    productBrand: '', // opcjonalne, pomocnicze - automatycznie ustawia manufacturerId (patrz wirePurchaseStep)
    product: { model: '', manufacturerId: '', purchaseDate: '', serialNumber: '' },
    invoiceNumber: '',
    description: '',
    // Ścieżka "bezpośrednio do producenta" (poprawka: panel przygotowania
    // produktu + opcjonalna instrukcja e-mail).
    producerManufacturerId: null,
    producerPrepAcknowledged: false,
    wantsProducerInstructions: null, // null = jeszcze nie wybrano, true/false = Tak/Nie
    producerInstructionsEmail: '',
    informStore: false, // czy klient chce, żeby sklep monitorował zgłoszenie
    files: {
      generalPhoto: [], damagePhotos: [], video: [], extraPhotos: [], extraDocuments: [], purchaseProof: [],
    },
    consents: { rules: false, fee: false, gdpr: false },
  };
}

// Pliki (File objects) żyją TYLKO w pamięci bieżącej sesji - nie da się ich
// bezpiecznie zserializować do localStorage. Mapa id -> File, używana do
// generowania podglądów przez URL.createObjectURL().
const fileBlobs = new Map();

let draft = null;
let currentStepIndex = -1; // -1 = ekran powitalny, 0..7 = WIZARD_STEPS

document.addEventListener('DOMContentLoaded', () => {
  draft = loadDraft() || defaultDraft();
  render();
});

function loadDraft() {
  try {
    const raw = localStorage.getItem(WIZARD_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveDraft() {
  try {
    localStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify(draft));
  } catch (e) {
    console.warn('Nie udało się zapisać wersji roboczej zgłoszenia.', e);
  }
}

function clearDraft() {
  localStorage.removeItem(WIZARD_DRAFT_KEY);
}

/* --------------------------------------------------------------------------
   Wymagane pola - JEDNO miejsce definiujące kompletność formularza. Zwraca
   listę {key, label, satisfied} - używana zarówno do obliczenia procentu
   ("92% kompletności"), jak i komunikatów "Brakuje: ...".
   ------------------------------------------------------------------------ */

function getRequiredChecks() {
  if (draft.submissionMode === 'BezposrednioDoProducenta') {
    const checks = [
      { key: 'method', label: t('wizard_step_method_title'), satisfied: !!draft.submissionMode },
      { key: 'producerManufacturer', label: t('wizard_field_manufacturer'), satisfied: !!draft.producerManufacturerId },
    ];
    if (draft.informStore) {
      checks.push(
        { key: 'firstName', label: t('wizard_field_first_name'), satisfied: !!draft.customer.firstName.trim() },
        { key: 'lastName', label: t('wizard_field_last_name'), satisfied: !!draft.customer.lastName.trim() },
        { key: 'phone', label: t('wizard_field_phone'), satisfied: isValidPhone(draft.customer.phone) },
        { key: 'email', label: t('wizard_field_email'), satisfied: isValidEmail(draft.customer.email) },
      );
    }
    return checks;
  }

  return [
    { key: 'method', label: t('wizard_step_method_title'), satisfied: !!draft.submissionMode },
    { key: 'info', label: t('wizard_info_acknowledge'), satisfied: draft.infoAcknowledged },
    { key: 'firstName', label: t('wizard_field_first_name'), satisfied: !!draft.customer.firstName.trim() },
    { key: 'lastName', label: t('wizard_field_last_name'), satisfied: !!draft.customer.lastName.trim() },
    { key: 'phone', label: t('wizard_field_phone'), satisfied: isValidPhone(draft.customer.phone) },
    { key: 'email', label: t('wizard_field_email'), satisfied: isValidEmail(draft.customer.email) },
    { key: 'street', label: t('wizard_field_street'), satisfied: !!draft.address.street.trim() },
    { key: 'number', label: t('wizard_field_street_number'), satisfied: !!draft.address.number.trim() },
    { key: 'postalCode', label: t('wizard_field_postal_code'), satisfied: !!draft.address.postalCode.trim() },
    { key: 'city', label: t('wizard_field_city'), satisfied: !!draft.address.city.trim() },
    { key: 'productModel', label: t('wizard_field_product_name'), satisfied: !!draft.product.model.trim() },
    { key: 'manufacturer', label: t('wizard_field_manufacturer'), satisfied: !!draft.product.manufacturerId },
    { key: 'description', label: t('wizard_step_description_title'), satisfied: draft.description.trim().length >= 10 },
    { key: 'generalPhoto', label: t('wizard_dz_general_photo'), satisfied: draft.files.generalPhoto.length >= 1 },
    { key: 'damagePhotos', label: t('wizard_dz_damage_photos'), satisfied: draft.files.damagePhotos.length >= 2 },
    { key: 'consentRules', label: t('wizard_consent_rules'), satisfied: draft.consents.rules },
    { key: 'consentFee', label: t('wizard_consent_fee'), satisfied: draft.consents.fee },
    { key: 'consentGdpr', label: t('wizard_consent_gdpr'), satisfied: draft.consents.gdpr },
  ];
}

function getCompletionPercent() {
  const checks = getRequiredChecks();
  const done = checks.filter((c) => c.satisfied).length;
  return Math.round((done / checks.length) * 100);
}

function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim()); }
function isValidPhone(v) { return (v || '').replace(/\D/g, '').length >= 9; }

/* --------------------------------------------------------------------------
   Render — powłoka (pasek postępu, nagłówek kroku) + treść kroku.
   ------------------------------------------------------------------------ */

function render() {
  renderHeader();
  const main = document.getElementById('wizard-main');
  main.innerHTML = currentStepIndex === -1 ? introScreenHtml() : stepShellHtml();
  wireCurrentScreen();
}

function renderHeader() {
  const header = document.getElementById('wizard-header');
  if (currentStepIndex === -1) {
    header.innerHTML = '';
    return;
  }
  const steps = getActiveSteps();
  const pct = Math.round(((currentStepIndex + 1) / steps.length) * 100);
  header.innerHTML = `
    <div class="wizard-header-top">
      <span class="wizard-step-label">${t('wizard_step_of', { n: currentStepIndex + 1, total: steps.length })}: ${t(steps[currentStepIndex].titleKey)}</span>
      <span class="wizard-completion-badge">${t('wizard_completion', { pct: getCompletionPercent() })}</span>
    </div>
    <div class="wizard-progress-track"><div class="wizard-progress-fill" style="width:${pct}%;"></div></div>
  `;
}

function introScreenHtml() {
  return `
    <div class="wizard-intro">
      <h1>${t('wizard_intro_title')}</h1>
      <p>${t('wizard_intro_p1')}</p>
      <p>${t('wizard_intro_p2')}</p>
      <p>${t('wizard_intro_p3')}</p>
      <div class="wizard-time-hint">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        ${t('wizard_intro_time')}
      </div>
      <div class="mt-20">
        <button type="button" class="btn btn-primary" id="start-wizard-btn" style="padding:12px 28px;">${t('wizard_intro_start')}</button>
      </div>
    </div>
  `;
}

function stepShellHtml() {
  const steps = getActiveSteps();
  const step = steps[currentStepIndex];
  const isLast = currentStepIndex === steps.length - 1;
  const nextLabel = isLast
    ? (step.key === 'producerInfo' && !draft.informStore ? t('wizard_producer_finish') : t('wizard_submit'))
    : t('wizard_nav_next');
  return `
    <div class="wizard-card">
      <h2>${t(step.titleKey)}</h2>
      <p class="step-desc">${t(step.descKey)}</p>
      <div id="step-content"></div>
    </div>
    <div class="wizard-nav">
      <button type="button" class="btn btn-secondary" id="wizard-back-btn">${t('wizard_nav_back')}</button>
      <span class="autosave-hint">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
        ${t('wizard_autosave_hint')}
      </span>
      <button type="button" class="btn btn-primary" id="wizard-next-btn">${nextLabel}</button>
    </div>
  `;
}

/* --------------------------------------------------------------------------
   Wiring — powłoka (Wstecz/Dalej/Start) + dispatch do treści kroku.
   ------------------------------------------------------------------------ */

function wireCurrentScreen() {
  if (currentStepIndex === -1) {
    document.getElementById('start-wizard-btn').addEventListener('click', () => goToStep(0));
    return;
  }

  const steps = getActiveSteps();
  const content = document.getElementById('step-content');
  content.innerHTML = renderStepBody(steps[currentStepIndex].key);
  wireStepBody(steps[currentStepIndex].key);

  document.getElementById('wizard-back-btn').addEventListener('click', () => goToStep(currentStepIndex - 1));
  document.getElementById('wizard-next-btn').addEventListener('click', handleNext);
}

function goToStep(index) {
  if (index < -1) return;
  currentStepIndex = index;
  saveDraft();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleNext() {
  const steps = getActiveSteps();
  const missing = validateStep(steps[currentStepIndex].key);
  if (missing.length > 0) {
    showStepValidation(missing);
    return;
  }
  if (currentStepIndex === steps.length - 1) {
    submitWizard();
  } else {
    goToStep(currentStepIndex + 1);
  }
}

// Walidacja PER KROK (nie całego formularza) - czyta z tej samej listy
// getRequiredChecks(), tylko filtruje do pól należących do bieżącego kroku.
// "producerInfo" jest obsługiwany osobno w validateStep() poniżej, bo jego
// wymagania są WARUNKOWE (dane kontaktowe tylko jeśli informStore === true).
const STEP_CHECK_KEYS = {
  method: ['method'],
  info: ['info'],
  customer: ['firstName', 'lastName', 'phone', 'email'],
  address: ['street', 'number', 'postalCode', 'city'],
  purchase: ['productModel', 'manufacturer'],
  description: ['description'],
  attachments: ['generalPhoto', 'damagePhotos'],
  summary: ['consentRules', 'consentFee', 'consentGdpr'],
};

function validateStep(stepKey) {
  if (stepKey === 'producerInfo') {
    const missing = [];
    if (!draft.producerManufacturerId) {
      missing.push({ key: 'producerManufacturer', label: t('wizard_field_manufacturer') });
      return missing; // bez producenta nic dalej się nie odblokowuje - nie ma sensu zbierać reszty
    }
    if (!draft.producerPrepAcknowledged) {
      missing.push({ key: 'producerPrep', label: t('wizard_producer_prep_ack') });
      return missing; // panel przygotowania musi być zaakceptowany, zanim pokażemy resztę kroku
    }
    if (draft.wantsProducerInstructions === null) {
      missing.push({ key: 'wantsInstructions', label: t('wizard_producer_want_instructions') });
    } else if (draft.wantsProducerInstructions === true && !isValidEmail(draft.producerInstructionsEmail)) {
      missing.push({ key: 'instructionsEmail', label: t('wizard_producer_instructions_email_label') });
    }
    if (draft.informStore) {
      if (!draft.customer.firstName.trim()) missing.push({ key: 'firstName', label: t('wizard_field_first_name') });
      if (!draft.customer.lastName.trim()) missing.push({ key: 'lastName', label: t('wizard_field_last_name') });
      if (!isValidPhone(draft.customer.phone)) missing.push({ key: 'phone', label: t('wizard_field_phone') });
      if (!isValidEmail(draft.customer.email)) missing.push({ key: 'email', label: t('wizard_field_email') });
    }
    return missing;
  }
  const relevantKeys = STEP_CHECK_KEYS[stepKey] || [];
  const checks = getRequiredChecks();
  return checks.filter((c) => relevantKeys.includes(c.key) && !c.satisfied);
}

function showStepValidation(missing) {
  const content = document.getElementById('step-content');
  let box = content.querySelector('.validation-summary');
  if (!box) {
    box = document.createElement('div');
    box.className = 'validation-summary';
    content.prepend(box);
  }
  box.className = 'validation-summary incomplete';
  box.innerHTML = `<strong>${t('wizard_missing_prefix')}</strong><ul>${missing.map((m) => `<li>${m.label}</li>`).join('')}</ul>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });

  missing.forEach((m) => {
    const field = content.querySelector(`[data-field-key="${m.key}"]`);
    field?.classList.add('invalid');
  });
}

function renderStepBody(key) {
  if (key === 'method') return methodStepHtml();
  if (key === 'info') return infoStepHtml();
  if (key === 'customer') return customerStepHtml();
  if (key === 'address') return addressStepHtml();
  if (key === 'purchase') return purchaseStepHtml();
  if (key === 'description') return descriptionStepHtml();
  if (key === 'attachments') return attachmentsStepHtml();
  if (key === 'summary') return summaryStepHtml();
  if (key === 'producerInfo') return producerInfoStepHtml();
  return '';
}

function wireStepBody(key) {
  if (key === 'method') wireMethodStep();
  else if (key === 'info') wireInfoStep();
  else if (key === 'customer') wireCustomerStep();
  else if (key === 'address') wireAddressStep();
  else if (key === 'purchase') wirePurchaseStep();
  else if (key === 'description') wireDescriptionStep();
  else if (key === 'attachments') wireAttachmentsStep();
  else if (key === 'summary') wireSummaryStep();
  else if (key === 'producerInfo') wireProducerInfoStep();
}

// Wspólny helper: podłącz input/select/textarea do ścieżki w draft (np.
// "customer.firstName") z autosave po każdej zmianie.
function bindField(selector, getPath, onInput) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.addEventListener('input', () => {
    onInput(el.value);
    saveDraft();
    el.closest('.field')?.classList.remove('invalid');
    updateCompletionBadge();
  });
}

function updateCompletionBadge() {
  const badge = document.querySelector('.wizard-completion-badge');
  if (badge) badge.textContent = t('wizard_completion', { pct: getCompletionPercent() });
}

/* --------------------------------------------------------------------------
   Krok 1: Wybór sposobu zgłoszenia
   ------------------------------------------------------------------------ */

function methodStepHtml() {
  const shop = draft.submissionMode === 'PrzezSklep';
  const direct = draft.submissionMode === 'BezposrednioDoProducenta';
  return `
    <div class="method-card-group" data-field-key="method">
      <div class="method-card ${shop ? 'selected' : ''}" data-mode="PrzezSklep" tabindex="0" role="button" aria-pressed="${shop}">
        <div class="method-card-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z"/></svg>
        </div>
        <h3>${t('wizard_method_shop_title')}</h3>
        <p>${t('wizard_method_shop_desc')}</p>
        <ul>
          <li>${t('wizard_method_shop_b1')}</li>
          <li>${t('wizard_method_shop_b2')}</li>
          <li>${t('wizard_method_shop_b3')}</li>
          <li>${t('wizard_method_shop_b4')}</li>
        </ul>
        <div class="method-note">${t('wizard_method_shop_note')}</div>
      </div>

      <div class="method-card ${direct ? 'selected' : ''}" data-mode="BezposrednioDoProducenta" tabindex="0" role="button" aria-pressed="${direct}">
        <span class="method-card-badge">${t('wizard_method_direct_badge')}</span>
        <div class="method-card-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21V10l6 4v-4l6 4V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v15"/><path d="M3 21h18"/></svg>
        </div>
        <h3>${t('wizard_method_direct_title')}</h3>
        <p>${t('wizard_method_direct_desc')}</p>
        <ul>
          <li>${t('wizard_method_direct_b1')}</li>
          <li>${t('wizard_method_direct_b2')}</li>
          <li>${t('wizard_method_direct_b3')}</li>
        </ul>
        <div class="method-note">${t('wizard_method_direct_note')}</div>
      </div>
    </div>
  `;
}

function wireMethodStep() {
  document.querySelectorAll('.method-card').forEach((card) => {
    const select = () => {
      draft.submissionMode = card.dataset.mode;
      saveDraft();
      document.querySelectorAll('.method-card').forEach((c) => {
        c.classList.toggle('selected', c === card);
        c.setAttribute('aria-pressed', c === card);
      });
      document.querySelector('[data-field-key="method"]')?.classList.remove('invalid');
      updateCompletionBadge();
    };
    card.addEventListener('click', select);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
    });
  });
}

/* --------------------------------------------------------------------------
   Krok 2: Ważne informacje (opakowanie / stan produktu / opłata)
   ------------------------------------------------------------------------ */

function infoStepHtml() {
  return `
    <div class="info-panel">
      <div class="icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/></svg>
      </div>
      <div>
        <h4>${t('wizard_info_packaging_title')}</h4>
        <p>${t('wizard_info_packaging_p1')}</p>
        <p>${t('wizard_info_packaging_p2')}</p>
        <p>${t('wizard_info_packaging_p3')}</p>
      </div>
    </div>

    <div class="info-panel warn">
      <div class="icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.86 1.8 18a1.5 1.5 0 0 0 1.3 2.25h17.8A1.5 1.5 0 0 0 22.2 18L13.7 3.86a1.5 1.5 0 0 0-2.6 0Z"/></svg>
      </div>
      <div>
        <h4>${t('wizard_info_condition_title')}</h4>
        <p>${t('wizard_info_condition_p1')}</p>
        <p>${t('wizard_info_condition_p2')}</p>
        <p>${t('wizard_info_condition_p3')}</p>
        <div class="fee-tag">${t('wizard_info_condition_fee')}</div>
        <p class="mt-8">${t('wizard_info_condition_p4')}</p>
        <p>${t('wizard_info_condition_p5')}</p>
      </div>
    </div>

    <div class="consent-row" data-field-key="info">
      <input type="checkbox" id="info-ack" ${draft.infoAcknowledged ? 'checked' : ''} />
      <label for="info-ack">${t('wizard_info_acknowledge')}</label>
    </div>
  `;
}

function wireInfoStep() {
  document.getElementById('info-ack').addEventListener('change', (e) => {
    draft.infoAcknowledged = e.target.checked;
    saveDraft();
    document.querySelector('[data-field-key="info"]')?.classList.remove('invalid');
    updateCompletionBadge();
  });
}

/* --------------------------------------------------------------------------
   Krok 3: Dane klienta
   ------------------------------------------------------------------------ */

function customerStepHtml() {
  const c = draft.customer;
  return `
    <div class="form-grid">
      <div class="field" data-field-key="firstName">
        <label for="w-firstName">${t('wizard_field_first_name')}</label>
        <input type="text" id="w-firstName" value="${c.firstName}" />
        <span class="field-error">${t('wizard_error_required')}</span>
      </div>
      <div class="field" data-field-key="lastName">
        <label for="w-lastName">${t('wizard_field_last_name')}</label>
        <input type="text" id="w-lastName" value="${c.lastName}" />
        <span class="field-error">${t('wizard_error_required')}</span>
      </div>
      <div class="field" data-field-key="phone">
        <label for="w-phone">${t('wizard_field_phone')}</label>
        <input type="tel" id="w-phone" value="${c.phone}" placeholder="600 000 000" />
        <span class="field-error">${t('wizard_error_phone')}</span>
      </div>
      <div class="field" data-field-key="email">
        <label for="w-email">${t('wizard_field_email')}</label>
        <input type="email" id="w-email" value="${c.email}" />
        <span class="field-error">${t('wizard_error_email')}</span>
      </div>
    </div>
  `;
}

function wireCustomerStep() {
  bindField('#w-firstName', null, (v) => { draft.customer.firstName = v; });
  bindField('#w-lastName', null, (v) => { draft.customer.lastName = v; });
  bindField('#w-phone', null, (v) => { draft.customer.phone = v; });
  bindField('#w-email', null, (v) => { draft.customer.email = v; });
}

/* --------------------------------------------------------------------------
   Krok 4: Adres + opcjonalna usługa kurierska
   ------------------------------------------------------------------------ */

function addressStepHtml() {
  const a = draft.address;
  return `
    <div class="form-grid">
      <div class="field span-2" data-field-key="street">
        <label for="w-street">${t('wizard_field_street')}</label>
        <input type="text" id="w-street" value="${a.street}" />
        <span class="field-error">${t('wizard_error_required')}</span>
      </div>
      <div class="field" data-field-key="number">
        <label for="w-number">${t('wizard_field_street_number')}</label>
        <input type="text" id="w-number" value="${a.number}" />
        <span class="field-error">${t('wizard_error_required')}</span>
      </div>
      <div class="field" data-field-key="postalCode">
        <label for="w-postal">${t('wizard_field_postal_code')}</label>
        <input type="text" id="w-postal" value="${a.postalCode}" placeholder="00-000" />
        <span class="field-error">${t('wizard_error_required')}</span>
      </div>
      <div class="field" data-field-key="city">
        <label for="w-city">${t('wizard_field_city')}</label>
        <input type="text" id="w-city" value="${a.city}" />
        <span class="field-error">${t('wizard_error_required')}</span>
      </div>
      <div class="field">
        <label for="w-country">${t('wizard_field_country')}</label>
        <input type="text" id="w-country" value="${a.country}" />
      </div>
    </div>

    <div class="consent-row mt-16">
      <input type="checkbox" id="w-courier" ${draft.courierRequested ? 'checked' : ''} />
      <label for="w-courier">
        ${t('wizard_courier_label')}
        <div class="text-sm text-muted mt-4">${t('wizard_courier_price')}</div>
      </label>
    </div>
    <p class="text-sm text-muted mt-8" id="courier-alt-note" style="${draft.courierRequested ? 'display:none;' : ''}">${t('wizard_courier_alt_note')}</p>
  `;
}

function wireAddressStep() {
  bindField('#w-street', null, (v) => { draft.address.street = v; });
  bindField('#w-number', null, (v) => { draft.address.number = v; });
  bindField('#w-postal', null, (v) => { draft.address.postalCode = v; });
  bindField('#w-city', null, (v) => { draft.address.city = v; });
  bindField('#w-country', null, (v) => { draft.address.country = v; });
  document.getElementById('w-courier').addEventListener('change', (e) => {
    draft.courierRequested = e.target.checked;
    saveDraft();
    document.getElementById('courier-alt-note').style.display = draft.courierRequested ? 'none' : '';
  });
}

/* --------------------------------------------------------------------------
   Krok 5: Informacje o zakupie (numer zamówienia -> auto-uzupełnienie)
   ------------------------------------------------------------------------ */

function purchaseStepHtml() {
  const p = draft.product;
  const showManual = draft.manualProductEntry || (draft.orderNumber && !draft.orderLookup);
  const lookupBanner = !draft.orderNumber ? '' : draft.orderLookup
    ? `<div class="validation-summary complete">${t('wizard_order_lookup_found')}</div>`
    : `<div class="validation-summary incomplete">${t('wizard_order_lookup_not_found')}</div>`;

  return `
    <div class="field">
      <label for="w-order">${t('wizard_field_order_number')}</label>
      <input type="text" id="w-order" class="mono" value="${draft.orderNumber}" placeholder="np. ZAM/2026/10021" />
      <span class="hint">Przykładowe numery demo: ZAM/2026/10021, ZAM/2026/10088, ZAM/2026/10134</span>
    </div>
    <div id="order-lookup-banner">${lookupBanner}</div>

    <div id="product-fields" class="form-grid mt-16" style="${draft.orderLookup && !showManual ? 'opacity:0.85;' : ''}">
      ${!(draft.orderLookup && !showManual) ? `
        <div class="field span-2">
          <label for="w-brand">Marka <span class="hint">(opcjonalnie — przyspiesza wybór producenta)</span></label>
          <input type="text" id="w-brand" list="w-brand-list" value="${draft.productBrand}" placeholder="np. Cybex" autocomplete="off" />
          <datalist id="w-brand-list">${SMARTRMA_DATA.brands.map((b) => `<option value="${b.name}"></option>`).join('')}</datalist>
        </div>
      ` : ''}
      <div class="field span-2" data-field-key="productModel">
        <label for="w-product-model">${t('wizard_field_product_name')}</label>
        <input type="text" id="w-product-model" value="${p.model}" ${draft.orderLookup && !showManual ? 'readonly' : ''} />
        <span class="field-error">${t('wizard_error_required')}</span>
      </div>
      <div class="field" data-field-key="manufacturer">
        <label for="w-manufacturer">${t('wizard_field_manufacturer')}</label>
        <select id="w-manufacturer" ${draft.orderLookup && !showManual ? 'disabled' : ''}>
          <option value="">—</option>
          ${SMARTRMA_DATA.manufacturers.filter((m) => m.active).map((m) => `<option value="${m.id}" ${m.id === p.manufacturerId ? 'selected' : ''}>${m.name}</option>`).join('')}
        </select>
        <span class="field-error">${t('wizard_error_required')}</span>
      </div>
      <div class="field">
        <label for="w-purchase-date">${t('wizard_field_purchase_date')}</label>
        <input type="date" id="w-purchase-date" value="${p.purchaseDate}" ${draft.orderLookup && !showManual ? 'readonly' : ''} />
      </div>
      <div class="field">
        <label for="w-serial">${t('wizard_field_serial_number')}</label>
        <input type="text" id="w-serial" value="${p.serialNumber}" ${draft.orderLookup && !showManual ? 'readonly' : ''} />
      </div>
    </div>
    ${draft.orderLookup && !showManual ? `<button type="button" class="btn btn-ghost btn-sm mt-8" id="manual-override-btn">${t('wizard_order_change_manually')}</button>` : ''}

    <div class="field mt-16">
      <label for="w-invoice">${t('wizard_field_invoice_number')}</label>
      <input type="text" id="w-invoice" value="${draft.invoiceNumber}" placeholder="np. FV/2026/07/123" />
      <span class="hint">${t('wizard_invoice_b2b_note')}</span>
    </div>
  `;
}

function wirePurchaseStep() {
  const orderInput = document.getElementById('w-order');
  let debounceTimer = null;

  orderInput.addEventListener('input', () => {
    draft.orderNumber = orderInput.value;
    saveDraft();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => performOrderLookup(), 450);
  });

  document.getElementById('manual-override-btn')?.addEventListener('click', () => {
    draft.manualProductEntry = true;
    saveDraft();
    rerenderPurchaseStep();
  });

  document.getElementById('w-brand')?.addEventListener('input', (e) => {
    draft.productBrand = e.target.value;
    saveDraft();
    const brand = SMARTRMA_DATA.brands.find((b) => b.name.toLowerCase() === e.target.value.trim().toLowerCase());
    if (brand && brand.manufacturerId) {
      draft.product.manufacturerId = brand.manufacturerId;
      saveDraft();
      document.getElementById('w-manufacturer').value = brand.manufacturerId;
      document.querySelector('[data-field-key="manufacturer"]')?.classList.remove('invalid');
      updateCompletionBadge();
      showToast(`Producent ustawiony automatycznie na podstawie marki „${brand.name}”.`);
    }
  });

  bindField('#w-product-model', null, (v) => { draft.product.model = v; });
  document.getElementById('w-manufacturer').addEventListener('change', (e) => {
    draft.product.manufacturerId = e.target.value;
    saveDraft();
    updateCompletionBadge();
  });
  bindField('#w-purchase-date', null, (v) => { draft.product.purchaseDate = v; });
  bindField('#w-serial', null, (v) => { draft.product.serialNumber = v; });
  bindField('#w-invoice', null, (v) => { draft.invoiceNumber = v; });
}

function performOrderLookup() {
  if (!draft.orderNumber.trim()) {
    draft.orderLookup = null;
    saveDraft();
    rerenderPurchaseStep();
    return;
  }
  // BACKEND TODO: docelowo zapytanie do systemu sprzedażowego sklepu.
  const found = SMARTRMA_DATA.findOrder(draft.orderNumber);
  draft.orderLookup = found;
  if (found) {
    draft.manualProductEntry = false;
    draft.product = {
      model: found.productModel, manufacturerId: found.manufacturerId,
      purchaseDate: found.purchaseDate, serialNumber: found.serialNumber,
    };
    draft.invoiceNumber = found.invoiceNumber;
  }
  saveDraft();
  rerenderPurchaseStep();
}

function rerenderPurchaseStep() {
  document.getElementById('step-content').innerHTML = purchaseStepHtml();
  wirePurchaseStep();
  updateCompletionBadge();
}

/* --------------------------------------------------------------------------
   Krok 6: Opis usterki
   ------------------------------------------------------------------------ */

function descriptionStepHtml() {
  return `
    <div class="field" data-field-key="description">
      <label for="w-description">${t('wizard_step_description_title')}</label>
      <textarea id="w-description" rows="6" placeholder="${t('wizard_field_description_placeholder')}">${draft.description}</textarea>
      <span class="field-error">${t('wizard_error_required')}</span>
    </div>
  `;
}

function wireDescriptionStep() {
  bindField('#w-description', null, (v) => { draft.description = v; });
}

/* --------------------------------------------------------------------------
   Krok 7: Załączniki — drag & drop, podgląd zdjęć (URL.createObjectURL),
   mockowana "kompresja" (patrz nagłówek pliku - świadome uproszczenie).
   ------------------------------------------------------------------------ */

const DROPZONE_CONFIG = [
  { field: 'generalPhoto', labelKey: 'wizard_dz_general_photo', required: true, maxCount: 1, accept: 'image/*' },
  { field: 'damagePhotos', labelKey: 'wizard_dz_damage_photos', required: true, minCount: 2, accept: 'image/*' },
  { field: 'video', labelKey: 'wizard_dz_video', required: false, maxCount: 1, accept: 'video/*' },
  { field: 'extraPhotos', labelKey: 'wizard_dz_extra_photos', required: false, accept: 'image/*' },
  { field: 'extraDocuments', labelKey: 'wizard_dz_extra_documents', required: false, accept: '.pdf,image/*' },
  { field: 'purchaseProof', labelKey: 'wizard_dz_purchase_proof', required: false, accept: '.pdf,image/*' },
];

function attachmentsStepHtml() {
  return DROPZONE_CONFIG.map((cfg) => dropzoneGroupHtml(cfg)).join('');
}

function dropzoneGroupHtml(cfg) {
  const files = draft.files[cfg.field];
  const count = files.length;
  const counterHtml = cfg.minCount
    ? `<div class="dz-counter ${count >= cfg.minCount ? 'ok' : 'pending'}">${count}/${cfg.minCount}${count >= cfg.minCount ? ' ✓' : ''}</div>`
    : (count > 0 ? `<div class="dz-counter ok">${count} plik(ów)</div>` : '');

  return `
    <div class="dropzone-group" data-field-key="${cfg.field}">
      <div class="dropzone-group-label">${t(cfg.labelKey)} ${cfg.required ? '<span class="required-star">*</span>' : ''}</div>
      <div class="dropzone" data-field="${cfg.field}" tabindex="0" role="button" aria-label="${t(cfg.labelKey)}">
        <div class="dz-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 16V4M12 4 7 9M12 4l5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
        </div>
        <div class="dz-title">${t('wizard_dz_drop_hint')}</div>
        <input type="file" id="file-input-${cfg.field}" ${cfg.maxCount === 1 ? '' : 'multiple'} accept="${cfg.accept}" hidden />
      </div>
      ${counterHtml}
      <span class="field-error">${cfg.field === 'damagePhotos' ? t('wizard_error_min_damage_photos') : t('wizard_error_required')}</span>
      <div class="file-preview-grid">${files.map((f) => filePreviewItemHtml(cfg.field, f)).join('')}</div>
    </div>
  `;
}

function filePreviewItemHtml(fieldKey, file) {
  const isImage = file.type && file.type.startsWith('image/');
  const compressedTag = file.compressedSize
    ? `<div class="compressed-tag">${SMARTRMA_DATA.formatFileSize(file.size)} → ${SMARTRMA_DATA.formatFileSize(file.compressedSize)}</div>`
    : '';
  return `
    <div class="file-preview-item">
      ${isImage && file.previewUrl
        ? `<img src="${file.previewUrl}" alt="${file.name}" />`
        : `<div class="file-generic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 3v5a1 1 0 0 0 1 1h5"/><path d="M6 3h8l6 6v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/></svg><span>${file.name}</span></div>`}
      <button type="button" class="remove-btn" data-field="${fieldKey}" data-id="${file.id}" aria-label="Usuń plik ${file.name}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
      ${compressedTag}
    </div>
  `;
}

function wireAttachmentsStep() {
  DROPZONE_CONFIG.forEach((cfg) => {
    const zone = document.querySelector(`.dropzone[data-field="${cfg.field}"]`);
    const input = document.getElementById(`file-input-${cfg.field}`);

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    ['dragenter', 'dragover'].forEach((evt) => zone.addEventListener(evt, (e) => {
      e.preventDefault(); zone.classList.add('dragover');
    }));
    ['dragleave', 'drop'].forEach((evt) => zone.addEventListener(evt, (e) => {
      e.preventDefault(); zone.classList.remove('dragover');
    }));
    zone.addEventListener('drop', (e) => handleFiles(cfg, e.dataTransfer.files));
    input.addEventListener('change', () => handleFiles(cfg, input.files));
  });

  document.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => removeFile(btn.dataset.field, btn.dataset.id));
  });
}

function handleFiles(cfg, fileList) {
  const files = Array.from(fileList);
  const remainingSlots = cfg.maxCount ? Math.max(0, cfg.maxCount - draft.files[cfg.field].length) : Infinity;
  const toAdd = files.slice(0, remainingSlots);

  if (files.length > toAdd.length) {
    showToast(`Można dodać maksymalnie ${cfg.maxCount} plik(ów) w tej sekcji.`);
  }

  toAdd.forEach((file) => {
    const id = 'f' + Date.now() + Math.random().toString(36).slice(2, 8);
    fileBlobs.set(id, file);

    const isImage = file.type.startsWith('image/');
    // Mockowana kompresja - patrz nagłówek pliku. Realna implementacja
    // wymagałaby przetworzenia obrazu przez <canvas>, poza zakresem
    // prototypu UX.
    const compressedSize = isImage ? Math.round(file.size * (0.25 + Math.random() * 0.15)) : null;

    const meta = { id, name: file.name, size: file.size, type: file.type, compressedSize, previewUrl: null };
    if (isImage) meta.previewUrl = URL.createObjectURL(file);

    draft.files[cfg.field].push(meta);
  });

  saveDraft();
  document.querySelector(`[data-field-key="${cfg.field}"]`)?.classList.remove('invalid');
  rerenderAttachmentsStep();
}

function removeFile(fieldKey, id) {
  const list = draft.files[fieldKey];
  const idx = list.findIndex((f) => f.id === id);
  if (idx === -1) return;
  const [removed] = list.splice(idx, 1);
  if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
  fileBlobs.delete(id);
  saveDraft();
  rerenderAttachmentsStep();
}

function rerenderAttachmentsStep() {
  document.getElementById('step-content').innerHTML = attachmentsStepHtml();
  wireAttachmentsStep();
  updateCompletionBadge();
}

/* --------------------------------------------------------------------------
   Krok 8: Podsumowanie i zgody
   ------------------------------------------------------------------------ */

function summaryStepHtml() {
  const manufacturer = SMARTRMA_DATA.findManufacturer(draft.product.manufacturerId);
  const methodLabel = draft.submissionMode === 'BezposrednioDoProducenta'
    ? t('wizard_method_direct_title') : t('wizard_method_shop_title');

  return `
    <div class="kv-list mb-16" style="margin-bottom:20px;">
      <div class="kv-row"><span class="kv-label">${t('wizard_step_method_title')}</span><span class="kv-value">${methodLabel}</span></div>
      <div class="kv-row"><span class="kv-label">${t('wizard_field_first_name')} ${t('wizard_field_last_name')}</span><span class="kv-value">${draft.customer.firstName} ${draft.customer.lastName}</span></div>
      <div class="kv-row"><span class="kv-label">${t('wizard_field_email')}</span><span class="kv-value">${draft.customer.email}</span></div>
      <div class="kv-row"><span class="kv-label">${t('status_field_product')}</span><span class="kv-value">${draft.product.model}${manufacturer ? ' · ' + manufacturer.name : ''}</span></div>
      <div class="kv-row"><span class="kv-label">Załączniki</span><span class="kv-value">${totalFilesCount()} plik(ów)</span></div>
    </div>

    <div class="info-panel">
      <div class="icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>
      </div>
      <div>
        <h4>${t('wizard_summary_notice_title')}</h4>
        <p>${t('wizard_summary_notice_text')}</p>
      </div>
    </div>

    <div data-field-key="consentRules" data-consent-group>
      <div class="consent-row">
        <input type="checkbox" id="w-consent-rules" ${draft.consents.rules ? 'checked' : ''} />
        <label for="w-consent-rules">${t('wizard_consent_rules')}</label>
      </div>
      <div class="consent-row" data-field-key="consentFee">
        <input type="checkbox" id="w-consent-fee" ${draft.consents.fee ? 'checked' : ''} />
        <label for="w-consent-fee">${t('wizard_consent_fee')}</label>
      </div>
      <div class="consent-row" data-field-key="consentGdpr">
        <input type="checkbox" id="w-consent-gdpr" ${draft.consents.gdpr ? 'checked' : ''} />
        <label for="w-consent-gdpr">${t('wizard_consent_gdpr')}</label>
      </div>
    </div>
  `;
}

function totalFilesCount() {
  return Object.values(draft.files).reduce((sum, arr) => sum + arr.length, 0);
}

function wireSummaryStep() {
  document.getElementById('w-consent-rules').addEventListener('change', (e) => {
    draft.consents.rules = e.target.checked; saveDraft(); updateCompletionBadge();
  });
  document.getElementById('w-consent-fee').addEventListener('change', (e) => {
    draft.consents.fee = e.target.checked; saveDraft(); updateCompletionBadge();
  });
  document.getElementById('w-consent-gdpr').addEventListener('change', (e) => {
    draft.consents.gdpr = e.target.checked; saveDraft(); updateCompletionBadge();
  });
}

/* --------------------------------------------------------------------------
   Krok "producerInfo" — ścieżka "bezpośrednio do producenta" (poprawka 6).
   Krótki krok zamiast pełnego formularza: wybór producenta -> instrukcja
   krok po kroku (dane wyciągnięte z Manufacturer - już istnieją w modelu,
   żadnych nowych pól schematu) -> opcjonalna decyzja "poinformuj sklep".
   Jeśli klient NIE chce informować sklepu, wysłanie formularza NIE tworzy
   żadnej sprawy w systemie - to tylko ekran informacyjny (zgodnie z
   wymaganiem: sklep monitoruje TYLKO jeśli klient tego chce).
   ------------------------------------------------------------------------ */

function producerInfoStepHtml() {
  const manufacturer = SMARTRMA_DATA.findManufacturer(draft.producerManufacturerId);

  const showPrep = !!manufacturer;
  const showInstructionsQuestion = showPrep && draft.producerPrepAcknowledged;
  const showInstructionsContent = showInstructionsQuestion && draft.wantsProducerInstructions === true;

  return `
    <div class="field" data-field-key="producerManufacturer">
      <label for="w-producer">${t('wizard_field_manufacturer')}</label>
      <select id="w-producer">
        <option value="">—</option>
        ${SMARTRMA_DATA.manufacturers.filter((m) => m.active).map((m) => `<option value="${m.id}" ${m.id === draft.producerManufacturerId ? 'selected' : ''}>${m.name}</option>`).join('')}
      </select>
      <span class="field-error">${t('wizard_error_required')}</span>
    </div>

    ${showPrep ? `
      <div class="info-panel warn mt-16" data-field-key="producerPrep">
        <div class="icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.86 1.8 18a1.5 1.5 0 0 0 1.3 2.25h17.8A1.5 1.5 0 0 0 22.2 18L13.7 3.86a1.5 1.5 0 0 0-2.6 0Z"/></svg>
        </div>
        <div>
          <h4>${t('wizard_producer_prep_title')}</h4>
          <p>${t('wizard_producer_prep_intro')}</p>
          <ul style="margin:6px 0; padding-left:18px; display:flex; flex-direction:column; gap:4px;">
            <li>${t('wizard_producer_prep_b1')}</li>
            <li>${t('wizard_producer_prep_b2')}</li>
            <li>${t('wizard_producer_prep_b3_intro')} ${t('wizard_producer_prep_b3_1')}, ${t('wizard_producer_prep_b3_2')}, ${t('wizard_producer_prep_b3_3')}.</li>
          </ul>
          <p><strong>${t('wizard_producer_prep_warning')}</strong></p>
        </div>
      </div>

      <div class="consent-row">
        <input type="checkbox" id="w-producer-prep-ack" ${draft.producerPrepAcknowledged ? 'checked' : ''} />
        <label for="w-producer-prep-ack">${t('wizard_producer_prep_ack')}</label>
      </div>
    ` : ''}

    ${showInstructionsQuestion ? `
      <div class="field mt-16" data-field-key="wantsInstructions">
        <label>${t('wizard_producer_want_instructions')}</label>
        <div class="flex gap-10 mt-8">
          <label class="flex items-center gap-6" style="font-weight:500; cursor:pointer;">
            <input type="radio" name="wants-instructions" value="yes" ${draft.wantsProducerInstructions === true ? 'checked' : ''} style="width:auto;" /> ${t('wizard_yes')}
          </label>
          <label class="flex items-center gap-6" style="font-weight:500; cursor:pointer;">
            <input type="radio" name="wants-instructions" value="no" ${draft.wantsProducerInstructions === false ? 'checked' : ''} style="width:auto;" /> ${t('wizard_no')}
          </label>
        </div>
        <span class="field-error">${t('wizard_error_required')}</span>
      </div>

      ${draft.wantsProducerInstructions === true ? `
        <div class="field mt-16" data-field-key="instructionsEmail">
          <label for="w-instructions-email">${t('wizard_producer_instructions_email_label')}</label>
          <input type="email" id="w-instructions-email" value="${draft.producerInstructionsEmail}" />
          <span class="field-error">${t('wizard_error_email')}</span>
        </div>
      ` : ''}
    ` : ''}

    <div id="producer-instructions">${showInstructionsContent ? `
      <div class="validation-summary complete mt-8">${t('wizard_producer_instructions_sent')}</div>
      ${producerInstructionsHtml(manufacturer)}
    ` : ''}</div>

    <div class="consent-row mt-16">
      <input type="checkbox" id="w-inform-store" ${draft.informStore ? 'checked' : ''} />
      <label for="w-inform-store">${t('wizard_producer_inform_store')}</label>
    </div>

    <div id="producer-contact-fields" class="${draft.informStore ? '' : 'hidden'}">
      <div class="validation-summary complete mt-8">${t('wizard_producer_monitored_note')}</div>
      <div class="form-grid mt-8">
        <div class="field" data-field-key="firstName">
          <label for="w-p-firstName">${t('wizard_field_first_name')}</label>
          <input type="text" id="w-p-firstName" value="${draft.customer.firstName}" />
          <span class="field-error">${t('wizard_error_required')}</span>
        </div>
        <div class="field" data-field-key="lastName">
          <label for="w-p-lastName">${t('wizard_field_last_name')}</label>
          <input type="text" id="w-p-lastName" value="${draft.customer.lastName}" />
          <span class="field-error">${t('wizard_error_required')}</span>
        </div>
        <div class="field" data-field-key="phone">
          <label for="w-p-phone">${t('wizard_field_phone')}</label>
          <input type="tel" id="w-p-phone" value="${draft.customer.phone}" />
          <span class="field-error">${t('wizard_error_phone')}</span>
        </div>
        <div class="field" data-field-key="email">
          <label for="w-p-email">${t('wizard_field_email')}</label>
          <input type="email" id="w-p-email" value="${draft.customer.email}" />
          <span class="field-error">${t('wizard_error_email')}</span>
        </div>
      </div>
    </div>
  `;
}

function producerInstructionsHtml(m) {
  const steps = [
    m.submissionMethod ? `${t('wizard_producer_step_method')}: ${m.submissionMethod}` : null,
    m.complaintProcedure,
    m.requiredDocumentsNote ? `${t('wizard_producer_step_documents')}: ${m.requiredDocumentsNote}` : null,
    m.requiredPhotosNote ? `${t('wizard_producer_step_photos')}: ${m.requiredPhotosNote}` : null,
  ].filter(Boolean);

  return `
    <div class="info-panel mt-16">
      <div class="icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21V10l6 4v-4l6 4V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v15"/><path d="M3 21h18"/></svg>
      </div>
      <div>
        <h4>${m.name} — ${t('wizard_producer_instructions_title')}</h4>
        ${m.contactEmail ? `<p><strong>${t('contact_shop_email_label')}:</strong> ${m.contactEmail}</p>` : ''}
        ${m.portalUrl ? `<p><strong>Portal:</strong> ${m.portalUrl}</p>` : ''}
        <ol style="margin:10px 0 0; padding-left:18px; display:flex; flex-direction:column; gap:6px;">
          ${steps.map((s) => `<li style="font-size:12.5px; color:var(--text-secondary);">${s}</li>`).join('')}
        </ol>
      </div>
    </div>
  `;
}

function wireProducerInfoStep() {
  document.getElementById('w-producer').addEventListener('change', (e) => {
    draft.producerManufacturerId = e.target.value || null;
    saveDraft();
    rerenderProducerInfoStep();
  });

  document.getElementById('w-producer-prep-ack')?.addEventListener('change', (e) => {
    draft.producerPrepAcknowledged = e.target.checked;
    saveDraft();
    rerenderProducerInfoStep();
  });

  document.querySelectorAll('input[name="wants-instructions"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      draft.wantsProducerInstructions = e.target.value === 'yes';
      saveDraft();
      rerenderProducerInfoStep();
    });
  });

  document.getElementById('w-instructions-email')?.addEventListener('input', (e) => {
    draft.producerInstructionsEmail = e.target.value;
    saveDraft();
    document.querySelector('[data-field-key="instructionsEmail"]')?.classList.remove('invalid');
    // Instrukcja pojawia się na bieżąco, gdy adres jest poprawny - patrz
    // uwaga w spec: "alternatywnie system wyświetla instrukcję na ekranie"
    // (w prototypie nie ma realnej wysyłki e-mail, więc to jest jedyny
    // sposób pokazania efektu - patrz submitDirectToProducer()).
    const instructionsBox = document.getElementById('producer-instructions');
    const manufacturer = SMARTRMA_DATA.findManufacturer(draft.producerManufacturerId);
    if (isValidEmail(draft.producerInstructionsEmail) && manufacturer) {
      instructionsBox.innerHTML = `
        <div class="validation-summary complete mt-8">${t('wizard_producer_instructions_sent')}</div>
        ${producerInstructionsHtml(manufacturer)}
      `;
    } else {
      instructionsBox.innerHTML = '';
    }
    updateCompletionBadge();
  });

  document.getElementById('w-inform-store').addEventListener('change', (e) => {
    draft.informStore = e.target.checked;
    saveDraft();
    document.getElementById('producer-contact-fields').classList.toggle('hidden', !draft.informStore);
    updateCompletionBadge();
    document.getElementById('wizard-next-btn').textContent = draft.informStore ? t('wizard_submit') : t('wizard_producer_finish');
  });

  bindField('#w-p-firstName', null, (v) => { draft.customer.firstName = v; });
  bindField('#w-p-lastName', null, (v) => { draft.customer.lastName = v; });
  bindField('#w-p-phone', null, (v) => { draft.customer.phone = v; });
  bindField('#w-p-email', null, (v) => { draft.customer.email = v; });
}

function rerenderProducerInfoStep() {
  document.getElementById('step-content').innerHTML = producerInfoStepHtml();
  wireProducerInfoStep();
  updateCompletionBadge();
}

/* --------------------------------------------------------------------------
   Wysyłka zgłoszenia — tworzy Customer (jeśli nie istnieje) + Product +
   Case, dokładnie jak case-new.js po stronie pracownika, tylko źródłem
   jest klient, nie pracownik. Reużywa SMARTRMA_DATA.generateCaseNumber()
   (współdzielone, patrz data.js).
   ------------------------------------------------------------------------ */

function submitWizard() {
  if (draft.submissionMode === 'BezposrednioDoProducenta') {
    submitDirectToProducer();
  } else {
    submitViaShop();
  }
}

function submitViaShop() {
  const existingCustomer = SMARTRMA_DATA.customers.find((c) =>
    c.email.toLowerCase() === draft.customer.email.toLowerCase() || c.phone.replace(/\D/g, '') === draft.customer.phone.replace(/\D/g, ''));

  let customerId;
  if (existingCustomer) {
    customerId = existingCustomer.id;
  } else {
    const newCustomer = {
      id: 'c' + (SMARTRMA_DATA.customers.length + 1) + '-' + Date.now(),
      firstName: draft.customer.firstName.trim(),
      lastName: draft.customer.lastName.trim(),
      phone: draft.customer.phone.trim(),
      email: draft.customer.email.trim(),
      address: `${draft.address.street} ${draft.address.number}, ${draft.address.postalCode} ${draft.address.city}, ${draft.address.country}`,
    };
    SMARTRMA_DATA.customers.push(newCustomer);
    customerId = newCustomer.id;
  }

  const newProduct = {
    manufacturerId: draft.product.manufacturerId,
    model: draft.product.model.trim(),
    serialNumber: draft.product.serialNumber.trim(),
    frameNumber: '',
    purchaseDate: draft.product.purchaseDate || null,
    purchaseProofNumber: draft.invoiceNumber.trim(),
  };

  const caseNumber = SMARTRMA_DATA.generateCaseNumber();
  const clientAccessCode = generateWizardAccessCode();
  const now = new Date('2026-07-18T12:00:00').toISOString();

  const documents = [];
  ['generalPhoto', 'damagePhotos', 'extraPhotos'].forEach((key) => {
    draft.files[key].forEach((f) => documents.push(fileMetaToDocument(f, 'photo')));
  });
  draft.files.video.forEach((f) => documents.push(fileMetaToDocument(f, 'photo')));
  draft.files.extraDocuments.forEach((f) => documents.push(fileMetaToDocument(f, 'other')));
  draft.files.purchaseProof.forEach((f) => documents.push(fileMetaToDocument(f, 'other')));

  const newCase = {
    id: 'case-wizard-' + Date.now(),
    caseNumber,
    customerId,
    product: newProduct,
    complaintType: 'Warranty',
    source: 'Formularz WWW',
    submissionMode: 'PrzezSklep', // patrz docs/DECISIONS.md (nowe pole, poza schema.prisma)
    deliveryAddress: { ...draft.address }, // patrz docs/DECISIONS.md (nowe pole)
    courierRequested: draft.courierRequested, // patrz docs/DECISIONS.md (nowe pole)
    preparationFeeAccepted: draft.consents.fee, // patrz docs/DECISIONS.md (nowe pole)
    clientPortalEnabled: true,
    clientAccessCode,
    clientLastLogin: null,
    clientAccessToken: null,
    clientAccessTokenUsed: false,
    documents,
    description: draft.description.trim(),
    customerStatement: draft.description.trim(),
    requestedResolution: 'Naprawa',
    status: 'Nowa',
    priority: 'Normalny',
    decision: null,
    decisionAt: null,
    nextAction: 'Zweryfikuj kompletność zgłoszenia i przyjmij produkt od klienta.',
    nextActionDueDate: '2026-07-21',
    requiresManagerApproval: false,
    isException: false,
    ownerId: 'u1', // BACKEND TODO: docelowo automatyczne przypisanie opiekuna wg reguły obciążenia zespołu
    createdAt: now,
    history: [
      { action: 'CaseCreated', newValue: 'Nowa', userId: null, createdAt: now, visibleForCustomer: true },
    ],
  };

  SMARTRMA_DATA.cases.unshift(newCase);
  SMARTRMA_DATA.persist();
  clearDraft();

  // BACKEND TODO: e-mail z potwierdzeniem (BR-014). Tutaj tylko log - brak
  // realnej wysyłki.
  console.info(`[MOCK EMAIL] Potwierdzenie zgłoszenia ${caseNumber} wysłane na ${draft.customer.email}.`);

  sessionStorage.setItem('smartrma_client_session', JSON.stringify({ caseId: newCase.id, caseNumber: newCase.caseNumber }));

  renderSuccessScreen(newCase);
}

function fileMetaToDocument(fileMeta, category) {
  const ext = (fileMeta.name.split('.').pop() || '').toUpperCase();
  const fileType = ['JPG', 'JPEG', 'PNG'].includes(ext) ? (ext === 'JPEG' ? 'JPG' : ext) : (fileMeta.type.startsWith('video/') ? 'MP4' : 'PDF');
  return {
    id: fileMeta.id, fileName: fileMeta.name, fileType,
    mimeType: fileMeta.type || 'application/octet-stream',
    fileSize: fileMeta.compressedSize || fileMeta.size,
    category, uploadedAt: new Date('2026-07-18T12:00:00').toISOString(),
  };
}

function generateWizardAccessCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const l1 = letters[Math.floor(Math.random() * letters.length)];
  const l2 = letters[Math.floor(Math.random() * letters.length)];
  const digit = Math.floor(Math.random() * 10);
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `${l1}${l2}${digit}-${suffix}`;
}

/* --------------------------------------------------------------------------
   Ścieżka "bezpośrednio do producenta" (poprawka 6). Dwa scenariusze:
   - informStore === false: NIC nie zapisujemy w systemie - to był tylko
     ekran informacyjny z danymi producenta. Prosty ekran "Powodzenia".
   - informStore === true: tworzymy MINIMALNĄ sprawę monitorowaną - bez
     opisu usterki/zdjęć (producent zbiera je bezpośrednio), bo sklep tylko
     obserwuje przebieg, nie prowadzi sprawy merytorycznie.
   ------------------------------------------------------------------------ */

function submitDirectToProducer() {
  // BACKEND TODO: prawdziwa wysyłka e-mail z instrukcją zgłoszenia do
  // producenta (CLIENT_PORTAL_API.md - nowy endpoint, poza obecnym
  // zakresem). Niezależne od wyboru monitoringu przez sklep poniżej.
  if (draft.wantsProducerInstructions === true) {
    const manufacturer = SMARTRMA_DATA.findManufacturer(draft.producerManufacturerId);
    console.info(`[MOCK EMAIL] Instrukcja zgłoszenia do producenta (${manufacturer ? manufacturer.name : '—'}) wysłana na ${draft.producerInstructionsEmail}.`);
  }

  if (!draft.informStore) {
    clearDraft();
    renderProducerOnlyScreen();
    return;
  }

  const existingCustomer = SMARTRMA_DATA.customers.find((c) =>
    c.email.toLowerCase() === draft.customer.email.toLowerCase() || c.phone.replace(/\D/g, '') === draft.customer.phone.replace(/\D/g, ''));

  let customerId;
  if (existingCustomer) {
    customerId = existingCustomer.id;
  } else {
    const newCustomer = {
      id: 'c' + (SMARTRMA_DATA.customers.length + 1) + '-' + Date.now(),
      firstName: draft.customer.firstName.trim(),
      lastName: draft.customer.lastName.trim(),
      phone: draft.customer.phone.trim(),
      email: draft.customer.email.trim(),
      address: '',
    };
    SMARTRMA_DATA.customers.push(newCustomer);
    customerId = newCustomer.id;
  }

  const manufacturer = SMARTRMA_DATA.findManufacturer(draft.producerManufacturerId);
  const caseNumber = SMARTRMA_DATA.generateCaseNumber();
  const clientAccessCode = generateWizardAccessCode();
  const now = new Date('2026-07-18T12:00:00').toISOString();

  const newCase = {
    id: 'case-wizard-' + Date.now(),
    caseNumber,
    customerId,
    product: { manufacturerId: draft.producerManufacturerId, model: '', serialNumber: '', frameNumber: '', purchaseDate: null, purchaseProofNumber: '' },
    complaintType: 'Warranty',
    source: 'Formularz WWW',
    submissionMode: 'BezposrednioDoProducenta', // patrz docs/DECISIONS.md (nowe pole, poza schema.prisma)
    deliveryAddress: null,
    courierRequested: false,
    preparationFeeAccepted: false,
    clientPortalEnabled: true,
    clientAccessCode,
    clientLastLogin: null,
    clientAccessToken: null,
    clientAccessTokenUsed: false,
    documents: [],
    description: `Zgłoszenie złożone bezpośrednio u producenta (${manufacturer ? manufacturer.name : '—'}). Sklep monitoruje sprawę na prośbę klienta.`,
    customerStatement: '',
    requestedResolution: 'Naprawa',
    status: 'Nowa',
    priority: 'Normalny',
    decision: null,
    decisionAt: null,
    nextAction: 'Sprawa monitorowana - klient zgłosił reklamację bezpośrednio do producenta. Sprawdź, czy potrzebuje wsparcia.',
    nextActionDueDate: '2026-07-25',
    requiresManagerApproval: false,
    isException: false,
    ownerId: 'u1', // BACKEND TODO: docelowo automatyczne przypisanie opiekuna wg reguły obciążenia zespołu
    createdAt: now,
    history: [
      { action: 'CaseCreated', newValue: 'Nowa', userId: null, createdAt: now, visibleForCustomer: true },
    ],
  };

  SMARTRMA_DATA.cases.unshift(newCase);
  SMARTRMA_DATA.persist();
  clearDraft();

  // BACKEND TODO: e-mail informujący klienta, że sklep monitoruje
  // zgłoszenie (wymaganie 10.8 zadania) - tutaj tylko log.
  console.info(`[MOCK EMAIL] Informacja o monitorowaniu zgłoszenia ${caseNumber} przez sklep wysłana na ${draft.customer.email}.`);

  sessionStorage.setItem('smartrma_client_session', JSON.stringify({ caseId: newCase.id, caseNumber: newCase.caseNumber }));
  renderSuccessScreen(newCase);
}

function renderProducerOnlyScreen() {
  const manufacturer = SMARTRMA_DATA.findManufacturer(draft.producerManufacturerId);
  const showInstructions = draft.wantsProducerInstructions === true && manufacturer;

  document.getElementById('wizard-header').innerHTML = '';
  document.getElementById('wizard-main').innerHTML = `
    <div class="wizard-success">
      <div class="success-icon">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 5 5 9-9"/></svg>
      </div>
      <h1>${t('wizard_producer_only_title')}</h1>
      <p class="text-sm text-secondary" style="max-width:420px; margin:0 auto;">${t('wizard_producer_only_desc')}</p>
      ${showInstructions ? `<div style="text-align:left; margin-top:20px;">${producerInstructionsHtml(manufacturer)}</div>` : ''}
      <div class="flex items-center gap-10" style="justify-content:center; margin-top:24px;">
        <a href="client-new-case.html" class="btn btn-secondary">${t('wizard_success_new_case')}</a>
      </div>
    </div>
  `;
}

function renderSuccessScreen(newCase) {
  const manufacturer = draft.wantsProducerInstructions === true ? SMARTRMA_DATA.findManufacturer(draft.producerManufacturerId) : null;

  document.getElementById('wizard-header').innerHTML = '';
  document.getElementById('wizard-main').innerHTML = `
    <div class="wizard-success">
      <div class="success-icon">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 5 5 9-9"/></svg>
      </div>
      <h1>${t('wizard_success_title')}</h1>
      <p class="text-sm text-secondary">${t('wizard_success_email_note')}</p>

      <div class="rma-number mono">${newCase.caseNumber}</div>
      <p class="text-sm text-muted">${t('wizard_success_rma_label')}</p>

      <div class="access-code-display" style="justify-content:center; max-width:260px; margin:16px auto;">
        ${newCase.clientAccessCode}
      </div>
      <p class="text-sm text-muted">${t('wizard_success_code_label')}</p>

      ${manufacturer ? `<div style="text-align:left; margin-top:20px;">${producerInstructionsHtml(manufacturer)}</div>` : ''}

      <div class="flex items-center gap-10" style="justify-content:center; margin-top:24px; flex-wrap:wrap;">
        <a href="client-portal.html?id=${newCase.id}" class="btn btn-primary">${t('wizard_success_go_to_portal')}</a>
        <a href="client-new-case.html" class="btn btn-secondary" id="new-case-link">${t('wizard_success_new_case')}</a>
      </div>
    </div>
  `;
  document.getElementById('new-case-link').addEventListener('click', () => clearDraft());
}
