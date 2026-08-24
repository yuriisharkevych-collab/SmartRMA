import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  casesApi,
  type CaseMessage,
  type CaseSummary,
  type Decision,
  type DecisionFulfillmentMethod,
  type HandoffThreadSide,
  type MessageChannel,
  type UpdateCaseItemPayload,
} from '@/api/cases.api';
import type { CaseStatus } from '@/api/case-statuses.api';
import { isApiError } from '@/api/client';
import { customersApi, type UpdateCustomerPayload } from '@/api/customers.api';
import { documentsApi } from '@/api/documents.api';
import { partnershipsApi } from '@/api/partnerships.api';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { Modal } from '@/components/common/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import {
  CasesIcon,
  FileDocIcon,
  FileImageIcon,
  FileVideoIcon,
  UploadIcon,
} from '@/components/common/icons';
import { useAuth } from '@/hooks/useAuth';
import { useCaseLookups } from '@/hooks/useCaseLookups';
import { useCaseStatuses } from '@/hooks/useCaseStatuses';
import { useToast } from '@/hooks/useToast';
import { copyToClipboard } from '@/lib/clipboard';
import {
  CHANNEL_LABELS,
  DECISION_LABELS,
  DOCUMENT_CATEGORY_LABELS,
  HISTORY_ACTION_LABELS,
  NEXT_ACTION_BY_STATUS,
  ORIGIN_TYPE_LABELS,
  PRIORITY_TONES,
  SOURCE_LABELS,
  documentIconKind,
  formatCustomerAddress,
  formatDateTime,
  formatFileSize,
  historyIcon,
} from '@/lib/case-labels';
import { COMPLAINT_TYPE_LABELS, formatDate } from '@/lib/case-filters';

const DECISION_FULFILLMENT_LABELS: Record<DecisionFulfillmentMethod, string> = {
  Kurier: 'Kurier',
  OdbiorOsobisty: 'Odbiór osobisty',
  PrzelewBankowy: 'Przelew bankowy',
  Inne: 'Inne',
};

/** §6 wymagania właściciela — twardsze potwierdzenie dla statusów oznaczonych `requiresConfirmation` (Zakończona/Decyzja negatywna/Reklamacja zgłoszona ponownie w domyślnym katalogu). */
function statusConfirmationMessage(target: CaseStatus): string {
  if (target.code === 'Zakonczona')
    return 'Czy na pewno chcesz oznaczyć reklamację jako zakończoną?';
  return `Czy na pewno chcesz zmienić status na „${target.label}”?`;
}

/** §4 — ostrzeżenie (nigdy blokada) dla cofnięcia/nietypowego skoku w procesie. */
function unusualTransitionMessage(current: CaseStatus, target: CaseStatus): string {
  return `Ta zmiana przenosi reklamację z etapu „${current.label}” na etap „${target.label}”, co jest nietypową kolejnością w procesie reklamacyjnym. Czy na pewno chcesz kontynuować?`;
}

type TabKey = 'general' | 'documents' | 'history' | 'notes' | 'messages';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'general', label: 'Ogólne' },
  { key: 'documents', label: 'Dokumenty' },
  { key: 'history', label: 'Historia' },
  { key: 'notes', label: 'Notatki' },
  { key: 'messages', label: 'Wiadomości' },
];

const INFO_REQUEST_CHIPS = [
  'numer seryjny produktu',
  'dodatkowe zdjęcia usterki',
  'dowód zakupu (paragon/faktura)',
  'dodatkowy dokument od producenta',
];

/**
 * Odpowiednik `case-detail.html` + `js/case-detail.js` — karta sprawy, na
 * której toczy się codzienna praca.
 *
 * Trzy miejsca, w których świadomie wychodzę POZA prototyp (prototyp miał
 * tam puste stany „poza zakresem"):
 *  - **Notatki** — prototypowa zakładka „Komentarze" była zaślepką; backend
 *    ma `GET/POST /cases/:id/notes`, więc jest w pełni działająca.
 *  - **Wiadomości** — nowa zakładka na `GET/POST /cases/:id/messages`.
 *  - **Dokumenty** — prototyp zapowiadał upload „w kolejnym etapie"; tutaj
 *    działa realny upload, podgląd/pobranie binarium i oznaczanie błędnych
 *    (BR-020 — dokumentu nigdy nie kasujemy).
 *
 * Zakładka „Zadania" z prototypu NIE ma odpowiednika — była pustym stanem
 * („Automatyczne zadania (BR-052) w kolejnym etapie"), a backend nie ma
 * encji zadań. Pusta zakładka nie wnosi nic ponad to, co już wiadomo.
 */
