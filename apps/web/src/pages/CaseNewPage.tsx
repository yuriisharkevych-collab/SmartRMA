import { useMutation, useQuery } from '@tanstack/react-query';
import { type FormEvent, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { casesApi, type ComplaintSource, type ComplaintType } from '@/api/cases.api';
import { isApiError } from '@/api/client';
import { contractorsApi } from '@/api/contractors.api';
import { customersApi, type Customer } from '@/api/customers.api';
import { documentsApi } from '@/api/documents.api';
import { manufacturersApi } from '@/api/manufacturers.api';
import { brandsApi, productsApi } from '@/api/products.api';
import { usersApi } from '@/api/users.api';
import { UploadIcon, XIcon } from '@/components/common/icons';
import { useAuth } from '@/hooks/useAuth';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useKeyboardList } from '@/hooks/useKeyboardList';
import { useToast } from '@/hooks/useToast';
import { focusNextOnEnter } from '@/lib/focus-next';

const SOURCE_OPTIONS: Array<{ value: ComplaintSource; label: string }> = [
  { value: 'SklepStacjonarny', label: 'Sklep stacjonarny' },
  { value: 'Email', label: 'E-mail' },
  { value: 'Telefon', label: 'Telefon' },
  { value: 'FormularzWWW', label: 'Formularz WWW' },
  { value: 'Marketplace', label: 'Marketplace' },
  { value: 'Inne', label: 'Inne' },
];

/** `requestedResolution` jest w API zwykłym `string` — lista to podpowiedź UX (1:1 z `<select id="f-resolution">` prototypu), nie ograniczenie backendu. */
const RESOLUTION_OPTIONS = [
  'Naprawa',
  'Wymiana produktu',
  'Wymiana części',
  'Zwrot środków',
  'Odstąpienie od umowy',
];

interface PickedFile {
  file: File;
  /** `DocumentCategory` z `schema.prisma` — rozdziela dowód zakupu od pozostałych załączników (BR/CASE-006). */
  category: 'PurchaseProof' | 'Photo' | 'Video' | 'Other';
}

/**
 * Odpowiednik `case-new.html` + `js/case-new.js`, w kolejności sekcji
 * uzgodnionej po testach: typ zgłoszenia → źródło → klient → produkt →
 * dowód zakupu → opis → zdjęcia i pliki → oczekiwane rozwiązanie →
 * właściciel sprawy.
 *
 * Produkt: prototyp miał wolny tekst „model" + select producenta + datalist
 * marek. Tutaj `CaseItem.productId` musi wskazywać pozycję katalogu
 * (`Product`), więc pole „model" jest polem z podpowiedziami po istniejących
 * produktach danego producenta, a gdy pracownik wpisze model spoza katalogu —
 * `Product` zakładany jest automatycznie przy zapisie (`POST /products`).
 * Dzięki temu wpisywanie jest tak swobodne jak w prototypie, a katalog
 * pozostaje spójny (raporty „wszystkie reklamacje danego produktu" dalej mają
 * sens).
 *
 * Marka: wybór marki podstawia producenta automatycznie — dokładnie jak
 * `wireBrandAutoDetect()` w prototypie („sugeruje, nie wymusza", BR-076).
 */
