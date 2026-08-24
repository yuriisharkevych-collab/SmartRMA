import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { isApiError } from '@/api/client';
import { contractorsApi, type Contractor } from '@/api/contractors.api';
import {
  manufacturersApi,
  type Manufacturer,
  type SubmissionMethod,
  type TransportOrganizer,
} from '@/api/manufacturers.api';
import { brandsApi, type Brand } from '@/api/products.api';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { Modal } from '@/components/common/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { PlusIcon, XIcon } from '@/components/common/icons';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';

const SUBMISSION_METHOD_LABELS: Record<SubmissionMethod, string> = {
  Email: 'E-mail',
  PortalB2B: 'Portal B2B',
  FormularzWWW: 'Formularz WWW',
};

const TRANSPORT_ORGANIZER_LABELS: Record<TransportOrganizer, string> = {
  Klient: 'Klient',
  Sklep: 'Sklep',
  Producent: 'Producent',
};

/** Stan formularza modala — jedno miejsce zamiast ~35 osobnych `useState`, żeby dało się go zresetować/wypełnić z rekordu jednym przypisaniem. */
interface FormState {
  // Contractor (dane firmowe)
  name: string;
  country: string;
  nip: string;
  address: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  // Manufacturer (profil reklamacyjny)
  active: boolean;
  submissionMethod: SubmissionMethod;
  complaintEmail: string;
  portalUrl: string;
  portalLogin: string;
  complaintProcedure: string;
  requiredDocumentsNote: string;
  requiredPhotosNote: string;
  requiredVideosNote: string;
  maxPhotos: number;
  maxAttachmentSizeMb: number;
  requiresSerialNumber: boolean;
  requiresFrameNumber: boolean;
  requiresProofOfPurchase: boolean;
  minPhotos: number;
  requiresVideo: boolean;
  // Etap 3 — kategorie produktowe formularza publicznego marki, wpisywane jako lista
  // rozdzielona przecinkami (ten sam wzorzec co progi SLA niżej: string w formularzu,
  // sparsowany dopiero przy zapisie).
  productCategoriesText: string;
  // SLA (progi dniowe; pusty string = brak progu)
  responseDays: string;
  repairDays: string;
  reminderAfterDays: string;
  escalationAfterDays: string;
  // Przypomnienia o reakcji — nadpisanie wartości domyślnej firmy (pusty string = użyj wartości domyślnej)
  statusStaleDaysOverride: string;
  caseAgeStaleDaysOverride: string;
  // Logistics
  returnAddress: string;
  transportOrganizer: TransportOrganizer;
  manufacturerProvidesLabel: boolean;
  shopCanOrderCourier: boolean;
  shopCourierCost: number;
  originalPackagingRequired: boolean;
  substitutePackagingAllowed: boolean;
  transportProtectionNote: string;
  productConditionNote: string;
  // Automation
  autoEmailEnabled: boolean;
  autoCloseEnabled: boolean;
  autoCloseDays: number;
}

const EMPTY_FORM: FormState = {
  name: '',
  country: 'Polska',
  nip: '',
  address: '',
  contactPerson: '',
  contactPhone: '',
  contactEmail: '',
  active: true,
  submissionMethod: 'Email',
  complaintEmail: '',
  portalUrl: '',
  portalLogin: '',
  complaintProcedure: '',
  requiredDocumentsNote: '',
  requiredPhotosNote: '',
  requiredVideosNote: '',
  maxPhotos: 6,
  maxAttachmentSizeMb: 15,
  requiresSerialNumber: false,
  requiresFrameNumber: false,
  requiresProofOfPurchase: true,
  minPhotos: 0,
  requiresVideo: false,
  productCategoriesText: '',
  responseDays: '',
  repairDays: '',
  reminderAfterDays: '',
  escalationAfterDays: '',
  statusStaleDaysOverride: '',
  caseAgeStaleDaysOverride: '',
  returnAddress: '',
  transportOrganizer: 'Klient',
  manufacturerProvidesLabel: false,
  shopCanOrderCourier: false,
  shopCourierCost: 20,
  originalPackagingRequired: true,
  substitutePackagingAllowed: true,
  transportProtectionNote: '',
  productConditionNote: '',
  autoEmailEnabled: false,
  autoCloseEnabled: false,
  autoCloseDays: 30,
};

function formFromRecord(manufacturer: Manufacturer, contractor: Contractor | undefined): FormState {
  return {
    name: contractor?.name ?? '',
    country: contractor?.country ?? '',
    nip: contractor?.nip ?? '',
    address: contractor?.address ?? '',
    contactPerson: contractor?.contactPerson ?? '',
    contactPhone: contractor?.contactPhone ?? '',
    contactEmail: contractor?.contactEmail ?? '',
    active: manufacturer.active,
    submissionMethod: manufacturer.submissionMethod,
    complaintEmail: manufacturer.complaintEmail ?? '',
    minPhotos: manufacturer.minPhotos,
    requiresVideo: manufacturer.requiresVideo,
    productCategoriesText: (manufacturer.productCategories ?? []).join(', '),
    responseDays: manufacturer.sla?.responseDays?.toString() ?? '',
    repairDays: manufacturer.sla?.repairDays?.toString() ?? '',
    reminderAfterDays: manufacturer.sla?.reminderAfterDays?.toString() ?? '',
    escalationAfterDays: manufacturer.sla?.escalationAfterDays?.toString() ?? '',
    statusStaleDaysOverride: manufacturer.sla?.statusStaleDaysOverride?.toString() ?? '',
    caseAgeStaleDaysOverride: manufacturer.sla?.caseAgeStaleDaysOverride?.toString() ?? '',
    portalUrl: manufacturer.portalUrl ?? '',
    portalLogin: manufacturer.portalLogin ?? '',
    complaintProcedure: manufacturer.complaintProcedure ?? '',
    requiredDocumentsNote: manufacturer.requiredDocumentsNote ?? '',
    requiredPhotosNote: manufacturer.requiredPhotosNote ?? '',
    requiredVideosNote: manufacturer.requiredVideosNote ?? '',
    maxPhotos: manufacturer.maxPhotos,
    maxAttachmentSizeMb: manufacturer.maxAttachmentSizeMb,
    requiresSerialNumber: manufacturer.requiresSerialNumber,
    requiresFrameNumber: manufacturer.requiresFrameNumber,
    requiresProofOfPurchase: manufacturer.requiresProofOfPurchase,
    returnAddress: manufacturer.logistics?.returnAddress ?? '',
    transportOrganizer: manufacturer.logistics?.transportOrganizer ?? 'Klient',
    manufacturerProvidesLabel: manufacturer.logistics?.manufacturerProvidesLabel ?? false,
    shopCanOrderCourier: manufacturer.logistics?.shopCanOrderCourier ?? false,
    shopCourierCost: Number(manufacturer.logistics?.shopCourierCost ?? 20),
    originalPackagingRequired: manufacturer.logistics?.originalPackagingRequired ?? true,
    substitutePackagingAllowed: manufacturer.logistics?.substitutePackagingAllowed ?? true,
    transportProtectionNote: manufacturer.logistics?.transportProtectionNote ?? '',
    productConditionNote: manufacturer.logistics?.productConditionNote ?? '',
    autoEmailEnabled: manufacturer.automation?.autoEmailEnabled ?? false,
    autoCloseEnabled: manufacturer.automation?.autoCloseEnabled ?? false,
    autoCloseDays: manufacturer.automation?.autoCloseDays ?? 30,
  };
}