export function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const caseId = id!;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const lookups = useCaseLookups();
  const caseStatuses = useCaseStatuses();

  const [tab, setTab] = useState<TabKey>('general');
  const [error, setError] = useState<string | null>(null);

  const {
    data: caseRecord,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => casesApi.getById(caseId),
    retry: false,
  });

  const { data: history } = useQuery({
    queryKey: ['case-history', caseId],
    queryFn: () => casesApi.history(caseId),
  });

  // Producent/Dystrybutor + Partnerzy B2B (Faza 5/6) — wąski wątek przekazania. Sprawa "w
  // środku" łańcucha (np. Dystrybutor w Sklep→Dystrybutor→Producent) ma OBA pola naraz —
  // `receivedFrom` (skąd przyszła) i `sentTo` (dokąd poszła dalej), patrz `HandoffThread`.
  // Dostępny każdemu, kto widzi samą sprawę (`cases.view` już wymuszony przez trasę).
  const { data: handoffThread } = useQuery({
    queryKey: ['case-handoff', caseId],
    queryFn: () => casesApi.getHandoffThread(caseId),
    retry: false,
  });
  // "Wyślij do partnera" pozostaje dostępne nawet dla sprawy JUŻ odebranej od partnera
  // (trasa wieloetapowa) — blokuje wyłącznie ponowne wysłanie TEJ SAMEJ sprawy dalej (`sentTo`).
  const { data: activePartnerships } = useQuery({
    queryKey: ['partnerships-active'],
    queryFn: () => partnershipsApi.list(),
    enabled: hasPermission('cases.handoff.send') && !handoffThread?.sentTo,
    select: (list) => list.filter((p) => p.status === 'Active' && p.brands.length > 0),
  });

  const { data: documents } = useQuery({
    queryKey: ['case-documents', caseId],
    queryFn: () => documentsApi.list(caseId),
    enabled: hasPermission('documents.view'),
    retry: false,
  });
  const { data: notes } = useQuery({
    queryKey: ['case-notes', caseId],
    queryFn: () => casesApi.notes(caseId),
    enabled: hasPermission('notes.view'),
    retry: false,
  });
  const {
    data: messages,
    refetch: refetchMessages,
    isFetching: isFetchingMessages,
  } = useQuery({
    queryKey: ['case-messages', caseId],
    queryFn: () => casesApi.messages(caseId),
    enabled: hasPermission('messages.view'),
    retry: false,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['case', caseId] });
    queryClient.invalidateQueries({ queryKey: ['case-history', caseId] });
    // "Poproś o uzupełnienie danych" tworzy też `Message` (Wiadomości/Portal Klienta,
    // patrz `CasesService.performTransition`) — bez tego licznik/lista w zakładce
    // Wiadomości pokazywały starą treść, dopóki użytkownik ręcznie nie kliknął Odśwież.
    queryClient.invalidateQueries({ queryKey: ['case-messages', caseId] });
    queryClient.invalidateQueries({ queryKey: ['cases'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
  }

  const markReadMutation = useMutation({
    mutationFn: () => casesApi.markMessagesRead(caseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', caseId] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });

  // Wejście na zakładkę Wiadomości = przeczytanie ich przez pracownika — czerwona
  // kropka/kafelek mają zniknąć bez ręcznego odświeżania, patrz życzenie właściciela.
  useEffect(() => {
    if (
      tab === 'messages' &&
      hasPermission('messages.view') &&
      (caseRecord?.unreadMessagesCount ?? 0) > 0
    ) {
      markReadMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, caseRecord?.unreadMessagesCount]);

  function handleError(err: unknown, fallback: string) {
    setError(isApiError(err) ? (err.response?.data.error.message ?? fallback) : fallback);
  }

  // --- Modale ---
  const [statusModal, setStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [notifyCustomerOnStatusChange, setNotifyCustomerOnStatusChange] = useState(true);
  const [complaintTypeModal, setComplaintTypeModal] = useState(false);
  const [newComplaintType, setNewComplaintType] = useState('');
  const [decisionModal, setDecisionModal] = useState(false);
  const [decision, setDecision] = useState<Decision>('Naprawa');
  const [decisionContractorId, setDecisionContractorId] = useState('');
  const [decisionJustification, setDecisionJustification] = useState('');
  const [decisionFulfillmentMethod, setDecisionFulfillmentMethod] = useState<
    DecisionFulfillmentMethod | ''
  >('');
  const [decisionManufacturerResponse, setDecisionManufacturerResponse] = useState('');
  const [infoModal, setInfoModal] = useState(false);
  const [infoItems, setInfoItems] = useState<string[]>([]);
  const [infoText, setInfoText] = useState('');
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [shareNewDocsWithCustomer, setShareNewDocsWithCustomer] = useState(false);
  const [ownerModal, setOwnerModal] = useState(false);
  const [newOwnerId, setNewOwnerId] = useState('');
  // Do tej pory nie było ŻADNEJ drogi poprawienia błędnie wpisanych danych klienta ani pozycji
  // (model/producent/nr seryjny/nr ramy) po zapisaniu sprawy — pracownik zgłosił to jako lukę.
  const [customerModal, setCustomerModal] = useState(false);
  const [customerForm, setCustomerForm] = useState<UpdateCustomerPayload>({});
  const [itemModal, setItemModal] = useState(false);
  const [itemForm, setItemForm] = useState<UpdateCaseItemPayload>({});
  // Producent/Dystrybutor + Partnerzy B2B (Faza 5) — "Wyślij do partnera".
  const [handoffModal, setHandoffModal] = useState(false);
  const [handoffPartnershipId, setHandoffPartnershipId] = useState('');
  const [handoffBrandId, setHandoffBrandId] = useState('');
  const [messageDraft, setMessageDraft] = useState<{
    channel: MessageChannel;
    subject: string;
    content: string;
  }>({
    channel: 'Portal',
    subject: '',
    content: '',
  });
  const [messageAttachments, setMessageAttachments] = useState<File[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [portalCode, setPortalCode] = useState<string | null>(null);
  const [secureLink, setSecureLink] = useState<string | null>(null);

  const statusMutation = useMutation({
    mutationFn: () => casesApi.changeStatus(caseId, newStatus, notifyCustomerOnStatusChange),
    onSuccess: (updated) => {
      setStatusModal(false);
      setError(null);
      showToast(`Status zmieniony na „${caseStatuses.statusLabel(updated.status)}”.`);
      refresh();
    },
    onError: (err) => handleError(err, 'Nie udało się zmienić statusu.'),
  });

  const complaintTypeMutation = useMutation({
    mutationFn: () =>
      casesApi.update(caseId, {
        complaintType: newComplaintType as 'Warranty' | 'StatutoryWarranty',
      }),
    onSuccess: () => {
      setComplaintTypeModal(false);
      setError(null);
      showToast('Rodzaj zgłoszenia zapisany.');
      refresh();
    },
    onError: (err) => handleError(err, 'Nie udało się zmienić rodzaju zgłoszenia.'),
  });

  const decisionMutation = useMutation({
    mutationFn: () =>
      casesApi.setDecision(caseId, decision, {
        decisionContractorId: decisionContractorId || undefined,
        decisionJustification: decisionJustification.trim() || undefined,
        decisionFulfillmentMethod: decisionFulfillmentMethod || undefined,
        decisionManufacturerResponse: decisionManufacturerResponse.trim() || undefined,
      }),
    onSuccess: () => {
      setDecisionModal(false);
      setError(null);
      showToast('Decyzja zapisana.');
      refresh();
    },
    onError: (err) => handleError(err, 'Nie udało się zapisać decyzji.'),
  });

  const infoMutation = useMutation({
    mutationFn: () =>
      casesApi.requestInfo(caseId, infoItems.length > 0 ? infoItems : ['inne'], infoText.trim()),
    onSuccess: () => {
      setInfoModal(false);
      setInfoItems([]);
      setInfoText('');
      setError(null);
      showToast('Prośba wysłana do klienta.');
      refresh();
    },
    onError: (err) => handleError(err, 'Nie udało się wysłać prośby.'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => casesApi.cancel(caseId, cancelReason.trim()),
    onSuccess: () => {
      setCancelModal(false);
      setCancelReason('');
      setError(null);
      showToast('Sprawa anulowana.');
      refresh();
    },
    onError: (err) => handleError(err, 'Nie udało się anulować sprawy.'),
  });

  /** `cases.delete` (RBAC.md §5) — TRWAŁE, nieodwracalne usunięcie. Wyłącznie do spraw testowych, na wyraźne żądanie właściciela. */
  const deleteMutation = useMutation({
    mutationFn: () => casesApi.delete(caseId),
    onSuccess: () => {
      showToast('Sprawa trwale usunięta.');
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      navigate('/cases');
    },
    onError: (err) => handleError(err, 'Nie udało się usunąć sprawy.'),
  });

  const archiveMutation = useMutation({
    mutationFn: () => casesApi.archive(caseId),
    onSuccess: () => {
      showToast('Sprawa zarchiwizowana.');
      refresh();
    },
    onError: (err) => handleError(err, 'Nie udało się zarchiwizować sprawy.'),
  });

  const ownerMutation = useMutation({
    mutationFn: () => casesApi.assignOwner(caseId, newOwnerId),
    onSuccess: () => {
      setOwnerModal(false);
      setError(null);
      showToast('Właściciel sprawy zmieniony.');
      refresh();
    },
    onError: (err) => handleError(err, 'Nie udało się zmienić właściciela.'),
  });

  const handoffMutation = useMutation({
    mutationFn: () => casesApi.sendToPartner(caseId, handoffPartnershipId, handoffBrandId),
    onSuccess: (result) => {
      setHandoffModal(false);
      setError(null);
      showToast(`Sprawa przekazana partnerowi — numer u partnera: ${result.targetCaseNumber}.`);
      refresh();
      queryClient.invalidateQueries({ queryKey: ['case-handoff', caseId] });
    },
    onError: (err) => handleError(err, 'Nie udało się przekazać sprawy partnerowi.'),
  });

  const noteMutation = useMutation({
    mutationFn: () => casesApi.addNote(caseId, noteDraft.trim()),
    onSuccess: () => {
      setNoteDraft('');
      showToast('Notatka dodana.');
      queryClient.invalidateQueries({ queryKey: ['case-notes', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case-history', caseId] });
    },
    onError: (err) => handleError(err, 'Nie udało się dodać notatki.'),
  });

  const messageMutation = useMutation({
    mutationFn: async () => {
      const documentIds: string[] = [];
      for (const file of messageAttachments) {
        const category = file.type.startsWith('image/')
          ? 'Photo'
          : file.type.startsWith('video/')
            ? 'Video'
            : 'Other';
        const uploaded = await documentsApi.upload(caseId, file, category);
        documentIds.push(uploaded.id);
      }
      return casesApi.sendMessage(caseId, {
        channel: messageDraft.channel,
        subject: messageDraft.subject.trim() || undefined,
        content: messageDraft.content.trim(),
        documentIds: documentIds.length > 0 ? documentIds : undefined,
      });
    },
    onSuccess: () => {
      setMessageDraft({ channel: 'Portal', subject: '', content: '' });
      setMessageAttachments([]);
      setError(null);
      showToast('Wiadomość wysłana.');
      queryClient.invalidateQueries({ queryKey: ['case-messages', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case-history', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case-documents', caseId] });
    },
    onError: (err) => handleError(err, 'Nie udało się wysłać wiadomości.'),
  });

  const portalMutation = useMutation({
    mutationFn: async (enable: boolean) => {
      if (enable) return { code: (await casesApi.enablePortal(caseId)).value };
      await casesApi.disablePortal(caseId);
      return { code: null };
    },
    onSuccess: ({ code }) => {
      setPortalCode(code);
      setSecureLink(null);
      showToast(
        code
          ? 'Portal klienta włączony. Kod dostępu pokazany jest jeden raz.'
          : 'Portal klienta wyłączony.',
      );
      refresh();
    },
    onError: (err) => handleError(err, 'Nie udało się zmienić ustawień portalu.'),
  });

  const linkMutation = useMutation({
    mutationFn: () => casesApi.generateSecureLink(caseId),
    onSuccess: (credential) => {
      const url = `${window.location.origin}/portal/login?case=${encodeURIComponent(caseRecord!.caseNumber)}&token=${credential.value}`;
      setSecureLink(url);
      showToast('Wygenerowano jednorazowy link. Skopiuj i wyślij klientowi.');
    },
    onError: (err) => handleError(err, 'Nie udało się wygenerować linku.'),
  });

  // Pola nigdy niewypełnione (puste "") muszą zniknąć z payloadu, nie polecieć jako pusty
  // string — `@IsOptional()` w DTO pomija WYŁĄCZNIE `undefined`, a `@IsEmail`/`@IsUUID`/
  // `@IsDateString` odrzuca `""` (ten sam wzorzec co `CompanyTab.saveMutation` w SettingsPage).
  function stripEmpty<T extends object>(form: T): Partial<T> {
    return Object.fromEntries(
      Object.entries(form).filter(([, value]) => value !== ''),
    ) as Partial<T>;
  }

  const updateCustomerMutation = useMutation({
    mutationFn: (payload: UpdateCustomerPayload) =>
      customersApi.update(caseRecord!.customerId, stripEmpty(payload)),
    onSuccess: () => {
      setCustomerModal(false);
      showToast('Dane klienta zapisane.');
      setError(null);
      // Dane klienta żyją w osobnej encji (`['customers']`), nie na samej sprawie —
      // `['case', caseId]` nie trzeba odświeżać, karta czyta je z `lookups.customerById`.
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err) => handleError(err, 'Nie udało się zapisać danych klienta.'),
  });

  const updateItemMutation = useMutation({
    mutationFn: (payload: UpdateCaseItemPayload) =>
      casesApi.updateItem(caseId, caseRecord!.items[0].id, stripEmpty(payload)),
    onSuccess: () => {
      setItemModal(false);
      showToast('Dane pozycji zapisane.');
      setError(null);
      refresh();
      // Poprawiony model mógł dopisać/zmienić `Product` w katalogu — odśwież listę,
      // z której korzysta m.in. Nowa reklamacja (podpowiedzi modeli).
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => handleError(err, 'Nie udało się zapisać danych pozycji.'),
  });

  async function openDocument(documentId: string) {
    try {
      const url = await documentsApi.getFileObjectUrl(caseId, documentId);
      window.open(url, '_blank');
      // Zwolnienie po otwarciu — przeglądarka zdążyła już wczytać blob.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      handleError(err, 'Nie udało się otworzyć pliku.');
    }
  }

  async function uploadDocuments(fileList: FileList | null, shareWithCustomer: boolean) {
    if (!fileList || fileList.length === 0) return;
    const picked = Array.from(fileList);
    try {
      for (const file of picked) {
        const category = file.type.startsWith('image/')
          ? 'Photo'
          : file.type.startsWith('video/')
            ? 'Video'
            : 'Other';
        await documentsApi.upload(caseId, file, category, shareWithCustomer ? 'Public' : undefined);
      }
      showToast(`Dodano ${picked.length} ${picked.length === 1 ? 'załącznik' : 'załączniki'}.`);
      queryClient.invalidateQueries({ queryKey: ['case-documents', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case-history', caseId] });
    } catch (err) {
      handleError(err, 'Nie udało się dodać załącznika.');
    }
  }

  if (isLoading) return <LoadingIndicator />;

  if (isError || !caseRecord) {
    return (
      <div className="empty-state" style={{ marginTop: 60 }}>
        <div className="icon-wrap">
          <CasesIcon />
        </div>
        <h4>Nie znaleziono sprawy</h4>
        <p>Sprawa o podanym identyfikatorze nie istnieje lub nie masz do niej dostępu.</p>
        <Link to="/cases" className="btn btn-secondary mt-16">
          Wróć do listy reklamacji
        </Link>
      </div>
    );
  }

  const c: CaseSummary = caseRecord;
  const customer = lookups.customerById.get(c.customerId);
  const owner = c.ownerId ? lookups.userById.get(c.ownerId) : undefined;
  const item = c.items[0];
  const product = item ? lookups.productById.get(item.productId) : undefined;
  const isTerminal = caseStatuses.isFinalStatus(c.status);
  const currentStatusDef = caseStatuses.byCode.get(c.status);

  /**
   * Status Workflow Refactor §3 (CRITICAL PHILOSOPHY CHANGE) — pracownik może wybrać KAŻDY
   * aktywny status katalogu w dowolnym momencie, bez tabeli przejść: prawdziwa praca nie jest
   * liniowa (telefon od producenta, zmiana decyzji, cofnięcie błędnie ustawionego statusu).
   * Lista w dropdownie zawiera bieżący status (§5 — wybór tego samego = brak operacji, nie
   * błąd), posortowana wg kolejności ustawionej w Ustawienia → Statusy reklamacji.
   */
  const statusOptions = caseStatuses.activeStatuses;
  /**
   * Uporządkowanie listy w dropdownie (NIE ograniczenie wyboru — pracownik nadal widzi i może
   * wybrać KAŻDY aktywny status, patrz §3 wyżej). "Typowy następny krok" = ta sama definicja
   * "typowości", co już istniejące ostrzeżenie `isUnusualTransition` niżej (order dokładnie
   * current+1) — dwie grupy w jednym `<select>` zamiast płaskiej listy 9 pozycji, żeby
   * pracownik od razu widział oczekiwany kolejny krok, bez przeszukiwania całego katalogu przy
   * każdej zmianie statusu.
   */
  const typicalNextStatuses = statusOptions.filter(
    (s) => s.code !== c.status && s.order === (currentStatusDef?.order ?? 0) + 1,
  );
  const typicalNextCodes = new Set(typicalNextStatuses.map((s) => s.code));
  const otherStatuses = statusOptions.filter((s) => !typicalNextCodes.has(s.code));
  const selectedStatusDef = newStatus ? caseStatuses.byCode.get(newStatus) : undefined;
  const isSameStatusSelected = newStatus !== '' && newStatus === c.status;
  // §4 — ostrzeżenie (NIGDY blokada) dla nietypowych zmian: cofnięcie/pozostanie na tym samym
  // poziomie procesu albo przeskoczenie więcej niż jednego etapu naraz.
  const isUnusualTransition =
    !isSameStatusSelected &&
    !!currentStatusDef &&
    !!selectedStatusDef &&
    (selectedStatusDef.order <= currentStatusDef.order ||
      Math.abs(selectedStatusDef.order - currentStatusDef.order) > 1);

  // §3 — decyzję można ustawić (lub zmienić) z KAŻDEGO aktywnego statusu, nie tylko dawnych
  // dedykowanych "oczekiwanie na decyzję" (te statusy nie istnieją już w nowym katalogu).
  const canDecide = !isTerminal;
  /** Formularz publiczny nie pyta klienta o gwarancję/rękojmię — pracownik ustawia to tutaj podczas weryfikacji. CASE-014 — zmiana zablokowana, gdy sprawa poszła dalej niż "Przyjęta" (kolejność katalogu > 2). */
  const canEditComplaintType = (currentStatusDef?.order ?? 0) <= 2;

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/cases">Reklamacje</Link> <span>/</span>{' '}
        <span className="mono">{c.caseNumber}</span>
      </div>

      <div className="detail-header">
        <div>
          <div className="detail-title-row">
            <span className="detail-case-number mono">{c.caseNumber}</span>
            <span className={`badge badge-${caseStatuses.statusTone(c.status)}`}>
              {caseStatuses.statusLabel(c.status)}
            </span>
            {c.cancelledAt && <span className="tag">Anulowana {formatDate(c.cancelledAt)}</span>}
            {c.archivedAt && <span className="tag">Zarchiwizowana {formatDate(c.archivedAt)}</span>}
            <span className="tag">{COMPLAINT_TYPE_LABELS[c.complaintType] ?? c.complaintType}</span>
            {canEditComplaintType && (
              <PermissionGate permissions={['cases.edit']}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 8px' }}
                  onClick={() => {
                    setNewComplaintType(c.complaintType);
                    setComplaintTypeModal(true);
                  }}
                  title="Zmień rodzaj zgłoszenia"
                >
                  Zmień
                </button>
              </PermissionGate>
            )}
            {c.isException && <span className="badge badge-red">Nietypowa</span>}
          </div>
          <p className="page-subtitle mt-4">
            {product?.name ?? '—'} · {customer ? `${customer.firstName} ${customer.lastName}` : '—'}{' '}
            · utworzono {formatDate(c.createdAt)}
          </p>
        </div>
        <div className="detail-actions">
          <Link to={`/cases/${caseId}/print`} target="_blank" className="btn btn-secondary btn-sm">
            Drukuj potwierdzenie
          </Link>
          <PermissionGate permissions={['messages.send']}>
            <button
              className="btn btn-secondary btn-sm"
              style={{ position: 'relative' }}
              onClick={() => setTab('messages')}
            >
              Wiadomości{(messages ?? []).length > 0 ? ` (${(messages ?? []).length})` : ''}
              {c.unreadMessagesCount > 0 && (
                <span
                  title={`Nieprzeczytana wiadomość od klienta (${c.unreadMessagesCount})`}
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: -3,
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: 'var(--red)',
                    border: '1.5px solid var(--surface)',
                  }}
                />
              )}
            </button>
          </PermissionGate>
          <PermissionGate permissions={['cases.infoRequest.send']}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setInfoModal(true)}
              disabled={isTerminal}
            >
              Poproś o uzupełnienie danych
            </button>
          </PermissionGate>
          <PermissionGate permissions={['cases.assign']}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setNewOwnerId(c.ownerId ?? '');
                setOwnerModal(true);
              }}
              disabled={isTerminal}
            >
              Zmień właściciela
            </button>
          </PermissionGate>
          {canDecide && (
            <PermissionGate permissions={['cases.decision.set', 'cases.decision.approve']}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setDecision((c.decision as Decision) ?? 'Naprawa');
                  setDecisionContractorId(c.decisionContractorId ?? '');
                  setDecisionJustification(c.decisionJustification ?? '');
                  setDecisionFulfillmentMethod(
                    (c.decisionFulfillmentMethod as DecisionFulfillmentMethod) ?? '',
                  );
                  setDecisionManufacturerResponse(c.decisionManufacturerResponse ?? '');
                  setDecisionModal(true);
                }}
              >
                {c.decision ? 'Zmień decyzję' : 'Ustaw decyzję'}
              </button>
            </PermissionGate>
          )}
          {/* Status Workflow Refactor §17/§18 — "Zmień status" NIE jest blokowany przez isTerminal:
              pracownik musi móc wyprowadzić sprawę ze statusu końcowego (np. Zakończona →
              Reklamacja zgłoszona ponownie). Pozostałe akcje na tej sprawie zostają zablokowane. */}
          <PermissionGate permissions={['cases.status.change']}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setNewStatus('');
                setNotifyCustomerOnStatusChange(true);
                setStatusModal(true);
              }}
            >
              Zmień status
            </button>
          </PermissionGate>
          {isTerminal && !c.archivedAt && (
            <PermissionGate permissions={['cases.archive']}>
              <button className="btn btn-secondary btn-sm" onClick={() => archiveMutation.mutate()}>
                Archiwizuj
              </button>
            </PermissionGate>
          )}
          {!isTerminal && (
            <PermissionGate permissions={['cases.cancel']}>
              <button className="btn btn-danger btn-sm" onClick={() => setCancelModal(true)}>
                Anuluj sprawę
              </button>
            </PermissionGate>
          )}
          <PermissionGate permissions={['cases.delete']}>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => {
                setDeleteConfirmText('');
                setDeleteModal(true);
              }}
              title="Trwałe, nieodwracalne usunięcie sprawy — wyłącznie do spraw testowych"
            >
              Usuń sprawę
            </button>
          </PermissionGate>
        </div>
      </div>

      {error && (
        <p className="field-error" style={{ display: 'block', marginBottom: 12 }}>
          {error}
        </p>
      )}

      <div className="detail-grid">
        <div>
          <div className="tabs">
            {TABS.map((t) => (
              <div
                key={t.key}
                className={`tab ${tab === t.key ? 'active' : ''}`}
                onClick={() => setTab(t.key)}
                role="button"
                tabIndex={0}
              >
                {t.label}
              </div>
            ))}
          </div>

          {tab === 'general' && (
            <>
              <div className="card card-pad mt-16" style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                  }}
                >
                  <h3 style={{ margin: 0 }}>Klient</h3>
                  <PermissionGate permissions={['customers.edit']}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setCustomerForm({
                          firstName: customer?.firstName ?? '',
                          lastName: customer?.lastName ?? '',
                          phone: customer?.phone ?? '',
                          email: customer?.email ?? '',
                          address: customer?.address ?? '',
                          city: customer?.city ?? '',
                          postalCode: customer?.postalCode ?? '',
                        });
                        setError(null);
                        setCustomerModal(true);
                      }}
                    >
                      Edytuj
                    </button>
                  </PermissionGate>
                </div>
                <div className="kv-list">
                  <Kv
                    label="Imię i nazwisko"
                    value={customer ? `${customer.firstName} ${customer.lastName}` : '—'}
                  />
                  <Kv label="Telefon" value={customer?.phone ?? '—'} />
                  <Kv label="E-mail" value={customer?.email ?? '—'} />
                  <Kv label="Adres" value={formatCustomerAddress(customer)} />
                </div>
              </div>

              <div className="card card-pad" style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                  }}
                >
                  <h3 style={{ margin: 0 }}>Produkt</h3>
                  <PermissionGate permissions={['cases.edit']}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setItemForm({
                          manufacturerId: item?.manufacturerId ?? '',
                          productName: product?.name ?? '',
                          serialNumber: item?.serialNumber ?? '',
                          frameNumber: item?.frameNumber ?? '',
                          purchaseDate: item?.purchaseDate ? item.purchaseDate.slice(0, 10) : '',
                          purchaseProofNumber: item?.purchaseProofNumber ?? '',
                          description: item?.description ?? '',
                        });
                        setError(null);
                        setItemModal(true);
                      }}
                    >
                      Edytuj
                    </button>
                  </PermissionGate>
                </div>
                <div className="kv-list">
                  <Kv label="Producent" value={lookups.manufacturerName(item?.manufacturerId)} />
                  <Kv label="Model" value={product?.name ?? '—'} />
                  <Kv label="Numer seryjny" value={item?.serialNumber ?? '—'} mono />
                  <Kv label="Numer ramy" value={item?.frameNumber ?? '—'} mono />
                  <Kv label="Data zakupu" value={formatDate(item?.purchaseDate ?? null)} />
                  <Kv label="Dowód zakupu" value={item?.purchaseProofNumber ?? '—'} />
                  <Kv label="Opis usterki" value={item?.description ?? '—'} />
                </div>
              </div>

              <div className="card card-pad">
                <h3 style={{ marginBottom: 12 }}>Zgłoszenie</h3>
                <div className="kv-list">
                  <Kv label="Źródło zgłoszenia" value={SOURCE_LABELS[c.source] ?? c.source} />
                  <Kv
                    label="Pochodzenie"
                    value={ORIGIN_TYPE_LABELS[c.originType] ?? c.originType}
                  />
                  <Kv label="Opis zgłoszenia" value={c.description ?? '—'} />
                  {c.customerStatement && (
                    <Kv label="Treść zgłoszenia klienta" value={`„${c.customerStatement}”`} />
                  )}
                  <Kv label="Oczekiwane rozwiązanie" value={c.requestedResolution ?? '—'} />
                  <Kv
                    label="Decyzja"
                    value={
                      c.decision ? (DECISION_LABELS[c.decision] ?? c.decision) : '— nie podjęto —'
                    }
                  />
                </div>
              </div>
            </>
          )}

          {tab === 'documents' && (
            <div className="card card-pad mt-16">
              <PermissionGate permissions={['documents.upload']}>
                <label className="file-drop" style={{ marginBottom: 8 }}>
                  <UploadIcon />
                  <span>Dodaj dokument, zdjęcie lub film</span>
                  <input
                    type="file"
                    multiple
                    hidden
                    accept="image/*,application/pdf,video/mp4"
                    onChange={(e) => {
                      uploadDocuments(e.target.files, shareNewDocsWithCustomer);
                      e.target.value = '';
                    }}
                  />
                </label>
                <label
                  className="flex items-center gap-6"
                  style={{ marginBottom: 14, fontSize: 13 }}
                >
                  <input
                    type="checkbox"
                    checked={shareNewDocsWithCustomer}
                    onChange={(e) => setShareNewDocsWithCustomer(e.target.checked)}
                  />
                  {/* Domyślnie odznaczone — dokument zostaje wewnętrzny (`DocumentVisibility.Internal`, domyślne w schemacie), dopóki pracownik świadomie nie zaznaczy udostępnienia. Bezpieczniejszy domyślny wybór niż odwrotnie (przypadkowe ujawnienie wewnętrznych materiałów klientowi). */}
                  Udostępnij od razu klientowi w Portalu (widoczne w zakładce Dokumenty)
                </label>
              </PermissionGate>

              {(documents ?? []).length === 0 ? (
                <div className="empty-state">
                  <h4>Brak dokumentów</h4>
                  <p>Dokumenty pojawią się tutaj po dodaniu.</p>
                </div>
              ) : (
                (documents ?? []).map((doc) => (
                  <div className="document-row" key={doc.id}>
                    <div className="flex items-center gap-10" style={{ minWidth: 0 }}>
                      <div className="doc-icon">
                        {documentIconKind(doc.fileType) === 'image' ? (
                          <FileImageIcon />
                        ) : documentIconKind(doc.fileType) === 'video' ? (
                          <FileVideoIcon />
                        ) : (
                          <FileDocIcon />
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div
                          className="doc-name"
                          style={
                            doc.status === 'Bledny' ? { textDecoration: 'line-through' } : undefined
                          }
                        >
                          {doc.fileName}
                        </div>
                        <div className="cell-secondary">
                          {DOCUMENT_CATEGORY_LABELS[doc.category] ?? doc.category} ·{' '}
                          {formatFileSize(doc.fileSize)} · {formatDateTime(doc.uploadedAt)}
                          {doc.status === 'Bledny' && ' · oznaczony jako błędny'}
                          {doc.visibility === 'Public' && ' · widoczny dla klienta'}
                        </div>
                      </div>
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => openDocument(doc.id)}
                    >
                      Otwórz
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'history' && (
            <div className="card card-pad mt-16">
              {(history ?? []).length === 0 ? (
                <div className="empty-state">
                  <h4>Brak wpisów</h4>
                  <p>Historia sprawy pojawi się po pierwszej operacji.</p>
                </div>
              ) : (
                <div className="timeline">
                  {[...(history ?? [])].reverse().map((h) => {
                    // Backend dołącza imię/nazwisko autora bez wymogu `users.view` (patrz `CaseHistoryEntry`);
                    // `lookups.userById` to tylko zapasowe źródło dla starszych odpowiedzi API.
                    const authorName =
                      h.userFirstName && h.userLastName
                        ? `${h.userFirstName} ${h.userLastName}`
                        : h.userId
                          ? (() => {
                              const fallback = lookups.userById.get(h.userId);
                              return fallback ? `${fallback.firstName} ${fallback.lastName}` : null;
                            })()
                          : null;
                    // `OwnerChanged` nosi userId w previousValue/newValue (nie status) — bez tego
                    // gałęzi historia pokazywała gołe UUID zamiast imion (UAT — Sekcja 5).
                    const resolveValue = (value: string | null) => {
                      if (!value) return null;
                      if (h.action === 'OwnerChanged') {
                        const user = lookups.userById.get(value);
                        return user ? `${user.firstName} ${user.lastName}` : value;
                      }
                      return caseStatuses.statusLabel(value);
                    };
                    const from = resolveValue(h.previousValue);
                    const to = resolveValue(h.newValue);
                    const detail = from && to ? `${from} → ${to}` : (to ?? '');
                    return (
                      <div className="timeline-item" key={h.id}>
                        <div className="timeline-dot-col">
                          {/* Prototyp renderował emoji zamiast kropki — typ zdarzenia rozpoznawalny jednym spojrzeniem. */}
                          <div
                            className="timeline-dot"
                            style={{
                              background: 'transparent',
                              width: 'auto',
                              height: 'auto',
                              fontSize: 13,
                            }}
                          >
                            {historyIcon(h.action, h.newValue)}
                          </div>
                          <div className="timeline-line" />
                        </div>
                        <div className="timeline-content">
                          <div className="timeline-action">
                            {HISTORY_ACTION_LABELS[h.action] ?? h.action}
                            {detail ? ` — ${detail}` : ''}
                          </div>
                          <div className="timeline-meta">
                            {authorName ?? 'System'} · {formatDateTime(h.createdAt)}
                            {h.visibleForCustomer && ' · widoczne dla klienta'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'notes' && (
            <div className="card card-pad mt-16">
              <PermissionGate permissions={['notes.create']}>
                <div className="field" style={{ marginBottom: 16 }}>
                  <label htmlFor="note-content">Nowa notatka wewnętrzna</label>
                  <textarea
                    id="note-content"
                    rows={3}
                    placeholder="Notatka widoczna wyłącznie dla pracowników — klient jej nie zobaczy."
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                  />
                  <div>
                    <button
                      className="btn btn-primary btn-sm mt-8"
                      onClick={() => noteMutation.mutate()}
                      disabled={!noteDraft.trim() || noteMutation.isPending}
                    >
                      {noteMutation.isPending ? 'Zapisywanie…' : 'Dodaj notatkę'}
                    </button>
                  </div>
                </div>
              </PermissionGate>

              {(notes ?? []).length === 0 ? (
                <div className="empty-state">
                  <h4>Brak notatek</h4>
                  <p>Notatki wewnętrzne nie są widoczne dla klienta.</p>
                </div>
              ) : (
                [...(notes ?? [])].reverse().map((n) => {
                  const author = lookups.userById.get(n.userId);
                  return (
                    <div
                      key={n.id}
                      style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}
                    >
                      <div style={{ fontSize: 13 }}>{n.content}</div>
                      <div className="timeline-meta">
                        {author ? `${author.firstName} ${author.lastName}` : 'Pracownik'} ·{' '}
                        {formatDateTime(n.createdAt)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === 'messages' && (
            <div className="card card-pad mt-16">
              <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                <h4 style={{ margin: 0 }}>Korespondencja z klientem</h4>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    fontWeight: 600,
                    background: 'var(--amber-soft)',
                    color: 'var(--amber)',
                    border: '1px solid var(--amber-soft)',
                    borderRadius: 8,
                  }}
                  onClick={() => refetchMessages()}
                  disabled={isFetchingMessages}
                  title="Wiadomości nie odświeżają się automatycznie — sprawdź, czy klient nie napisał czegoś nowego."
                >
                  {isFetchingMessages ? 'Odświeżanie…' : '⟳ Odśwież'}
                </button>
              </div>

              <PermissionGate permissions={['messages.send']}>
                <div
                  style={{
                    marginBottom: 20,
                    paddingBottom: 20,
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div className="field">
                    <label htmlFor="msg-channel">Kanał odpowiedzi</label>
                    <select
                      id="msg-channel"
                      value={messageDraft.channel}
                      onChange={(e) =>
                        setMessageDraft((d) => ({
                          ...d,
                          channel: e.target.value as MessageChannel,
                        }))
                      }
                      disabled={isTerminal}
                    >
                      {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 8 }}>
                    <label htmlFor="msg-content">Odpowiedź</label>
                    <textarea
                      id="msg-content"
                      rows={3}
                      placeholder="Napisz odpowiedź do klienta…"
                      value={messageDraft.content}
                      onChange={(e) => setMessageDraft((d) => ({ ...d, content: e.target.value }))}
                      disabled={isTerminal}
                    />
                  </div>
                  <div className="flex items-center gap-8" style={{ flexWrap: 'wrap' }}>
                    <label
                      className="btn btn-secondary btn-sm"
                      style={{ cursor: isTerminal ? 'not-allowed' : 'pointer', marginBottom: 0 }}
                    >
                      {messageAttachments.length > 0
                        ? `Załączniki: ${messageAttachments.length}`
                        : 'Dodaj załączniki'}
                      <input
                        type="file"
                        multiple
                        style={{ display: 'none' }}
                        disabled={isTerminal}
                        onChange={(e) =>
                          setMessageAttachments((prev) => [
                            ...prev,
                            ...Array.from(e.target.files ?? []),
                          ])
                        }
                      />
                    </label>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => messageMutation.mutate()}
                      disabled={
                        !messageDraft.content.trim() || messageMutation.isPending || isTerminal
                      }
                    >
                      {messageMutation.isPending ? 'Wysyłanie…' : 'Wyślij'}
                    </button>
                  </div>
                  {messageAttachments.length > 0 && (
                    <div className="flex items-center gap-8 mt-8" style={{ flexWrap: 'wrap' }}>
                      {messageAttachments.map((file, idx) => (
                        <span key={`${file.name}-${idx}`} className="tag flex items-center gap-4">
                          {file.name}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '0 4px' }}
                            onClick={() =>
                              setMessageAttachments((prev) => prev.filter((_, i) => i !== idx))
                            }
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {isTerminal && (
                    <p className="hint mt-8">
                      Sprawa jest zamknięta — nie można już wysyłać wiadomości.
                    </p>
                  )}
                </div>
              </PermissionGate>

              {(messages ?? []).length === 0 ? (
                <div className="empty-state">
                  <h4>Brak wiadomości</h4>
                  <p>Korespondencja z klientem pojawi się tutaj.</p>
                </div>
              ) : (
                [...(messages ?? [])].reverse().map((m: CaseMessage) => (
                  <div
                    key={m.id}
                    style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}
                  >
                    <div className="flex items-center gap-8">
                      <span
                        className={`badge badge-${m.direction === 'Outbound' ? 'primary' : 'blue'}`}
                      >
                        {m.direction === 'Outbound' ? 'Wysłana' : 'Odebrana'}
                      </span>
                      <span className="tag">{CHANNEL_LABELS[m.channel] ?? m.channel}</span>
                      {m.subject && <strong style={{ fontSize: 13 }}>{m.subject}</strong>}
                    </div>
                    <div className="mt-4" style={{ fontSize: 13 }}>
                      {m.content}
                    </div>
                    {m.documents.length > 0 && (
                      <div className="flex items-center gap-8 mt-4" style={{ flexWrap: 'wrap' }}>
                        {m.documents.map((doc) => (
                          <button
                            key={doc.id}
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '2px 8px' }}
                            onClick={() => openDocument(doc.id)}
                          >
                            Załącznik: {doc.fileName}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="timeline-meta">{formatDateTime(m.sentAt)}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* --- Panel boczny --- */}
        <div>
          {c.nextAction && (
            <div className="next-action-panel" style={{ marginBottom: 16 }}>
              <div className="eyebrow">Next Action</div>
              <p>{c.nextAction}</p>
              {c.nextActionDueDate && (
                <div className="due">Termin: {formatDate(c.nextActionDueDate)}</div>
              )}
            </div>
          )}

          <div className="card card-pad">
            <div className="kv-list">
              <Kv
                label="Właściciel sprawy"
                value={owner ? `${owner.firstName} ${owner.lastName}` : '—'}
              />
              <div className="kv-row">
                <span className="kv-label">Priorytet</span>
                <span className="kv-value">
                  <span className={`badge badge-${PRIORITY_TONES[c.priority] ?? 'gray'}`}>
                    {c.priority}
                  </span>
                </span>
              </div>
              <Kv
                label="Wymaga akceptacji Kierownika"
                value={c.requiresManagerApproval ? 'Tak' : 'Nie'}
              />
              <Kv label="Utworzono" value={formatDateTime(c.createdAt)} />
              {c.closedAt && <Kv label="Zamknięto" value={formatDateTime(c.closedAt)} />}
            </div>
          </div>

          <PermissionGate permissions={['cases.portal.manage']}>
            <div className="card card-pad mt-16">
              <h3 style={{ fontSize: 13.5, marginBottom: 12 }}>Portal klienta</h3>
              <div className="portal-toggle-row">
                <span className="text-sm">Dostęp klienta do statusu online</span>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={c.clientPortalEnabled}
                    onChange={(e) => portalMutation.mutate(e.target.checked)}
                    disabled={portalMutation.isPending}
                  />
                  <span className="slider" />
                </label>
              </div>

              {c.clientPortalEnabled ? (
                <>
                  {/* `.access-code-display` z „Nowym kodem" po prawej — układ z prototypu. Kod widoczny
                      tylko tuż po wygenerowaniu: backend trzyma wyłącznie bcrypt hash. */}
                  <div className="access-code-display">
                    {portalCode ?? '••••••••'}
                    {portalCode && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '4px 8px' }}
                        title="Skopiuj kod dostępu"
                        onClick={async () => {
                          const ok = await copyToClipboard(portalCode);
                          showToast(
                            ok
                              ? 'Kod skopiowany do schowka.'
                              : 'Nie udało się skopiować — zaznacz i skopiuj ręcznie.',
                          );
                        }}
                      >
                        Kopiuj kod
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ marginLeft: 'auto', padding: '4px 8px' }}
                      title="Wygeneruj nowy kod dostępu"
                      onClick={() => {
                        if (
                          window.confirm(
                            'Wygenerować nowy kod dostępu? Poprzedni kod przestanie działać.',
                          )
                        ) {
                          portalMutation.mutate(true);
                        }
                      }}
                      disabled={portalMutation.isPending}
                    >
                      Nowy kod
                    </button>
                  </div>
                  <p className="text-sm text-muted mt-8">
                    {portalCode
                      ? 'Kod widoczny jest wyłącznie teraz — backend zapisuje go zahaszowany i nie odda go ponownie. Przekaż go klientowi lub wygeneruj nowy.'
                      : 'Kod został wygenerowany wcześniej i nie da się go odczytać ponownie. Jeśli klient go nie ma — wygeneruj nowy.'}
                  </p>
                  <p className="text-sm text-muted mt-4">
                    {c.clientLastLoginAt
                      ? `Ostatnie logowanie klienta: ${formatDateTime(c.clientLastLoginAt)}`
                      : 'Klient jeszcze się nie zalogował.'}
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm w-full mt-8"
                    style={{ justifyContent: 'center' }}
                    onClick={() => linkMutation.mutate()}
                    disabled={linkMutation.isPending}
                  >
                    Wygeneruj bezpieczny link (jednorazowy)
                  </button>
                  {secureLink && (
                    <div className="mt-8">
                      <div className="field">
                        <label htmlFor="secure-link-input">Link do wysłania klientowi</label>
                        <input
                          id="secure-link-input"
                          type="text"
                          readOnly
                          className="mono"
                          style={{ fontSize: 11 }}
                          value={secureLink}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={async () => {
                          const ok = await copyToClipboard(secureLink);
                          showToast(
                            ok
                              ? 'Link skopiowany do schowka.'
                              : 'Nie udało się skopiować — zaznacz i skopiuj ręcznie.',
                          );
                        }}
                      >
                        Kopiuj link
                      </button>
                      <p className="text-sm text-muted mt-4">
                        Link jednorazowy — przestaje działać po pierwszym użyciu.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted mt-8">
                  Włącz, aby wygenerować kod dostępu i umożliwić klientowi sprawdzenie statusu
                  online.
                </p>
              )}
            </div>
          </PermissionGate>

          {/* Producent/Dystrybutor + Partnerzy B2B (Faza 5/6) — wątek przekazania: wyłącznie
              status/decyzja/numer sprawy/nazwa organizacji drugiej strony (nigdy notatki,
              wiadomości ani pełne dane klienta drugiej strony, patrz `CaseHandoffService.getThread`).
              Sprawa "w środku" trasy wieloetapowej (np. Dystrybutor) pokazuje OBA kierunki naraz.
              "Aktualizacja od partnera" to baner odświeżany przy wejściu na sprawę, NIE pole na
              żywo. */}
          {/* Formularz rozgałęziony marki (np. Veres Meble) — realny partner (Partnership), który
              zgłosił sprawę WPROST przez publiczny formularz tej firmy. Odróżnij od kart handoffu
              niżej: to NIE przekazanie już istniejącej sprawy, tylko informacja "kto ją złożył". */}
          {c.reportedByPartnerCompanyName && (
            <div className="card card-pad mt-16">
              <h3 style={{ fontSize: 13.5, marginBottom: 12 }}>Zgłoszenie od</h3>
              <div className="kv-list">
                <Kv label="Partner" value={c.reportedByPartnerCompanyName} />
                {c.contactPreference && (
                  <Kv
                    label="Kontakt"
                    value={
                      c.contactPreference === 'Partner'
                        ? 'Przez partnera'
                        : 'Bezpośrednio z klientem'
                    }
                  />
                )}
              </div>
            </div>
          )}

          {handoffThread?.receivedFrom && (
            <HandoffSideCard title="Otrzymano od" side={handoffThread.receivedFrom} />
          )}
          {handoffThread?.sentTo && (
            <HandoffSideCard title="Przekazano do" side={handoffThread.sentTo} />
          )}
          {!handoffThread?.sentTo && (
            <PermissionGate permissions={['cases.handoff.send']}>
              {activePartnerships && activePartnerships.length > 0 && (
                <div className="card card-pad mt-16">
                  <h3 style={{ fontSize: 13.5, marginBottom: 12 }}>Partner B2B</h3>
                  <p className="text-sm text-muted mb-8">
                    Przekaż sprawę partnerowi (Producent/Dystrybutor) — utworzy nową, niezależną
                    sprawę w jego panelu, powiązaną z tą.
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm w-full"
                    style={{ justifyContent: 'center' }}
                    onClick={() => {
                      setHandoffPartnershipId(activePartnerships[0].id);
                      setHandoffBrandId(activePartnerships[0].brands[0]?.id ?? '');
                      setError(null);
                      setHandoffModal(true);
                    }}
                  >
                    Wyślij do partnera
                  </button>
                </div>
              )}
            </PermissionGate>
          )}
        </div>
      </div>

      {/* --- Modal: rodzaj zgłoszenia (gwarancja/rękojmia) --- */}
      <Modal
        open={complaintTypeModal}
        title="Zmień rodzaj zgłoszenia"
        onClose={() => setComplaintTypeModal(false)}
        error={error}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setComplaintTypeModal(false)}>
              Anuluj
            </button>
            <button
              className="btn btn-primary"
              onClick={() => complaintTypeMutation.mutate()}
              disabled={complaintTypeMutation.isPending}
            >
              {complaintTypeMutation.isPending ? 'Zapisywanie…' : 'Zapisz'}
            </button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="modal-complaint-type-select">Rodzaj zgłoszenia</label>
          <select
            id="modal-complaint-type-select"
            value={newComplaintType}
            onChange={(e) => setNewComplaintType(e.target.value)}
          >
            {Object.keys(COMPLAINT_TYPE_LABELS).map((t) => (
              <option key={t} value={t}>
                {COMPLAINT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <span className="hint">
            Formularz publiczny nie pyta klienta o ten wybór — ustaw go tutaj podczas weryfikacji
            zgłoszenia. Zmiana jest możliwa tylko do momentu przekazania sprawy dalej w procesie.
          </span>
        </div>
      </Modal>

      {/* --- Modal: zmiana statusu (Status Workflow Refactor §5/§6) --- */}
      <Modal
        open={statusModal}
        title="Zmień status reklamacji"
        onClose={() => setStatusModal(false)}
        error={error}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setStatusModal(false)}>
              Anuluj
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (!selectedStatusDef) return;
                if (selectedStatusDef.requiresConfirmation) {
                  if (!window.confirm(statusConfirmationMessage(selectedStatusDef))) return;
                } else if (isUnusualTransition && currentStatusDef) {
                  if (
                    !window.confirm(unusualTransitionMessage(currentStatusDef, selectedStatusDef))
                  )
                    return;
                }
                statusMutation.mutate();
              }}
              disabled={!newStatus || isSameStatusSelected || statusMutation.isPending}
            >
              {statusMutation.isPending ? 'Zapisywanie…' : 'Zapisz status'}
            </button>
          </>
        }
      >
        <p className="text-sm text-secondary">
          Obecny status: <strong>{currentStatusDef?.label ?? c.status}</strong>. Pracownik może
          wybrać dowolny aktywny status w dowolnym momencie — system tylko ostrzega przy nietypowych
          zmianach, nigdy nie blokuje.
        </p>
        <div className="field">
          <label htmlFor="modal-status-select">Nowy status</label>
          <select
            id="modal-status-select"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
          >
            <option value="" disabled>
              Wybierz nowy status…
            </option>
            {typicalNextStatuses.length > 0 && (
              <optgroup label="Typowy następny krok">
                {typicalNextStatuses.map((s) => (
                  <option key={s.id} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label={typicalNextStatuses.length > 0 ? 'Inne statusy' : 'Wszystkie statusy'}>
              {otherStatuses.map((s) => (
                <option key={s.id} value={s.code}>
                  {s.label}
                  {s.code === c.status ? ' (bieżący)' : ''}
                </option>
              ))}
            </optgroup>
          </select>
          {isSameStatusSelected && <span className="hint">Reklamacja już posiada ten status.</span>}
          {!isSameStatusSelected &&
            isUnusualTransition &&
            currentStatusDef &&
            selectedStatusDef && (
              <div
                className="text-sm"
                style={{
                  marginTop: 8,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--amber-soft)',
                  color: 'var(--amber)',
                  border: '1px solid var(--amber-soft)',
                }}
              >
                {unusualTransitionMessage(currentStatusDef, selectedStatusDef)}
              </div>
            )}
          {!isSameStatusSelected && selectedStatusDef?.requiresConfirmation && (
            <span className="hint">Ten status wymaga dodatkowego potwierdzenia przed zapisem.</span>
          )}
        </div>
        {newStatus && NEXT_ACTION_BY_STATUS[newStatus] && (
          <div className="field">
            <label>Next Action po zmianie</label>
            <textarea rows={2} readOnly value={NEXT_ACTION_BY_STATUS[newStatus] ?? ''} />
            <span className="hint">Ustawiane automatycznie przez serwer przy tym przejściu.</span>
          </div>
        )}
        {selectedStatusDef?.notifyCustomerTemplateCode && (
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={notifyCustomerOnStatusChange}
                onChange={(e) => setNotifyCustomerOnStatusChange(e.target.checked)}
              />
              Wyślij klientowi e-mail o tej zmianie
            </label>
            <span className="hint">
              {notifyCustomerOnStatusChange
                ? 'Klient dostanie automatyczny e-mail o zmianie statusu.'
                : 'Klient NIE zostanie powiadomiony e-mailem o tej zmianie.'}
            </span>
          </div>
        )}
      </Modal>

      {/* --- Modal: decyzja --- */}
      <Modal
        open={decisionModal}
        title="Ustaw decyzję"
        onClose={() => setDecisionModal(false)}
        error={error}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setDecisionModal(false)}>
              Anuluj
            </button>
            <button
              className="btn btn-primary"
              onClick={() => decisionMutation.mutate()}
              disabled={decisionMutation.isPending}
            >
              Zapisz decyzję
            </button>
          </>
        }
      >
        <p className="text-sm text-secondary">
          Decyzja jest odrębna od oczekiwanego rozwiązania zgłoszonego przez klienta. Status
          Workflow Refactor §8 — dane strukturalne poniżej (kontrahent, uzasadnienie, sposób
          realizacji, odpowiedź producenta) pozwalają Raportom i przyszłemu SmartRMA AI analizować
          DLACZEGO i JAK zrealizowano decyzję, nie tylko jej wynik.
        </p>
        <div className="field">
          <label htmlFor="modal-decision-select">Decyzja</label>
          <select
            id="modal-decision-select"
            value={decision}
            onChange={(e) => setDecision(e.target.value as Decision)}
          >
            {Object.entries(DECISION_LABELS)
              // `ZwrotSrodkow` zawsze wymaga `cases.decision.approve` (CasesService.setDecision)
              // — ukryte tutaj, żeby ten sam błąd nie był "widoczny, ale ślepy zaułek" dla ról
              // bez tego uprawnienia (CASE-010).
              .filter(
                ([value]) => value !== 'ZwrotSrodkow' || hasPermission('cases.decision.approve'),
              )
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </select>
          <span className="hint">Zwrot środków wymaga uprawnienia zatwierdzania.</span>
        </div>
        <div className="field">
          <label htmlFor="modal-decision-contractor">Producent / dystrybutor (opcjonalnie)</label>
          <select
            id="modal-decision-contractor"
            value={decisionContractorId}
            onChange={(e) => setDecisionContractorId(e.target.value)}
          >
            <option value="">— nie wybrano —</option>
            {lookups.contractors.map((contractor) => (
              <option key={contractor.id} value={contractor.id}>
                {contractor.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="modal-decision-justification">
            Uzasadnienie / odpowiedź producenta (opcjonalnie)
          </label>
          <textarea
            id="modal-decision-justification"
            rows={2}
            placeholder="np. Uszkodzenie mechaniczne spoza gwarancji."
            value={decisionJustification}
            onChange={(e) => setDecisionJustification(e.target.value)}
          />
        </div>
        {decision !== 'Odrzucenie' && (
          <div className="field">
            <label htmlFor="modal-decision-fulfillment">Sposób realizacji (opcjonalnie)</label>
            <select
              id="modal-decision-fulfillment"
              value={decisionFulfillmentMethod}
              onChange={(e) =>
                setDecisionFulfillmentMethod(e.target.value as DecisionFulfillmentMethod | '')
              }
            >
              <option value="">— nie wybrano —</option>
              {Object.entries(DECISION_FULFILLMENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="modal-decision-manufacturer-response">
            Pełna treść odpowiedzi producenta (opcjonalnie)
          </label>
          <textarea
            id="modal-decision-manufacturer-response"
            rows={2}
            value={decisionManufacturerResponse}
            onChange={(e) => setDecisionManufacturerResponse(e.target.value)}
          />
        </div>
      </Modal>

      {/* --- Modal: prośba o uzupełnienie --- */}
      <Modal
        open={infoModal}
        title="Poproś klienta o uzupełnienie danych"
        onClose={() => setInfoModal(false)}
        error={error}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setInfoModal(false)}>
              Anuluj
            </button>
            <button
              className="btn btn-primary"
              onClick={() => infoMutation.mutate()}
              disabled={!infoText.trim() || infoMutation.isPending}
            >
              Wyślij prośbę
            </button>
          </>
        }
      >
        <p className="text-sm text-secondary">
          Nie zakłada nowej reklamacji — wpis trafi do historii tej sprawy i będzie widoczny dla
          klienta w Portalu Klienta.
        </p>
        <div className="field">
          <label>Szybki wybór (kliknij, aby dodać do treści)</label>
          <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
            {INFO_REQUEST_CHIPS.map((chip) => (
              <button
                type="button"
                key={chip}
                className="tag"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  if (!infoItems.includes(chip)) setInfoItems((c2) => [...c2, chip]);
                  setInfoText((current) =>
                    current.trim() ? `${current.trim()}, ${chip}` : `Prosimy o przesłanie: ${chip}`,
                  );
                }}
              >
                + {chip}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="modal-info-request-text">Czego potrzebujesz od klienta?</label>
          <textarea
            id="modal-info-request-text"
            rows={3}
            placeholder="np. Prosimy o przesłanie numeru seryjnego produktu."
            value={infoText}
            onChange={(e) => setInfoText(e.target.value)}
          />
        </div>
      </Modal>

      {/* --- Modal: anulowanie --- */}
      <Modal
        open={cancelModal}
        title={`Anulować sprawę ${c.caseNumber}?`}
        onClose={() => setCancelModal(false)}
        error={error}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCancelModal(false)}>
              Wróć
            </button>
            <button
              className="btn btn-danger"
              onClick={() => cancelMutation.mutate()}
              disabled={!cancelReason.trim() || cancelMutation.isPending}
            >
              Anuluj sprawę
            </button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="cancel-reason">Powód anulowania</label>
          <textarea
            id="cancel-reason"
            rows={3}
            placeholder="Powód jest wymagany i trafia do historii sprawy."
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
        </div>
      </Modal>

      {/* --- Modal: TRWAŁE usunięcie (RBAC.md §5, wyłącznie Administrator) --- */}
      <Modal
        open={deleteModal}
        title={`Trwale usunąć sprawę ${c.caseNumber}?`}
        onClose={() => setDeleteModal(false)}
        error={error}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setDeleteModal(false)}>
              Wróć
            </button>
            <button
              className="btn btn-danger"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteConfirmText.trim() !== c.caseNumber || deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Usuwanie…' : 'Usuń trwale'}
            </button>
          </>
        }
      >
        <p className="field-error" role="alert" style={{ display: 'block', marginBottom: 14 }}>
          Tej operacji NIE da się cofnąć. Sprawa, wszystkie jej dokumenty, wiadomości, notatki i
          historia znikną bezpowrotnie.
        </p>
        <div className="field">
          <label htmlFor="delete-confirm">
            Wpisz numer sprawy <strong className="mono">{c.caseNumber}</strong>, aby potwierdzić
          </label>
          <input
            id="delete-confirm"
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder={c.caseNumber}
            autoComplete="off"
          />
        </div>
      </Modal>

      {/* --- Modal: właściciel --- */}
      <Modal
        open={ownerModal}
        title="Zmień właściciela sprawy"
        onClose={() => setOwnerModal(false)}
        error={error}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setOwnerModal(false)}>
              Anuluj
            </button>
            <button
              className="btn btn-primary"
              onClick={() => ownerMutation.mutate()}
              disabled={!newOwnerId || ownerMutation.isPending}
            >
              Zapisz
            </button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="owner-select">Nowy właściciel</label>
          <select
            id="owner-select"
            value={newOwnerId}
            onChange={(e) => setNewOwnerId(e.target.value)}
          >
            <option value="">— wybierz —</option>
            {lookups.users
              .filter((u) => u.active)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
          </select>
        </div>
      </Modal>

      {/* --- Modal: dane klienta --- */}
      <Modal
        open={customerModal}
        title="Edytuj dane klienta"
        onClose={() => setCustomerModal(false)}
        error={error}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCustomerModal(false)}>
              Anuluj
            </button>
            <button
              className="btn btn-primary"
              onClick={() => updateCustomerMutation.mutate(customerForm)}
              disabled={
                !customerForm.firstName?.trim() ||
                !customerForm.lastName?.trim() ||
                !customerForm.phone?.trim() ||
                updateCustomerMutation.isPending
              }
            >
              Zapisz
            </button>
          </>
        }
      >
        <div className="form-grid">
          <div className="field">
            <label htmlFor="customer-first-name">Imię</label>
            <input
              id="customer-first-name"
              type="text"
              value={customerForm.firstName ?? ''}
              onChange={(e) => setCustomerForm((f) => ({ ...f, firstName: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="customer-last-name">Nazwisko</label>
            <input
              id="customer-last-name"
              type="text"
              value={customerForm.lastName ?? ''}
              onChange={(e) => setCustomerForm((f) => ({ ...f, lastName: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="customer-phone">Telefon</label>
            <input
              id="customer-phone"
              type="text"
              value={customerForm.phone ?? ''}
              onChange={(e) => setCustomerForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="customer-email">E-mail</label>
            <input
              id="customer-email"
              type="email"
              value={customerForm.email ?? ''}
              onChange={(e) => setCustomerForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="field span-2">
            <label htmlFor="customer-address">Adres</label>
            <input
              id="customer-address"
              type="text"
              value={customerForm.address ?? ''}
              onChange={(e) => setCustomerForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="customer-city">Miasto</label>
            <input
              id="customer-city"
              type="text"
              value={customerForm.city ?? ''}
              onChange={(e) => setCustomerForm((f) => ({ ...f, city: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="customer-postal-code">Kod pocztowy</label>
            <input
              id="customer-postal-code"
              type="text"
              value={customerForm.postalCode ?? ''}
              onChange={(e) => setCustomerForm((f) => ({ ...f, postalCode: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      {/* --- Modal: dane pozycji (produkt) --- */}
      <Modal
        open={itemModal}
        title="Edytuj dane pozycji"
        onClose={() => setItemModal(false)}
        error={error}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setItemModal(false)}>
              Anuluj
            </button>
            <button
              className="btn btn-primary"
              onClick={() => updateItemMutation.mutate(itemForm)}
              disabled={!itemForm.productName?.trim() || updateItemMutation.isPending}
            >
              Zapisz
            </button>
          </>
        }
      >
        <div className="form-grid">
          <div className="field">
            <label htmlFor="item-manufacturer">Producent</label>
            <select
              id="item-manufacturer"
              value={itemForm.manufacturerId ?? ''}
              onChange={(e) =>
                setItemForm((f) => ({ ...f, manufacturerId: e.target.value || undefined }))
              }
            >
              <option value="">— brak —</option>
              {lookups.manufacturers
                .filter((m) => m.active)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {lookups.manufacturerName(m.id)}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="item-model">Model</label>
            <input
              id="item-model"
              type="text"
              value={itemForm.productName ?? ''}
              onChange={(e) => setItemForm((f) => ({ ...f, productName: e.target.value }))}
            />
            <span className="hint">
              Poprawienie nazwy dopisuje/dopasowuje pozycję w katalogu produktów — tak samo jak przy
              rejestracji nowej sprawy.
            </span>
          </div>
          <div className="field">
            <label htmlFor="item-serial">Numer seryjny</label>
            <input
              id="item-serial"
              type="text"
              value={itemForm.serialNumber ?? ''}
              onChange={(e) => setItemForm((f) => ({ ...f, serialNumber: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="item-frame">Numer ramy</label>
            <input
              id="item-frame"
              type="text"
              value={itemForm.frameNumber ?? ''}
              onChange={(e) => setItemForm((f) => ({ ...f, frameNumber: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="item-purchase-date">Data zakupu</label>
            <input
              id="item-purchase-date"
              type="date"
              value={itemForm.purchaseDate ?? ''}
              onChange={(e) => setItemForm((f) => ({ ...f, purchaseDate: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="item-proof">Dowód zakupu</label>
            <input
              id="item-proof"
              type="text"
              value={itemForm.purchaseProofNumber ?? ''}
              onChange={(e) => setItemForm((f) => ({ ...f, purchaseProofNumber: e.target.value }))}
            />
          </div>
          <div className="field span-2">
            <label htmlFor="item-description">Opis usterki</label>
            <textarea
              id="item-description"
              value={itemForm.description ?? ''}
              onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      {/* --- Modal: wyślij do partnera B2B (Faza 5 planu) --- */}
      <Modal
        open={handoffModal}
        title="Wyślij do partnera"
        onClose={() => setHandoffModal(false)}
        error={error}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setHandoffModal(false)}>
              Anuluj
            </button>
            <button
              className="btn btn-primary"
              onClick={() => handoffMutation.mutate()}
              disabled={!handoffPartnershipId || !handoffBrandId || handoffMutation.isPending}
            >
              {handoffMutation.isPending ? 'Wysyłanie…' : 'Wyślij'}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <div className="field">
            <label htmlFor="handoff-partnership">Partner</label>
            <select
              id="handoff-partnership"
              value={handoffPartnershipId}
              onChange={(e) => {
                const p = activePartnerships?.find((x) => x.id === e.target.value);
                setHandoffPartnershipId(e.target.value);
                setHandoffBrandId(p?.brands[0]?.id ?? '');
              }}
            >
              {activePartnerships?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.distributorCompanyName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="handoff-brand">Marka</label>
            <select
              id="handoff-brand"
              value={handoffBrandId}
              onChange={(e) => setHandoffBrandId(e.target.value)}
            >
              {activePartnerships
                ?.find((p) => p.id === handoffPartnershipId)
                ?.brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="field span-2">
            <span className="hint">
              Utworzy nową, niezależną sprawę w panelu partnera z danymi klienta i pozycji tej
              sprawy. Sprawy pozostają połączone wątkiem widocznym w bocznym panelu — status i
              decyzja partnera pojawią się tam po aktualizacji. Operacji nie da się cofnąć.
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Kv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="kv-row">
      <span className="kv-label">{label}</span>
      <span className={`kv-value ${mono ? 'mono' : ''}`}>{value}</span>
    </div>
  );
}

/** Producent/Dystrybutor + Partnerzy B2B (Faza 5/6) — jedna strona wątku przekazania (`receivedFrom` lub `sentTo`), reużywana bo sprawa "w środku" trasy wieloetapowej pokazuje obie naraz. */
function HandoffSideCard({ title, side }: { title: string; side: HandoffThreadSide }) {
  return (
    <div className="card card-pad mt-16">
      <h3 style={{ fontSize: 13.5, marginBottom: 12 }}>Partner B2B</h3>
      <div className="kv-list">
        <Kv label={title} value={side.companyName} />
        <Kv label="Numer u partnera" value={side.caseNumber} />
        <Kv label="Status u partnera" value={side.statusLabel} />
        <Kv
          label="Decyzja partnera"
          value={
            side.decision ? (DECISION_LABELS[side.decision] ?? side.decision) : '— nie podjęto —'
          }
        />
      </div>
      <p className="text-sm text-muted mt-8">Aktualizacja: {formatDateTime(side.updatedAt)}</p>
    </div>
  );
}