export function CaseNewPage() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  // --- 1. Typ zgłoszenia / 2. Źródło ---
  const [complaintType, setComplaintType] = useState<ComplaintType>('Warranty');
  const [source, setSource] = useState<ComplaintSource>('SklepStacjonarny');

  // --- 3. Klient ---
  const [customerQuery, setCustomerQuery] = useState('');
  const debouncedCustomerQuery = useDebouncedValue(customerQuery, 300);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    address: '',
  });
  const [savingCustomer, setSavingCustomer] = useState(false);

  const { data: customerResults, isFetching: searchingCustomers } = useQuery({
    queryKey: ['customers-search', debouncedCustomerQuery],
    queryFn: () => customersApi.search(debouncedCustomerQuery),
    enabled: debouncedCustomerQuery.trim().length >= 2,
  });

  /** Po wyborze/zapisaniu klienta fokus wraca do formularza reklamacji (marka) — bez tego trzeba było klikać myszą, żeby wrócić do wprowadzania danych. */
  const brandSelectRef = useRef<HTMLSelectElement>(null);
  function selectCustomer(customer: Customer) {
    setSelectedCustomer(customer);
    setCustomerQuery('');
    setShowNewCustomerForm(false);
    setTimeout(() => brandSelectRef.current?.focus(), 0);
  }

  const customerList = customerResults ?? [];
  const customerKeys = useKeyboardList(
    customerList.length,
    (index) => selectCustomer(customerList[index]),
    () => setCustomerQuery(''),
  );

  // --- 4. Produkt ---
  const { data: manufacturers } = useQuery({
    queryKey: ['manufacturers'],
    queryFn: manufacturersApi.list,
  });
  const { data: contractors } = useQuery({
    queryKey: ['contractors'],
    queryFn: contractorsApi.list,
  });
  const { data: brands } = useQuery({
    queryKey: ['brands'],
    queryFn: brandsApi.list,
    enabled: hasPermission('brands.manage'),
    retry: false,
  });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: productsApi.list });

  const [manufacturerId, setManufacturerId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [frameNumber, setFrameNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchaseProofNumber, setPurchaseProofNumber] = useState('');

  const contractorById = useMemo(
    () => new Map((contractors ?? []).map((c) => [c.id, c])),
    [contractors],
  );
  const manufacturerName = (id: string) => {
    const m = (manufacturers ?? []).find((x) => x.id === id);
    return m ? (contractorById.get(m.contractorId)?.name ?? '—') : '—';
  };
  const brandsForManufacturer = (brands ?? []).filter(
    (b) => !manufacturerId || b.manufacturerId === manufacturerId,
  );
  const productsForManufacturer = (products ?? []).filter(
    (p) => !manufacturerId || p.manufacturerId === manufacturerId,
  );

  /** Producent wymagany przez `Manufacturer.requiresXxx` — podpowiadamy pracownikowi, co ten producent egzekwuje. */
  const selectedManufacturer = (manufacturers ?? []).find((m) => m.id === manufacturerId);

  // --- 5/7. Pliki ---
  const [files, setFiles] = useState<PickedFile[]>([]);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const attachmentsInputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null, category: PickedFile['category']) {
    if (!list) return;
    // `Array.from(list)` MUSI wykonać się tutaj, a nie w updaterze `setFiles` — updater
    // React wywołuje asynchronicznie, a wołający zaraz po tej funkcji czyści `input.value`,
    // co opróżnia żywy obiekt `FileList`. Odczytany wtedy byłby już pusty.
    const picked = Array.from(list).map((file) => ({ file, category }));
    setFiles((current) => [...current, ...picked]);
  }

  // --- 6. Opis / 8. Rozwiązanie ---
  const [description, setDescription] = useState('');
  const [customerStatement, setCustomerStatement] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [requestedResolution, setRequestedResolution] = useState('');

  // --- 9. Właściciel ---
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
    enabled: hasPermission('users.view'),
    retry: false,
  });
  const [ownerId, setOwnerId] = useState('');
  const effectiveOwnerId = ownerId || user?.userId || '';

  // --- 10. Portal Klienta ---
  const [enablePortalOnCreate, setEnablePortalOnCreate] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const createCaseMutation = useMutation({ mutationFn: casesApi.create });
  const [uploading, setUploading] = useState(false);
  const submitting = createCaseMutation.isPending || uploading;

  /** Prototyp otwierał formularz nowego klienta i po zapisie od razu go wybierał — bez ponownego wyszukiwania. */
  async function handleSaveNewCustomer() {
    setFormError(null);
    if (
      !newCustomer.firstName.trim() ||
      !newCustomer.lastName.trim() ||
      !newCustomer.phone.trim()
    ) {
      setFormError('Uzupełnij imię, nazwisko i telefon nowego klienta.');
      return;
    }
    setSavingCustomer(true);
    try {
      const created = await customersApi.create({
        firstName: newCustomer.firstName.trim(),
        lastName: newCustomer.lastName.trim(),
        phone: newCustomer.phone.trim(),
        email: newCustomer.email.trim() || undefined,
        address: newCustomer.address.trim() || undefined,
      });
      selectCustomer(created);
      setNewCustomer({ firstName: '', lastName: '', phone: '', email: '', address: '' });
      showToast(`Klient ${created.firstName} ${created.lastName} dodany i wybrany.`);
    } catch (err) {
      setFormError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się zapisać klienta.')
          : 'Nie udało się zapisać klienta.',
      );
    } finally {
      setSavingCustomer(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!selectedCustomer) return setFormError('Wybierz klienta lub dodaj nowego.');
    if (!manufacturerId) return setFormError('Wybierz producenta.');
    if (!model.trim()) return setFormError('Podaj model produktu.');
    if (!itemDescription.trim()) return setFormError('Opisz usterkę produktu.');
    if (!description.trim()) return setFormError('Uzupełnij opis zgłoszenia.');
    if (!requestedResolution) return setFormError('Wybierz oczekiwane rozwiązanie.');

    // Wymagania producenta (CASE-004/005/006) — sprawdzamy po stronie UI, żeby pracownik
    // dowiedział się o braku PRZED wysłaniem, a nie z błędu serwera.
    if (selectedManufacturer?.requiresSerialNumber && !serialNumber.trim()) {
      return setFormError(`Producent ${manufacturerName(manufacturerId)} wymaga numeru seryjnego.`);
    }
    if (selectedManufacturer?.requiresFrameNumber && !frameNumber.trim()) {
      return setFormError(`Producent ${manufacturerName(manufacturerId)} wymaga numeru ramy.`);
    }
    if (
      selectedManufacturer?.requiresProofOfPurchase &&
      !purchaseProofNumber.trim() &&
      !files.some((f) => f.category === 'PurchaseProof')
    ) {
      return setFormError(
        `Producent ${manufacturerName(manufacturerId)} wymaga dowodu zakupu — podaj numer albo dołącz plik.`,
      );
    }

    try {
      // Model spoza katalogu — backend (`CasesService.create`) sam znajduje pasujący istniejący
      // `Product` po nazwie+producencie albo tworzy nowy; nie wołamy tu `POST /products`
      // bezpośrednio, bo to wymagałoby od pracownika osobnego uprawnienia `products.manage`,
      // którego rejestrowanie sprawy dla nowego modelu nie powinno wymagać (patrz UAT/RBAC.md §3).
      const existing = productsForManufacturer.find(
        (p) => p.name.trim().toLowerCase() === model.trim().toLowerCase(),
      );

      const created = await createCaseMutation.mutateAsync({
        customerId: selectedCustomer.id,
        ownerId: effectiveOwnerId || undefined,
        complaintType,
        source,
        requestedResolution,
        description: description.trim(),
        customerStatement: customerStatement.trim() || undefined,
        items: [
          {
            ...(existing
              ? { productId: existing.id }
              : { productName: model.trim(), brandId: brandId || undefined }),
            manufacturerId,
            description: itemDescription.trim(),
            serialNumber: serialNumber.trim() || undefined,
            frameNumber: frameNumber.trim() || undefined,
            purchaseDate: purchaseDate || undefined,
            purchaseProofNumber: purchaseProofNumber.trim() || undefined,
          },
        ],
      });

      if (files.length > 0) {
        setUploading(true);
        for (const picked of files) {
          await documentsApi.upload(created.id, picked.file, picked.category);
        }
      }

      // Ten sam endpoint co przełącznik "Portal klienta" na szczegółach sprawy
      // (`casesApi.enablePortal` → `CasesService.enablePortal`) — generuje działający
      // kod dostępu i wysyła e-mail `case.portal_access.customer` z linkiem i kodem.
      // Świadomie WOŁANY PO utworzeniu sprawy, nie przez `clientPortalEnabled` w DTO
      // tworzenia: samo ustawienie flagi bez wygenerowania kodu zostawiłoby Portal
      // "włączony", ale bez działającego dostępu dla klienta.
      let portalEnableFailed = false;
      if (enablePortalOnCreate) {
        try {
          await casesApi.enablePortal(created.id);
        } catch {
          portalEnableFailed = true;
        }
      }

      showToast(
        portalEnableFailed
          ? `Zgłoszenie ${created.caseNumber} zapisane, ale nie udało się włączyć Portalu Klienta — spróbuj ze szczegółów sprawy.`
          : files.length > 0
            ? `Zgłoszenie ${created.caseNumber} zapisane wraz z ${files.length} załącznikami.`
            : `Zgłoszenie ${created.caseNumber} zapisane.`,
      );
      navigate(`/cases/${created.id}`);
    } catch (err) {
      setFormError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się zapisać zgłoszenia.')
          : 'Nie udało się zapisać zgłoszenia.',
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="breadcrumb">
        <Link to="/cases">Reklamacje</Link> <span>/</span> <span>Nowa reklamacja</span>
      </div>
      <div className="page-header">
        <div>
          <h1>Nowa reklamacja</h1>
          <p className="page-subtitle">Zarejestruj zgłoszenie klienta krok po kroku.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} onKeyDown={focusNextOnEnter}>
        {/* --- 1. Typ zgłoszenia --- */}
        <Section index={1} title="Typ zgłoszenia" subtitle="Kto merytorycznie rozstrzyga sprawę.">
          <div className="form-grid single">
            <div className="field">
              <div className="radio-card-group">
                <label className={`radio-card ${complaintType === 'Warranty' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="complaintType"
                    checked={complaintType === 'Warranty'}
                    onChange={() => setComplaintType('Warranty')}
                  />
                  <div>
                    <div className="radio-card-title">Gwarancja</div>
                    <div className="radio-card-desc">Decyzję podejmuje producent produktu.</div>
                  </div>
                </label>
                <label
                  className={`radio-card ${complaintType === 'StatutoryWarranty' ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="complaintType"
                    checked={complaintType === 'StatutoryWarranty'}
                    onChange={() => setComplaintType('StatutoryWarranty')}
                  />
                  <div>
                    <div className="radio-card-title">Rękojmia</div>
                    <div className="radio-card-desc">
                      Decyzję podejmuje Kierownik (sklep), nie producent.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </Section>

        {/* --- 2. Źródło zgłoszenia --- */}
        <Section index={2} title="Źródło zgłoszenia" subtitle="Skąd wpłynęło zgłoszenie.">
          <div className="form-grid single">
            <div className="field">
              <label htmlFor="f-source">Źródło</label>
              <select
                id="f-source"
                value={source}
                onChange={(e) => setSource(e.target.value as ComplaintSource)}
              >
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Section>

        {/* --- 3. Klient --- */}
        <Section
          index={3}
          title="Klient"
          subtitle="Znajdź istniejącego klienta lub zarejestruj nowego."
        >
          {selectedCustomer ? (
            <div className="form-grid single">
              <div className="selected-customer-chip">
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                    {selectedCustomer.firstName} {selectedCustomer.lastName}
                  </div>
                  <div className="cell-secondary">
                    {selectedCustomer.phone} · {selectedCustomer.email ?? '—'}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSelectedCustomer(null)}
                >
                  Zmień
                </button>
              </div>
            </div>
          ) : showNewCustomerForm ? (
            <div className="form-grid">
              <div className="field">
                <label htmlFor="c-firstName">Imię</label>
                <input
                  id="c-firstName"
                  type="text"
                  value={newCustomer.firstName}
                  onChange={(e) => setNewCustomer((s) => ({ ...s, firstName: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="c-lastName">Nazwisko</label>
                <input
                  id="c-lastName"
                  type="text"
                  value={newCustomer.lastName}
                  onChange={(e) => setNewCustomer((s) => ({ ...s, lastName: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="c-phone">Telefon</label>
                <input
                  id="c-phone"
                  type="tel"
                  placeholder="600 000 000"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer((s) => ({ ...s, phone: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="c-email">E-mail</label>
                <input
                  id="c-email"
                  type="email"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer((s) => ({ ...s, email: e.target.value }))}
                />
              </div>
              <div className="field span-2">
                <label htmlFor="c-address">
                  Adres <span className="hint">(opcjonalnie)</span>
                </label>
                <input
                  id="c-address"
                  type="text"
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer((s) => ({ ...s, address: e.target.value }))}
                />
              </div>
              <div className="field span-2 flex gap-8">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveNewCustomer}
                  disabled={savingCustomer}
                >
                  {savingCustomer ? 'Zapisywanie…' : 'Zapisz klienta'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowNewCustomerForm(false)}
                >
                  Anuluj
                </button>
              </div>
            </div>
          ) : (
            <div className="form-grid single">
              <div className="field autocomplete-wrap" data-keyboard-list>
                <label htmlFor="customer-search">Szukaj klienta (nazwisko, telefon, e-mail)</label>
                <input
                  id="customer-search"
                  type="text"
                  autoComplete="off"
                  autoFocus
                  placeholder="np. Zawadzka albo 600 111 222"
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  onKeyDown={customerKeys.onKeyDown}
                  role="combobox"
                  aria-expanded={customerQuery.trim().length >= 2}
                  aria-controls="customer-results"
                />
                {customerQuery.trim().length >= 2 && (
                  <div className="autocomplete-results open" id="customer-results" role="listbox">
                    {searchingCustomers && (
                      <div className="autocomplete-item">
                        <div className="meta">Szukam…</div>
                      </div>
                    )}
                    {!searchingCustomers && customerList.length === 0 && (
                      <div className="autocomplete-item">
                        <div className="meta">Brak wyników — użyj „Dodaj nowego klienta”.</div>
                      </div>
                    )}
                    {customerList.map((c, index) => (
                      <div
                        key={c.id}
                        className={`autocomplete-item ${index === customerKeys.highlighted ? 'highlighted' : ''}`}
                        role="option"
                        aria-selected={index === customerKeys.highlighted}
                        onMouseEnter={() => customerKeys.setHighlighted(index)}
                        onClick={() => selectCustomer(c)}
                      >
                        <div className="name">
                          {c.firstName} {c.lastName}
                        </div>
                        <div className="meta">
                          {c.phone} · {c.email ?? '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <span className="hint">
                  Nie znaleziono klienta?{' '}
                  <a
                    href="#"
                    id="toggle-new-customer"
                    style={{ color: 'var(--primary)', fontWeight: 600 }}
                    onClick={(e) => {
                      e.preventDefault();
                      setShowNewCustomerForm(true);
                    }}
                  >
                    Dodaj nowego klienta
                  </a>
                </span>
              </div>
            </div>
          )}
        </Section>

        {/* --- 4. Produkt --- */}
        <Section index={4} title="Produkt" subtitle="Dane produktu, którego dotyczy zgłoszenie.">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="p-brand">
                Marka <span className="hint">(opcjonalnie — przyspiesza wybór producenta)</span>
              </label>
              <select
                id="p-brand"
                ref={brandSelectRef}
                value={brandId}
                onChange={(e) => {
                  setBrandId(e.target.value);
                  const brand = (brands ?? []).find((b) => b.id === e.target.value);
                  if (brand) {
                    setManufacturerId(brand.manufacturerId);
                    showToast(
                      `Producent ustawiony automatycznie na podstawie marki „${brand.name}”.`,
                    );
                  }
                }}
              >
                <option value="">— wybierz markę —</option>
                {brandsForManufacturer.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="p-manufacturer">Producent</label>
              <select
                id="p-manufacturer"
                value={manufacturerId}
                onChange={(e) => setManufacturerId(e.target.value)}
                required
              >
                <option value="">Wybierz producenta…</option>
                {(manufacturers ?? [])
                  .filter((m) => m.active)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {manufacturerName(m.id)}
                    </option>
                  ))}
              </select>
            </div>

            <div className="field span-2">
              <label htmlFor="p-model">Model</label>
              <input
                id="p-model"
                type="text"
                list="p-model-list"
                autoComplete="off"
                placeholder="np. Wózek spacerowy Comfy 3.0"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                required
              />
              <datalist id="p-model-list">
                {productsForManufacturer.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
              <span className="hint">
                Model spoza katalogu zostanie dopisany automatycznie przy zapisie.
              </span>
            </div>

            <div className="field">
              <label htmlFor="p-serial">
                Numer seryjny{' '}
                {selectedManufacturer?.requiresSerialNumber ? (
                  <span className="required-star">*</span>
                ) : (
                  <span className="hint">(jeżeli istnieje)</span>
                )}
              </label>
              <input
                id="p-serial"
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="p-frame">
                Numer ramy{' '}
                {selectedManufacturer?.requiresFrameNumber ? (
                  <span className="required-star">*</span>
                ) : (
                  <span className="hint">(jeżeli istnieje)</span>
                )}
              </label>
              <input
                id="p-frame"
                type="text"
                value={frameNumber}
                onChange={(e) => setFrameNumber(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="p-purchaseDate">Data zakupu</label>
              <input
                id="p-purchaseDate"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="p-proof">
                Numer dowodu zakupu{' '}
                {selectedManufacturer?.requiresProofOfPurchase && (
                  <span className="required-star">*</span>
                )}
              </label>
              <input
                id="p-proof"
                type="text"
                placeholder="np. FV/2026/07/123"
                value={purchaseProofNumber}
                onChange={(e) => setPurchaseProofNumber(e.target.value)}
              />
            </div>

            <div className="field span-2">
              <label htmlFor="item-description">Opis usterki produktu</label>
              <textarea
                id="item-description"
                rows={2}
                placeholder="Co dokładnie jest niesprawne w tym egzemplarzu."
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
              />
            </div>
          </div>
        </Section>

        {/* --- 5. Dowód zakupu --- */}
        <Section
          index={5}
          title="Dowód zakupu"
          subtitle="Paragon lub faktura potwierdzająca zakup."
        >
          <div className="form-grid single">
            <div className="field">
              <div className="file-drop" onClick={() => proofInputRef.current?.click()}>
                <UploadIcon />
                <span>Dodaj dowód zakupu</span>
                <input
                  ref={proofInputRef}
                  id="proof-input"
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  hidden
                  onChange={(e) => {
                    addFiles(e.target.files, 'PurchaseProof');
                    e.target.value = '';
                  }}
                />
              </div>
              <FileChips
                files={files}
                category="PurchaseProof"
                onRemove={(f) => setFiles((c) => c.filter((x) => x !== f))}
              />
            </div>
          </div>
        </Section>

        {/* --- 6. Opis zgłoszenia --- */}
        <Section index={6} title="Opis zgłoszenia" subtitle="Podsumowanie sprawy i słowa klienta.">
          <div className="form-grid single">
            <div className="field">
              <label htmlFor="f-description">Opis zgłoszenia</label>
              <textarea
                id="f-description"
                placeholder="Krótkie podsumowanie sprawy widoczne w historii i na liście."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="f-statement">
                Treść zgłoszenia klienta{' '}
                <span className="hint">(opcjonalnie — dosłowne słowa klienta)</span>
              </label>
              <textarea
                id="f-statement"
                placeholder="Np. dokładny cytat z rozmowy lub wiadomości klienta."
                value={customerStatement}
                onChange={(e) => setCustomerStatement(e.target.value)}
              />
            </div>
          </div>
        </Section>

        {/* --- 7. Zdjęcia i pliki --- */}
        <Section index={7} title="Zdjęcia i pliki" subtitle="Zdjęcia wady, dokumenty, filmy.">
          <div className="form-grid single">
            <div className="field">
              <div className="file-drop" onClick={() => attachmentsInputRef.current?.click()}>
                <UploadIcon />
                <span>Dodaj zdjęcie, dokument lub film</span>
                <input
                  ref={attachmentsInputRef}
                  id="file-input"
                  type="file"
                  multiple
                  accept="image/*,application/pdf,video/mp4"
                  hidden
                  onChange={(e) => {
                    // Kategoria wynika z typu pliku — zdjęcie/film/dokument, zgodnie z `DocumentCategory`.
                    Array.from(e.target.files ?? []).forEach((file) => {
                      const category = file.type.startsWith('image/')
                        ? 'Photo'
                        : file.type.startsWith('video/')
                          ? 'Video'
                          : 'Other';
                      setFiles((current) => [...current, { file, category }]);
                    });
                    e.target.value = '';
                  }}
                />
              </div>
              <FileChips
                files={files}
                categories={['Photo', 'Video', 'Other']}
                onRemove={(f) => setFiles((c) => c.filter((x) => x !== f))}
              />
              {selectedManufacturer && (
                <span className="hint">
                  Producent {manufacturerName(manufacturerId)}: maks.{' '}
                  {selectedManufacturer.maxPhotos} zdjęć, do{' '}
                  {selectedManufacturer.maxAttachmentSizeMb} MB na załącznik.
                </span>
              )}
            </div>
          </div>
        </Section>

        {/* --- 8. Oczekiwane rozwiązanie --- */}
        <Section index={8} title="Oczekiwane rozwiązanie" subtitle="Czego oczekuje klient.">
          <div className="form-grid single">
            <div className="field">
              <label htmlFor="f-resolution">Oczekiwane rozwiązanie zgłoszone przez klienta</label>
              <select
                id="f-resolution"
                value={requestedResolution}
                onChange={(e) => setRequestedResolution(e.target.value)}
                required
              >
                <option value="">Wybierz oczekiwane rozwiązanie…</option>
                {RESOLUTION_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Section>

        {/* --- 9. Właściciel sprawy --- */}
        <Section
          index={9}
          title="Właściciel sprawy"
          subtitle="Pracownik odpowiedzialny za prowadzenie zgłoszenia."
        >
          <div className="form-grid single">
            <div className="field">
              <label htmlFor="f-owner">Opiekun sprawy</label>
              {users && users.length > 0 ? (
                <select
                  id="f-owner"
                  value={effectiveOwnerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                >
                  {users
                    .filter((u) => u.active)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                        {u.roles.length > 0 ? ` — ${u.roles.join(', ')}` : ''}
                      </option>
                    ))}
                </select>
              ) : (
                <>
                  <input id="f-owner" type="text" value={user?.email ?? ''} disabled />
                  <span className="hint">
                    Sprawa zostanie przypisana do Ciebie — wybór innego opiekuna wymaga dodatkowego
                    uprawnienia.
                  </span>
                </>
              )}
            </div>
          </div>
        </Section>

        {/* --- 10. Portal Klienta --- */}
        {hasPermission('cases.portal.manage') && (
          <Section
            index={10}
            title="Portal Klienta"
            subtitle="Dostęp klienta do statusu sprawy online, bez dzwonienia do sklepu."
          >
            <div className="form-grid single">
              <div className="field">
                <div className="portal-toggle-row">
                  <span className="text-sm">Włącz Portal Klienta od razu przy zapisie</span>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={enablePortalOnCreate}
                      onChange={(e) => setEnablePortalOnCreate(e.target.checked)}
                    />
                    <span className="slider" />
                  </label>
                </div>
                <span className="hint">
                  {selectedCustomer?.email
                    ? `Klient dostanie e-mail na ${selectedCustomer.email} z linkiem i kodem dostępu do Portalu.`
                    : 'Wybrany klient nie ma podanego adresu e-mail — dostęp zostanie włączony, ale kod dostępu trzeba będzie przekazać klientowi ręcznie.'}
                </span>
              </div>
            </div>
          </Section>
        )}

        {/*
          Pasek akcji przyklejony do dołu ekranu: na laptopie 15–16" formularz ma 9 sekcji
          i nie mieści się w jednym widoku — bez tego trzeba było przewijać na sam dół,
          żeby zapisać, i wracać na górę po każdym błędzie walidacji. Komunikat błędu
          też siedzi w pasku, więc jest widoczny niezależnie od pozycji przewinięcia.
        */}
        <div className="sticky-form-footer">
          {formError && <span className="sticky-form-error">{formError}</span>}
          <span className="hint" style={{ marginRight: 'auto' }}>
            Enter przechodzi do kolejnego pola.
          </span>
          <Link to="/cases" className="btn btn-secondary">
            Anuluj
          </Link>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Zapisywanie…' : 'Zapisz zgłoszenie'}
          </button>
        </div>
      </form>
    </div>
  );
}

/** `.form-section` + `.form-section-header` z prototypu — numerowany nagłówek sekcji. */
function Section({
  index,
  title,
  subtitle,
  children,
}: {
  index: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="form-section">
      <div className="form-section-header">
        <div className="form-section-index">{index}</div>
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

/** `.file-chip-list` z prototypu — lista wybranych plików z możliwością usunięcia przed zapisem. */
function FileChips({
  files,
  category,
  categories,
  onRemove,
}: {
  files: PickedFile[];
  category?: PickedFile['category'];
  categories?: PickedFile['category'][];
  onRemove: (file: PickedFile) => void;
}) {
  const visible = files.filter((f) =>
    category ? f.category === category : categories ? categories.includes(f.category) : true,
  );
  if (visible.length === 0) return null;

  return (
    <div className="file-chip-list">
      {visible.map((f, idx) => (
        <span className="file-chip" key={`${f.file.name}-${idx}`}>
          {f.file.name}
          <button type="button" title="Usuń" onClick={() => onRemove(f)}>
            <XIcon width={12} height={12} />
          </button>
        </span>
      ))}
    </div>
  );
}