/**
 * Etap 3 — nadpisania wymagań/SLA marki. Zasada właściciela: "Brand override →
 * jeśli brak, dziedziczenie z Manufacturer" — stąd trójstanowy wybór dla pól
 * logicznych ('' = dziedzicz, nie tylko `true`/`false`) zamiast zwykłego
 * checkboxa, który nie potrafiłby wyrazić "brak nadpisania".
 */
type TriState = '' | 'true' | 'false';

interface BrandOverrideFormState {
  requiresSerialNumber: TriState;
  requiresFrameNumber: TriState;
  requiresProofOfPurchase: TriState;
  minPhotos: string;
  requiresVideo: TriState;
  maxPhotos: string;
  maxAttachmentSizeMb: string;
  statusStaleDaysOverride: string;
  caseAgeStaleDaysOverride: string;
}

const EMPTY_BRAND_OVERRIDE_FORM: BrandOverrideFormState = {
  requiresSerialNumber: '',
  requiresFrameNumber: '',
  requiresProofOfPurchase: '',
  minPhotos: '',
  requiresVideo: '',
  maxPhotos: '',
  maxAttachmentSizeMb: '',
  statusStaleDaysOverride: '',
  caseAgeStaleDaysOverride: '',
};

function triStateFromBool(value: boolean | null): TriState {
  return value === null ? '' : value ? 'true' : 'false';
}

function boolFromTriState(value: TriState): boolean | null {
  return value === '' ? null : value === 'true';
}

function numberFromText(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

function brandOverrideFormFromRecord(brand: Brand): BrandOverrideFormState {
  return {
    requiresSerialNumber: triStateFromBool(brand.requiresSerialNumber),
    requiresFrameNumber: triStateFromBool(brand.requiresFrameNumber),
    requiresProofOfPurchase: triStateFromBool(brand.requiresProofOfPurchase),
    minPhotos: brand.minPhotos?.toString() ?? '',
    requiresVideo: triStateFromBool(brand.requiresVideo),
    maxPhotos: brand.maxPhotos?.toString() ?? '',
    maxAttachmentSizeMb: brand.maxAttachmentSizeMb?.toString() ?? '',
    statusStaleDaysOverride: brand.statusStaleDaysOverride?.toString() ?? '',
    caseAgeStaleDaysOverride: brand.caseAgeStaleDaysOverride?.toString() ?? '',
  };
}

/** Pole wyboru dla nadpisań marki: `''` = dziedzicz z producenta, brak sposobu wyrazić to zwykłym checkboxem. */
function TriStateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TriState;
  onChange: (value: TriState) => void;
}) {
  const id = `bo-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as TriState)}>
        <option value="">Dziedzicz z producenta</option>
        <option value="true">Tak</option>
        <option value="false">Nie</option>
      </select>
    </div>
  );
}

/**
 * Odpowiednik `manufacturers.html` + `manufacturers.js`. Modal odwzorowuje
 * wszystkie sekcje prototypu (dane podstawowe, kontakt, sposób zgłoszenia,
 * procedura, logistyka, automatyzacja, marki) — komplet pól istnieje w
 * `schema.prisma`, część wymagała jednak dopiero wystawienia przez API
 * (`ManufacturerLogistics`/`ManufacturerAutomation`/`portalLogin`/notatki
 * były w bazie, ale mapper ich nie zwracał, a endpointów do zapisu nie było).
 *
 * Trzy świadome różnice wobec prototypu:
 *  - "Nazwa/Kraj/NIP/Adres/Kontakt" zapisują się na `Contractor`, nie na
 *    `Manufacturer` — w tym modelu `Manufacturer` to PROFIL reklamacyjny
 *    kontrahenta (`Contractor` @unique), nie osobna encja firmy. Modal
 *    zapisuje więc do dwóch zasobów naraz, dla użytkownika niewidocznie.
 *  - Brak pola "Hasło" do portalu B2B — `portalPasswordEncrypted` wymaga
 *    szyfrowania aplikacyjnego, oznaczonego w `schema.prisma` jako
 *    niezrealizowane; prototyp sam ostrzegał "w produkcji sekret szyfrowany
 *    po stronie backendu". Przyjmowanie hasła jawnym tekstem bez działającego
 *    szyfrowania byłoby gorsze niż brak tego pola.
 *  - Zamiast prototypowych checkboxów "Automatyczne przypomnienia"/
 *    "Automatyczne eskalacje" są progi dniowe SLA — `schema.prisma` celowo
 *    zastąpił te booleany polami `reminderAfterDays`/`escalationAfterDays`
 *    (`null` = wyłączone), żeby flaga i próg nie mogły się rozjechać.
 *    Ustawienie progów to `PUT /manufacturers/:id/sla` — osobny ekran/krok,
 *    nie dodany tutaj, żeby nie zgadywać UX-u dla pola, którego prototyp
 *    w tej formie nie miał.
 */
export function ManufacturersPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('manufacturers.manage');
  const canManageBrands = hasPermission('brands.manage');
  const canDelete = hasPermission('manufacturers.delete');

  const { data: manufacturers, isLoading } = useQuery({
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
    enabled: canManageBrands,
    retry: false,
  });

  const contractorById = new Map((contractors ?? []).map((c) => [c.id, c]));
  const brandsByManufacturer = new Map<string, Brand[]>();
  for (const brand of brands ?? []) {
    const list = brandsByManufacturer.get(brand.manufacturerId) ?? [];
    list.push(brand);
    brandsByManufacturer.set(brand.manufacturerId, list);
  }

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Manufacturer | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [newBrandName, setNewBrandName] = useState('');
  const [pendingBrands, setPendingBrands] = useState<string[]>([]);

  // Etap 3 — nadpisania wymagań/SLA JEDNEJ marki, osobny mały modal (9 pól nie
  // mieści się w `window.prompt`, jak `renameBrand`).
  const [overrideTarget, setOverrideTarget] = useState<Brand | null>(null);
  const [overrideForm, setOverrideForm] =
    useState<BrandOverrideFormState>(EMPTY_BRAND_OVERRIDE_FORM);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  function openOverrideModal(brand: Brand) {
    setOverrideTarget(brand);
    setOverrideForm(brandOverrideFormFromRecord(brand));
    setOverrideError(null);
  }

  const overrideMutation = useMutation({
    mutationFn: async () => {
      if (!overrideTarget) return;
      await brandsApi.update(overrideTarget.id, {
        requiresSerialNumber: boolFromTriState(overrideForm.requiresSerialNumber),
        requiresFrameNumber: boolFromTriState(overrideForm.requiresFrameNumber),
        requiresProofOfPurchase: boolFromTriState(overrideForm.requiresProofOfPurchase),
        minPhotos: numberFromText(overrideForm.minPhotos),
        requiresVideo: boolFromTriState(overrideForm.requiresVideo),
        maxPhotos: numberFromText(overrideForm.maxPhotos),
        maxAttachmentSizeMb: numberFromText(overrideForm.maxAttachmentSizeMb),
        statusStaleDaysOverride: numberFromText(overrideForm.statusStaleDaysOverride),
        caseAgeStaleDaysOverride: numberFromText(overrideForm.caseAgeStaleDaysOverride),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['brands'] });
      setOverrideTarget(null);
      showToast('Wymagania marki zapisane.');
    },
    onError: (error: unknown) => {
      setOverrideError(
        isApiError(error)
          ? (error.response?.data.error.message ?? 'Nie udało się zapisać.')
          : 'Nie udało się zapisać.',
      );
    },
  });
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Manufacturer | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setPendingBrands([]);
    setNewBrandName('');
    setError(null);
    setModalOpen(true);
  }

  function openEdit(manufacturer: Manufacturer) {
    setEditing(manufacturer);
    setForm(formFromRecord(manufacturer, contractorById.get(manufacturer.contractorId)));
    setPendingBrands([]);
    setNewBrandName('');
    setError(null);
    setModalOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const contractorPayload = {
        name: form.name.trim(),
        country: form.country.trim() || undefined,
        nip: form.nip.trim() || undefined,
        address: form.address.trim() || undefined,
        contactPerson: form.contactPerson.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
      };
      const profilePayload = {
        submissionMethod: form.submissionMethod,
        complaintEmail: form.complaintEmail.trim() || undefined,
        minPhotos: form.minPhotos,
        requiresVideo: form.requiresVideo,
        portalUrl: form.portalUrl.trim() || undefined,
        portalLogin: form.portalLogin.trim() || undefined,
        complaintProcedure: form.complaintProcedure.trim() || undefined,
        requiredDocumentsNote: form.requiredDocumentsNote.trim() || undefined,
        requiredPhotosNote: form.requiredPhotosNote.trim() || undefined,
        requiredVideosNote: form.requiredVideosNote.trim() || undefined,
        maxPhotos: form.maxPhotos,
        maxAttachmentSizeMb: form.maxAttachmentSizeMb,
        requiresSerialNumber: form.requiresSerialNumber,
        requiresFrameNumber: form.requiresFrameNumber,
        requiresProofOfPurchase: form.requiresProofOfPurchase,
        active: form.active,
        productCategories: form.productCategoriesText
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
      };

      let manufacturerId: string;
      if (editing) {
        await contractorsApi.update(editing.contractorId, contractorPayload);
        await manufacturersApi.update(editing.id, profilePayload);
        manufacturerId = editing.id;
      } else {
        const contractor = await contractorsApi.create({
          ...contractorPayload,
          category: 'Manufacturer',
        });
        const created = await manufacturersApi.create({
          ...profilePayload,
          contractorId: contractor.id,
        });
        manufacturerId = created.id;
      }

      await manufacturersApi.updateLogistics(manufacturerId, {
        returnAddress: form.returnAddress.trim() || undefined,
        transportOrganizer: form.transportOrganizer,
        manufacturerProvidesLabel: form.manufacturerProvidesLabel,
        shopCanOrderCourier: form.shopCanOrderCourier,
        shopCourierCost: form.shopCourierCost,
        originalPackagingRequired: form.originalPackagingRequired,
        substitutePackagingAllowed: form.substitutePackagingAllowed,
        transportProtectionNote: form.transportProtectionNote.trim() || undefined,
        productConditionNote: form.productConditionNote.trim() || undefined,
      });

      await manufacturersApi.updateAutomation(manufacturerId, {
        autoEmailEnabled: form.autoEmailEnabled,
        autoCloseEnabled: form.autoCloseEnabled,
        autoCloseDays: form.autoCloseDays,
      });

      // Puste pole = brak progu (`null`), nie zero — „brak przypomnień u tego producenta"
      // to inna informacja niż „przypomnienie po 0 dniach".
      const day = (value: string) => (value.trim() === '' ? null : Number(value));
      await manufacturersApi.updateSla(manufacturerId, {
        responseDays: day(form.responseDays),
        repairDays: day(form.repairDays),
        reminderAfterDays: day(form.reminderAfterDays),
        escalationAfterDays: day(form.escalationAfterDays),
        statusStaleDaysOverride: day(form.statusStaleDaysOverride),
        caseAgeStaleDaysOverride: day(form.caseAgeStaleDaysOverride),
      });

      for (const brandName of pendingBrands) {
        await brandsApi.create({ manufacturerId, name: brandName });
      }

      return manufacturerId;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['manufacturers'] });
      await queryClient.invalidateQueries({ queryKey: ['contractors'] });
      await queryClient.invalidateQueries({ queryKey: ['brands'] });
      showToast(editing ? 'Dane producenta zaktualizowane.' : 'Producent dodany.');
      setModalOpen(false);
    },
    onError: (err) => {
      setError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się zapisać producenta.')
          : 'Nie udało się zapisać producenta.',
      );
    },
  });

  function handleSave() {
    setError(null);
    if (!form.name.trim()) {
      setError('Podaj nazwę producenta.');
      return;
    }
    saveMutation.mutate();
  }

  /** `manufacturers.delete` (RBAC.md §5) — TRWAŁE, nieodwracalne usunięcie. Zablokowane przez backend (MANUFACTURER-003), gdy producent ma przypisane produkty/marki. */
  const deleteMutation = useMutation({
    mutationFn: () => manufacturersApi.delete(deleteTarget!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['manufacturers'] });
      showToast('Producent trwale usunięty.');
      setDeleteTarget(null);
    },
    onError: (err) => {
      setDeleteError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się usunąć producenta.')
          : 'Nie udało się usunąć producenta.',
      );
    },
  });

  function openDelete(manufacturer: Manufacturer) {
    setDeleteTarget(manufacturer);
    setDeleteConfirmText('');
    setDeleteError(null);
  }

  /** Zmiana nazwy zapisanej marki — literówka w nazwie producenta/marki jest częsta, a bez tego jedynym wyjściem było dodanie duplikatu. */
  async function renameBrand(brand: Brand) {
    const nextName = window.prompt(`Nowa nazwa marki „${brand.name}”:`, brand.name);
    if (!nextName || nextName.trim() === brand.name) return;
    try {
      await brandsApi.update(brand.id, { name: nextName.trim() });
      await queryClient.invalidateQueries({ queryKey: ['brands'] });
      showToast('Nazwa marki zaktualizowana.');
    } catch (err) {
      setError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się zmienić nazwy marki.')
          : 'Nie udało się zmienić nazwy marki.',
      );
    }
  }

  /** Marek nie usuwamy — `Product.brandId` na nie wskazuje, a historyczne reklamacje muszą zachować dane produktu. Dezaktywacja ukrywa markę przy nowych zgłoszeniach. */
  async function toggleBrandActive(brand: Brand) {
    if (
      brand.active &&
      !window.confirm(
        `Dezaktywować markę „${brand.name}”? Przestanie być proponowana przy nowych reklamacjach, ale zostanie w danych historycznych.`,
      )
    ) {
      return;
    }
    try {
      await brandsApi.update(brand.id, { active: !brand.active });
      await queryClient.invalidateQueries({ queryKey: ['brands'] });
      showToast(brand.active ? 'Marka dezaktywowana.' : 'Marka przywrócona.');
    } catch (err) {
      setError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się zmienić statusu marki.')
          : 'Nie udało się zmienić statusu marki.',
      );
    }
  }

  function addPendingBrand() {
    const name = newBrandName.trim();
    if (!name) return;
    const existingForThis = editing
      ? (brandsByManufacturer.get(editing.id) ?? []).map((b) => b.name.toLowerCase())
      : [];
    if (
      existingForThis.includes(name.toLowerCase()) ||
      pendingBrands.some((b) => b.toLowerCase() === name.toLowerCase())
    ) {
      showToast('Ta marka jest już przypisana.');
      setNewBrandName('');
      return;
    }
    setPendingBrands((current) => [...current, name]);
    setNewBrandName('');
  }

  const savedBrands = editing ? (brandsByManufacturer.get(editing.id) ?? []) : [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Producenci</h1>
          <p className="page-subtitle">
            Konfiguracja procesu reklamacyjnego, logistyki i automatyzacji dla poszczególnych
            producentów.
          </p>
        </div>
        <PermissionGate permissions={['manufacturers.manage']}>
          <button className="btn btn-primary" onClick={openCreate}>
            <PlusIcon />
            Dodaj producenta
          </button>
        </PermissionGate>
      </div>

      <div className="card">
        {isLoading && <LoadingIndicator />}

        {manufacturers && manufacturers.length === 0 && (
          <div className="empty-state">
            <h4>Brak producentów</h4>
            <p>Nie skonfigurowano jeszcze żadnego producenta.</p>
          </div>
        )}

        {manufacturers && manufacturers.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nazwa</th>
                  <th>Kraj</th>
                  <th>Marki</th>
                  <th>Sposób zgłoszenia</th>
                  <th>Wymagania</th>
                  <th>Status</th>
                  {canDelete && <th></th>}
                </tr>
              </thead>
              <tbody>
                {manufacturers.map((m) => {
                  const contractor = contractorById.get(m.contractorId);
                  const brandList = brandsByManufacturer.get(m.id) ?? [];
                  const brandLabel =
                    brandList.length > 0
                      ? brandList
                          .slice(0, 3)
                          .map((b) => b.name)
                          .join(', ') + (brandList.length > 3 ? ` +${brandList.length - 3}` : '')
                      : '—';
                  const requirements = [
                    m.requiresSerialNumber ? 'nr seryjny' : null,
                    m.requiresFrameNumber ? 'nr ramy' : null,
                    m.requiresProofOfPurchase ? 'dowód zakupu' : null,
                  ].filter(Boolean);
                  return (
                    <tr
                      key={m.id}
                      onClick={() => (canManage ? openEdit(m) : undefined)}
                      style={{ cursor: canManage ? 'pointer' : 'default' }}
                    >
                      <td className="cell-primary">{contractor?.name ?? '—'}</td>
                      <td className="cell-secondary">{contractor?.country ?? '—'}</td>
                      <td className="cell-secondary">{canManageBrands ? brandLabel : '—'}</td>
                      <td>{SUBMISSION_METHOD_LABELS[m.submissionMethod]}</td>
                      <td className="cell-secondary">
                        {requirements.length > 0 ? requirements.join(', ') : '—'}
                      </td>
                      <td>
                        {m.active ? (
                          <span className="badge badge-green">Aktywny</span>
                        ) : (
                          <span className="badge badge-gray">Nieaktywny</span>
                        )}
                      </td>
                      {canDelete && (
                        <td onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => openDelete(m)}
                            title="Trwałe, nieodwracalne usunięcie producenta — wyłącznie do producentów testowych"
                          >
                            Usuń
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        wide
        title={editing ? 'Edytuj producenta' : 'Dodaj producenta'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
              Anuluj
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Zapisywanie…' : 'Zapisz producenta'}
            </button>
          </>
        }
      >
        {error && (
          <p className="field-error" style={{ display: 'block' }}>
            {error}
          </p>
        )}

        <div className="modal-section-label">Dane podstawowe</div>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="mf-name">Nazwa firmy</label>
            <input
              id="mf-name"
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="mf-country">Kraj</label>
            <input
              id="mf-country"
              type="text"
              value={form.country}
              onChange={(e) => set('country', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="mf-nip">NIP</label>
            <input
              id="mf-nip"
              type="text"
              value={form.nip}
              onChange={(e) => set('nip', e.target.value)}
            />
          </div>
          <div className="field span-2">
            <label htmlFor="mf-address">Adres</label>
            <input
              id="mf-address"
              type="text"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
            />
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
              <input
                id="mf-active"
                type="checkbox"
                style={{ width: 'auto' }}
                checked={form.active}
                onChange={(e) => set('active', e.target.checked)}
              />
              Producent aktywny
            </label>
          </div>
        </div>

        <div className="modal-section-label">Dane kontaktowe</div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="mf-contact-person">Osoba kontaktowa</label>
            <input
              id="mf-contact-person"
              type="text"
              value={form.contactPerson}
              onChange={(e) => set('contactPerson', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="mf-phone">Telefon</label>
            <input
              id="mf-phone"
              type="text"
              value={form.contactPhone}
              onChange={(e) => set('contactPhone', e.target.value)}
            />
          </div>
          <div className="field span-2">
            <label htmlFor="mf-email">E-mail kontaktowy</label>
            <input
              id="mf-email"
              type="email"
              value={form.contactEmail}
              onChange={(e) => set('contactEmail', e.target.value)}
            />
          </div>
        </div>

        <div className="modal-section-label">Sposób zgłoszenia reklamacji</div>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="mf-method">Sposób zgłoszenia</label>
            <select
              id="mf-method"
              value={form.submissionMethod}
              onChange={(e) => set('submissionMethod', e.target.value as SubmissionMethod)}
            >
              {(Object.keys(SUBMISSION_METHOD_LABELS) as SubmissionMethod[]).map((value) => (
                <option key={value} value={value}>
                  {SUBMISSION_METHOD_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {form.submissionMethod === 'Email' && (
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="mf-complaint-email">Adres e-mail do zgłoszeń reklamacyjnych</label>
              <input
                id="mf-complaint-email"
                type="email"
                placeholder="np. rma@producent.pl"
                value={form.complaintEmail}
                onChange={(e) => set('complaintEmail', e.target.value)}
              />
              <span className="hint">
                Odrębny od kontaktu handlowego powyżej — wielu producentów ma osobną skrzynkę
                reklamacyjną, a zgłoszenie wysłane na adres handlowy zostaje bez odpowiedzi.
              </span>
            </div>
          </div>
        )}
        {form.submissionMethod === 'PortalB2B' && (
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="mf-portal">Adres portalu</label>
              <input
                id="mf-portal"
                type="text"
                placeholder="https://"
                value={form.portalUrl}
                onChange={(e) => set('portalUrl', e.target.value)}
              />
            </div>
            <div className="field span-2">
              <label htmlFor="mf-portal-login">Login</label>
              <input
                id="mf-portal-login"
                type="text"
                value={form.portalLogin}
                onChange={(e) => set('portalLogin', e.target.value)}
              />
              <span className="hint">
                Hasło do portalu producenta nie jest jeszcze obsługiwane — wymaga szyfrowania
                aplikacyjnego po stronie backendu (niezrealizowane), a przyjmowanie go jawnym
                tekstem byłoby gorsze niż brak tego pola.
              </span>
            </div>
          </div>
        )}
        {form.submissionMethod === 'FormularzWWW' && (
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="mf-portal">Link do formularza WWW</label>
              <input
                id="mf-portal"
                type="text"
                placeholder="https://"
                value={form.portalUrl}
                onChange={(e) => set('portalUrl', e.target.value)}
              />
              <span className="hint">
                Adres formularza zgłoszeniowego producenta — pracownik zostanie tam skierowany
                zamiast wpisywać osobny adres e-mail.
              </span>
            </div>
          </div>
        )}

        <div className="modal-section-label">Procedura reklamacyjna</div>
        <div className="form-grid single">
          <div className="field">
            <label htmlFor="mf-procedure">Opis procedury</label>
            <textarea
              id="mf-procedure"
              rows={2}
              value={form.complaintProcedure}
              onChange={(e) => set('complaintProcedure', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="mf-docs">Wymagane dokumenty</label>
            <textarea
              id="mf-docs"
              rows={2}
              value={form.requiredDocumentsNote}
              onChange={(e) => set('requiredDocumentsNote', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="mf-photos">Wymagane zdjęcia</label>
            <textarea
              id="mf-photos"
              rows={2}
              value={form.requiredPhotosNote}
              onChange={(e) => set('requiredPhotosNote', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="mf-videos">Wymagane filmy</label>
            <textarea
              id="mf-videos"
              rows={2}
              value={form.requiredVideosNote}
              onChange={(e) => set('requiredVideosNote', e.target.value)}
            />
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="mf-max-photos">Maks. liczba zdjęć</label>
            <input
              id="mf-max-photos"
              type="number"
              min={0}
              value={form.maxPhotos}
              onChange={(e) => set('maxPhotos', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="mf-max-size">Maks. rozmiar załączników (MB)</label>
            <input
              id="mf-max-size"
              type="number"
              min={0}
              value={form.maxAttachmentSizeMb}
              onChange={(e) => set('maxAttachmentSizeMb', Number(e.target.value))}
            />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="mf-product-categories">
              Kategorie produktowe formularza publicznego marki (oddzielone przecinkami)
            </label>
            <input
              id="mf-product-categories"
              type="text"
              value={form.productCategoriesText}
              onChange={(e) => set('productCategoriesText', e.target.value)}
              placeholder="np. Łóżeczka, Komody, Szafy, Inne"
            />
            <span className="field-hint-static">
              Krok "Kategoria produktu" formularza {'/reklamacja-marka/…'} tego producenta — pusta
              lista = ten krok nie ma z czego wybierać.
            </span>
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
              <input
                id="mf-req-serial"
                type="checkbox"
                style={{ width: 'auto' }}
                checked={form.requiresSerialNumber}
                onChange={(e) => set('requiresSerialNumber', e.target.checked)}
              />
              Wymagany numer seryjny
            </label>
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
              <input
                id="mf-req-frame"
                type="checkbox"
                style={{ width: 'auto' }}
                checked={form.requiresFrameNumber}
                onChange={(e) => set('requiresFrameNumber', e.target.checked)}
              />
              Wymagany numer ramy
            </label>
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
              <input
                id="mf-req-proof"
                type="checkbox"
                style={{ width: 'auto' }}
                checked={form.requiresProofOfPurchase}
                onChange={(e) => set('requiresProofOfPurchase', e.target.checked)}
              />
              Wymagany dowód zakupu
            </label>
          </div>
          <div className="field">
            <label htmlFor="mf-min-photos">Minimalna liczba zdjęć</label>
            <input
              id="mf-min-photos"
              type="number"
              min={0}
              value={form.minPhotos}
              onChange={(e) => set('minPhotos', Number(e.target.value))}
            />
            <span className="hint">0 = brak wymogu.</span>
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
              <input
                id="mf-req-video"
                type="checkbox"
                style={{ width: 'auto' }}
                checked={form.requiresVideo}
                onChange={(e) => set('requiresVideo', e.target.checked)}
              />
              Wymagany film z usterką
            </label>
          </div>
        </div>
        <p className="hint" style={{ marginTop: -8 }}>
          Te wymagania są <strong>pilnowane automatycznie</strong>: numer seryjny, numer ramy i
          dowód zakupu muszą być podane, zanim reklamację będzie można zapisać, a minimalna liczba
          zdjęć i film muszą być skompletowane, zanim sprawę będzie można wysłać do producenta. Pola
          tekstowe „Wymagane dokumenty/zdjęcia/filmy" wyżej to tylko podpowiedź dla pracownika —
          same w sobie niczego nie blokują.
        </p>

        <div className="modal-section-label">SLA — terminy producenta</div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="mf-sla-response">Czas odpowiedzi (dni)</label>
            <input
              id="mf-sla-response"
              type="number"
              min={1}
              value={form.responseDays}
              onChange={(e) => set('responseDays', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="mf-sla-repair">Czas realizacji decyzji (dni)</label>
            <input
              id="mf-sla-repair"
              type="number"
              min={1}
              value={form.repairDays}
              onChange={(e) => set('repairDays', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="mf-sla-reminder">Przypomnienie po (dniach)</label>
            <input
              id="mf-sla-reminder"
              type="number"
              min={1}
              value={form.reminderAfterDays}
              onChange={(e) => set('reminderAfterDays', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="mf-sla-escalation">Eskalacja po (dniach)</label>
            <input
              id="mf-sla-escalation"
              type="number"
              min={1}
              value={form.escalationAfterDays}
              onChange={(e) => set('escalationAfterDays', e.target.value)}
            />
          </div>
        </div>
        <p className="hint" style={{ marginTop: -8 }}>
          Puste pole = wyłączone dla tego producenta (np. brak automatycznych przypomnień lub
          eskalacji).
        </p>

        <div className="modal-section-label">
          Przypomnienia o reakcji — nadpisanie dla tego producenta
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="mf-attention-status">Brak zmiany statusu przez (dni)</label>
            <input
              id="mf-attention-status"
              type="number"
              min={1}
              placeholder="Wartość domyślna"
              value={form.statusStaleDaysOverride}
              onChange={(e) => set('statusStaleDaysOverride', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="mf-attention-age">Dni od zgłoszenia reklamacji</label>
            <input
              id="mf-attention-age"
              type="number"
              min={1}
              placeholder="Wartość domyślna"
              value={form.caseAgeStaleDaysOverride}
              onChange={(e) => set('caseAgeStaleDaysOverride', e.target.value)}
            />
          </div>
        </div>
        <p className="hint" style={{ marginTop: -8 }}>
          Puste pole = użyj wartości domyślnej firmy (Ustawienia → Przypomnienia). Wypełnienie tutaj
          nadpisuje tę wartość wyłącznie dla spraw tego producenta.
        </p>

        <div className="modal-section-label">Logistyka</div>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="mf-return-address">
              Adres, na który wysyłany jest reklamowany produkt
            </label>
            <input
              id="mf-return-address"
              type="text"
              value={form.returnAddress}
              onChange={(e) => set('returnAddress', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="mf-transport-organizer">Kto organizuje transport</label>
            <select
              id="mf-transport-organizer"
              value={form.transportOrganizer}
              onChange={(e) => set('transportOrganizer', e.target.value as TransportOrganizer)}
            >
              {(Object.keys(TRANSPORT_ORGANIZER_LABELS) as TransportOrganizer[]).map((value) => (
                <option key={value} value={value}>
                  {TRANSPORT_ORGANIZER_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontWeight: 500,
                marginTop: 22,
              }}
            >
              <input
                id="mf-manufacturer-label"
                type="checkbox"
                style={{ width: 'auto' }}
                checked={form.manufacturerProvidesLabel}
                onChange={(e) => set('manufacturerProvidesLabel', e.target.checked)}
              />
              Producent wysyła własną etykietę kurierską
            </label>
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
              <input
                id="mf-shop-courier"
                type="checkbox"
                style={{ width: 'auto' }}
                checked={form.shopCanOrderCourier}
                onChange={(e) => set('shopCanOrderCourier', e.target.checked)}
              />
              Sklep może zamówić kuriera w imieniu klienta
            </label>
          </div>
          <div className="field">
            <label htmlFor="mf-courier-cost">Koszt zamówienia kuriera przez sklep (zł)</label>
            <input
              id="mf-courier-cost"
              type="number"
              min={0}
              step="0.01"
              value={form.shopCourierCost}
              onChange={(e) => set('shopCourierCost', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
              <input
                id="mf-original-packaging"
                type="checkbox"
                style={{ width: 'auto' }}
                checked={form.originalPackagingRequired}
                onChange={(e) => set('originalPackagingRequired', e.target.checked)}
              />
              Wymagane oryginalne opakowanie
            </label>
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
              <input
                id="mf-substitute-packaging"
                type="checkbox"
                style={{ width: 'auto' }}
                checked={form.substitutePackagingAllowed}
                onChange={(e) => set('substitutePackagingAllowed', e.target.checked)}
              />
              Opakowanie zastępcze dopuszczalne
            </label>
          </div>
          <div className="field span-2">
            <label htmlFor="mf-transport-protection">
              Wymagania zabezpieczenia produktu podczas transportu
            </label>
            <input
              id="mf-transport-protection"
              type="text"
              value={form.transportProtectionNote}
              onChange={(e) => set('transportProtectionNote', e.target.value)}
            />
          </div>
          <div className="field span-2">
            <label htmlFor="mf-product-condition">Wymagania dotyczące stanu produktu</label>
            <input
              id="mf-product-condition"
              type="text"
              placeholder="np. produkt czysty, suchy, przygotowany do oględzin"
              value={form.productConditionNote}
              onChange={(e) => set('productConditionNote', e.target.value)}
            />
          </div>
        </div>

        <div className="modal-section-label">Automatyzacja</div>
        <div className="form-grid">
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
              <input
                id="mf-auto-email"
                type="checkbox"
                style={{ width: 'auto' }}
                checked={form.autoEmailEnabled}
                onChange={(e) => set('autoEmailEnabled', e.target.checked)}
              />
              Automatyczne wysyłanie e-mail
            </label>
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
              <input
                id="mf-auto-close"
                type="checkbox"
                style={{ width: 'auto' }}
                checked={form.autoCloseEnabled}
                onChange={(e) => set('autoCloseEnabled', e.target.checked)}
              />
              Automatyczne zamknięcie sprawy
            </label>
          </div>
          <div className="field">
            <label htmlFor="mf-auto-close-days">Po ilu dniach bez aktywności</label>
            <input
              id="mf-auto-close-days"
              type="number"
              min={1}
              value={form.autoCloseDays}
              onChange={(e) => set('autoCloseDays', Number(e.target.value))}
            />
          </div>
        </div>
        <p className="hint" style={{ marginTop: -8 }}>
          Przypomnienia i eskalacje ustawia się progami dniowymi w sekcji „SLA — terminy producenta"
          powyżej (puste pole = wyłączone), a nie osobnymi przełącznikami. Uwaga: automatyczne
          wykonywanie tych akcji nie jest jeszcze aktywne w systemie.
        </p>

        {canManageBrands && (
          <>
            <div className="modal-section-label">Obsługiwane marki</div>
            <div className="field">
              <div className="chip-list">
                {savedBrands.length === 0 && pendingBrands.length === 0 && (
                  <span className="text-sm text-muted">Brak przypisanych marek.</span>
                )}
                {savedBrands.map((brand) => (
                  <span
                    className="chip"
                    key={brand.id}
                    style={
                      brand.active ? undefined : { opacity: 0.55, textDecoration: 'line-through' }
                    }
                    title={brand.active ? 'Kliknij, aby zmienić nazwę' : 'Marka nieaktywna'}
                  >
                    <button
                      type="button"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        font: 'inherit',
                        color: 'inherit',
                        cursor: 'pointer',
                      }}
                      onClick={() => renameBrand(brand)}
                    >
                      {brand.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Nadpisz wymagania marki ${brand.name}`}
                      title="Nadpisz wymagania/SLA tej marki (domyślnie dziedziczy z producenta)"
                      onClick={() => openOverrideModal(brand)}
                    >
                      ⚙
                    </button>
                    <button
                      type="button"
                      aria-label={
                        brand.active
                          ? `Dezaktywuj markę ${brand.name}`
                          : `Przywróć markę ${brand.name}`
                      }
                      title={brand.active ? 'Dezaktywuj markę' : 'Przywróć markę'}
                      onClick={() => toggleBrandActive(brand)}
                    >
                      {brand.active ? (
                        <XIcon width={11} height={11} />
                      ) : (
                        <span style={{ fontSize: 11 }}>↺</span>
                      )}
                    </button>
                  </span>
                ))}
                {pendingBrands.map((name) => (
                  <span className="chip" key={`pending-${name}`}>
                    {name}
                    <button
                      type="button"
                      aria-label={`Usuń markę ${name}`}
                      onClick={() => setPendingBrands((c) => c.filter((b) => b !== name))}
                    >
                      <XIcon width={11} height={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-8 mt-8">
                <input
                  id="mf-brand-input"
                  type="text"
                  placeholder="Nazwa nowej marki…"
                  style={{ flex: 1 }}
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addPendingBrand();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={addPendingBrand}
                >
                  Dodaj markę
                </button>
              </div>
              <span className="hint">
                Marki przypisane do tego producenta podpowiadają go automatycznie przy rejestracji
                reklamacji. Nowe marki zapisują się razem z producentem; usuwanie już zapisanych
                marek nie jest tu dostępne.
              </span>
            </div>
          </>
        )}
      </Modal>

      {/* --- Modal: nadpisania wymagań/SLA marki (Etap 3) --- */}
      <Modal
        open={overrideTarget !== null}
        title={`Wymagania marki „${overrideTarget?.name ?? ''}”`}
        onClose={() => setOverrideTarget(null)}
        error={overrideError}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setOverrideTarget(null)}>
              Anuluj
            </button>
            <button
              className="btn btn-primary"
              onClick={() => overrideMutation.mutate()}
              disabled={overrideMutation.isPending}
            >
              {overrideMutation.isPending ? 'Zapisywanie…' : 'Zapisz'}
            </button>
          </>
        }
      >
        <p className="field-hint-static" style={{ marginTop: 0, marginBottom: 14 }}>
          Domyślnie ("Dziedzicz z producenta") ta marka korzysta z wymagań producenta powyżej. Zmień
          wybrane pola tylko tam, gdzie ta konkretna marka ma się różnić.
        </p>
        <div className="form-grid">
          <TriStateField
            label="Wymagany numer seryjny"
            value={overrideForm.requiresSerialNumber}
            onChange={(v) => setOverrideForm((f) => ({ ...f, requiresSerialNumber: v }))}
          />
          <TriStateField
            label="Wymagany numer ramy"
            value={overrideForm.requiresFrameNumber}
            onChange={(v) => setOverrideForm((f) => ({ ...f, requiresFrameNumber: v }))}
          />
          <TriStateField
            label="Wymagany dowód zakupu"
            value={overrideForm.requiresProofOfPurchase}
            onChange={(v) => setOverrideForm((f) => ({ ...f, requiresProofOfPurchase: v }))}
          />
          <TriStateField
            label="Wymagany film"
            value={overrideForm.requiresVideo}
            onChange={(v) => setOverrideForm((f) => ({ ...f, requiresVideo: v }))}
          />
          <div className="field">
            <label htmlFor="bo-min-photos">Min. liczba zdjęć</label>
            <input
              id="bo-min-photos"
              type="number"
              min={0}
              placeholder="dziedzicz"
              value={overrideForm.minPhotos}
              onChange={(e) => setOverrideForm((f) => ({ ...f, minPhotos: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="bo-max-photos">Maks. liczba zdjęć</label>
            <input
              id="bo-max-photos"
              type="number"
              min={0}
              placeholder="dziedzicz"
              value={overrideForm.maxPhotos}
              onChange={(e) => setOverrideForm((f) => ({ ...f, maxPhotos: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="bo-max-size">Maks. rozmiar załączników (MB)</label>
            <input
              id="bo-max-size"
              type="number"
              min={0}
              placeholder="dziedzicz"
              value={overrideForm.maxAttachmentSizeMb}
              onChange={(e) =>
                setOverrideForm((f) => ({ ...f, maxAttachmentSizeMb: e.target.value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="bo-status-stale">Próg "brak zmiany statusu" (dni)</label>
            <input
              id="bo-status-stale"
              type="number"
              min={0}
              placeholder="dziedzicz"
              value={overrideForm.statusStaleDaysOverride}
              onChange={(e) =>
                setOverrideForm((f) => ({ ...f, statusStaleDaysOverride: e.target.value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="bo-age-stale">Próg "dni od zgłoszenia" (dni)</label>
            <input
              id="bo-age-stale"
              type="number"
              min={0}
              placeholder="dziedzicz"
              value={overrideForm.caseAgeStaleDaysOverride}
              onChange={(e) =>
                setOverrideForm((f) => ({ ...f, caseAgeStaleDaysOverride: e.target.value }))
              }
            />
          </div>
        </div>
      </Modal>

      {/* --- Modal: TRWAŁE usunięcie (RBAC.md §5, wyłącznie Administrator) --- */}
      <Modal
        open={deleteTarget !== null}
        title={`Trwale usunąć producenta „${contractorById.get(deleteTarget?.contractorId ?? '')?.name ?? ''}”?`}
        onClose={() => setDeleteTarget(null)}
        error={deleteError}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>
              Wróć
            </button>
            <button
              className="btn btn-danger"
              onClick={() => deleteMutation.mutate()}
              disabled={
                deleteConfirmText.trim() !==
                  (contractorById.get(deleteTarget?.contractorId ?? '')?.name ?? '') ||
                deleteMutation.isPending
              }
            >
              {deleteMutation.isPending ? 'Usuwanie…' : 'Usuń trwale'}
            </button>
          </>
        }
      >
        <p className="field-error" role="alert" style={{ display: 'block', marginBottom: 14 }}>
          Tej operacji NIE da się cofnąć. Zablokowana automatycznie, jeśli producent ma przypisane
          produkty lub marki — w takim wypadku dezaktywuj go zamiast usuwać.
        </p>
        <div className="field">
          <label htmlFor="mf-delete-confirm">
            Wpisz nazwę producenta{' '}
            <strong>{contractorById.get(deleteTarget?.contractorId ?? '')?.name ?? ''}</strong>, aby
            potwierdzić
          </label>
          <input
            id="mf-delete-confirm"
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder={contractorById.get(deleteTarget?.contractorId ?? '')?.name ?? ''}
            autoComplete="off"
          />
        </div>
      </Modal>
    </div>
  );
}
