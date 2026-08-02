import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  casesApi,
  type CaseMessage,
  type CaseSummary,
  type Decision,
  type MessageChannel,
} from '@/api/cases.api';
import { isApiError } from '@/api/client';
import { documentsApi } from '@/api/documents.api';
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
import { useToast } from '@/hooks/useToast';
import {
  CHANNEL_LABELS,
  DECISION_LABELS,
  DOCUMENT_CATEGORY_LABELS,
  HISTORY_ACTION_LABELS,
  NEXT_ACTION_BY_STATUS,
  PRIORITY_TONES,
  SOURCE_LABELS,
  documentIconKind,
  formatDateTime,
  formatFileSize,
  historyIcon,
} from '@/lib/case-labels';
import {
  CLOSED_STATUSES,
  COMPLAINT_TYPE_LABELS,
  STATUS_META,
  formatDate,
  statusLabel,
  statusTone,
} from '@/lib/case-filters';

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
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const lookups = useCaseLookups();

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
  const { data: messages } = useQuery({
    queryKey: ['case-messages', caseId],
    queryFn: () => casesApi.messages(caseId),
    enabled: hasPermission('messages.view'),
    retry: false,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['case', caseId] });
    queryClient.invalidateQueries({ queryKey: ['case-history', caseId] });
    queryClient.invalidateQueries({ queryKey: ['cases'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
  }

  function handleError(err: unknown, fallback: string) {
    setError(isApiError(err) ? (err.response?.data.error.message ?? fallback) : fallback);
  }

  // --- Modale ---
  const [statusModal, setStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [decisionModal, setDecisionModal] = useState(false);
  const [decision, setDecision] = useState<Decision>('Naprawa');
  const [infoModal, setInfoModal] = useState(false);
  const [infoItems, setInfoItems] = useState<string[]>([]);
  const [infoText, setInfoText] = useState('');
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [ownerModal, setOwnerModal] = useState(false);
  const [newOwnerId, setNewOwnerId] = useState('');
  const [messageModal, setMessageModal] = useState(false);
  const [messageDraft, setMessageDraft] = useState<{
    channel: MessageChannel;
    subject: string;
    content: string;
  }>({
    channel: 'Email',
    subject: '',
    content: '',
  });
  const [noteDraft, setNoteDraft] = useState('');
  const [portalCode, setPortalCode] = useState<string | null>(null);
  const [secureLink, setSecureLink] = useState<string | null>(null);

  const statusMutation = useMutation({
    mutationFn: () => casesApi.changeStatus(caseId, newStatus),
    onSuccess: (updated) => {
      setStatusModal(false);
      setError(null);
      showToast(`Status zmieniony na „${statusLabel(updated.status)}”.`);
      refresh();
    },
    onError: (err) => handleError(err, 'Nie udało się zmienić statusu.'),
  });

  const decisionMutation = useMutation({
    mutationFn: () => casesApi.setDecision(caseId, decision),
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
    mutationFn: () =>
      casesApi.sendMessage(caseId, {
        channel: messageDraft.channel,
        subject: messageDraft.subject.trim() || undefined,
        content: messageDraft.content.trim(),
      }),
    onSuccess: () => {
      setMessageModal(false);
      setMessageDraft({ channel: 'Email', subject: '', content: '' });
      setError(null);
      showToast('Wiadomość wysłana.');
      queryClient.invalidateQueries({ queryKey: ['case-messages', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case-history', caseId] });
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

  async function uploadDocuments(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const picked = Array.from(fileList);
    try {
      for (const file of picked) {
        const category = file.type.startsWith('image/')
          ? 'Photo'
          : file.type.startsWith('video/')
            ? 'Video'
            : 'Other';
        await documentsApi.upload(caseId, file, category);
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
  const isTerminal = CLOSED_STATUSES.includes(c.status);
  const canDecide =
    ['OczekiwanieNaDecyzjeProducenta', 'OczekiwanieNaDecyzjeKierownika'].includes(c.status) &&
    !c.decision;

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
            <span className={`badge badge-${statusTone(c.status)}`}>{statusLabel(c.status)}</span>
            <span className="tag">{COMPLAINT_TYPE_LABELS[c.complaintType] ?? c.complaintType}</span>
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
              onClick={() => setMessageModal(true)}
              disabled={isTerminal}
            >
              Wyślij wiadomość
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
              <button className="btn btn-secondary btn-sm" onClick={() => setDecisionModal(true)}>
                Ustaw decyzję
              </button>
            </PermissionGate>
          )}
          <PermissionGate permissions={['cases.status.change']}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setNewStatus(c.status);
                setStatusModal(true);
              }}
              disabled={isTerminal}
            >
              Zmień status
            </button>
          </PermissionGate>
          {c.status === 'Zamknieta' && (
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
                <h3 style={{ marginBottom: 12 }}>Klient</h3>
                <div className="kv-list">
                  <Kv
                    label="Imię i nazwisko"
                    value={customer ? `${customer.firstName} ${customer.lastName}` : '—'}
                  />
                  <Kv label="Telefon" value={customer?.phone ?? '—'} />
                  <Kv label="E-mail" value={customer?.email ?? '—'} />
                  <Kv label="Adres" value={customer?.address ?? '—'} />
                </div>
              </div>

              <div className="card card-pad" style={{ marginBottom: 16 }}>
                <h3 style={{ marginBottom: 12 }}>Produkt</h3>
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
                <label className="file-drop" style={{ marginBottom: 14 }}>
                  <UploadIcon />
                  <span>Dodaj dokument, zdjęcie lub film</span>
                  <input
                    type="file"
                    multiple
                    hidden
                    accept="image/*,application/pdf,video/mp4"
                    onChange={(e) => {
                      uploadDocuments(e.target.files);
                      e.target.value = '';
                    }}
                  />
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
                    const author = h.userId ? lookups.userById.get(h.userId) : undefined;
                    const from = h.previousValue
                      ? (STATUS_META[h.previousValue]?.label ?? h.previousValue)
                      : null;
                    const to = h.newValue ? (STATUS_META[h.newValue]?.label ?? h.newValue) : null;
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
                            {author ? `${author.firstName} ${author.lastName}` : 'System'} ·{' '}
                            {formatDateTime(h.createdAt)}
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
                        onClick={() =>
                          navigator.clipboard?.writeText(secureLink).then(
                            () => showToast('Link skopiowany do schowka.'),
                            () => showToast('Nie udało się skopiować — zaznacz i skopiuj ręcznie.'),
                          )
                        }
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
        </div>
      </div>

      {/* --- Modal: zmiana statusu --- */}
      <Modal
        open={statusModal}
        title="Zmień status sprawy"
        onClose={() => setStatusModal(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setStatusModal(false)}>
              Anuluj
            </button>
            <button
              className="btn btn-primary"
              onClick={() => statusMutation.mutate()}
              disabled={statusMutation.isPending}
            >
              {statusMutation.isPending ? 'Zapisywanie…' : 'Zapisz status'}
            </button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="modal-status-select">Nowy status</label>
          <select
            id="modal-status-select"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
          >
            {Object.keys(STATUS_META).map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
          <span className="hint">
            Dozwolone przejścia egzekwuje serwer (STATE_MACHINE.md) — nielegalna zmiana zwróci błąd
            CASE-001.
          </span>
        </div>
        {NEXT_ACTION_BY_STATUS[newStatus] && (
          <div className="field">
            <label>Next Action po zmianie</label>
            <textarea rows={2} readOnly value={NEXT_ACTION_BY_STATUS[newStatus] ?? ''} />
            <span className="hint">Ustawiane automatycznie przez serwer przy tym przejściu.</span>
          </div>
        )}
      </Modal>

      {/* --- Modal: decyzja --- */}
      <Modal
        open={decisionModal}
        title="Ustaw decyzję"
        onClose={() => setDecisionModal(false)}
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
          Decyzja jest odrębna od oczekiwanego rozwiązania zgłoszonego przez klienta.
        </p>
        <div className="field">
          <label htmlFor="modal-decision-select">Decyzja</label>
          <select
            id="modal-decision-select"
            value={decision}
            onChange={(e) => setDecision(e.target.value as Decision)}
          >
            {Object.entries(DECISION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <span className="hint">
            Zwrot środków oraz decyzje w rękojmi wymagają uprawnienia zatwierdzania (CASE-010).
          </span>
        </div>
      </Modal>

      {/* --- Modal: prośba o uzupełnienie --- */}
      <Modal
        open={infoModal}
        title="Poproś klienta o uzupełnienie danych"
        onClose={() => setInfoModal(false)}
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
            placeholder="Powód jest wymagany (CASE-011) i trafia do historii sprawy."
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
        </div>
      </Modal>

      {/* --- Modal: właściciel --- */}
      <Modal
        open={ownerModal}
        title="Zmień właściciela sprawy"
        onClose={() => setOwnerModal(false)}
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

      {/* --- Modal: wiadomość --- */}
      <Modal
        open={messageModal}
        title="Wyślij wiadomość do klienta"
        onClose={() => setMessageModal(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setMessageModal(false)}>
              Anuluj
            </button>
            <button
              className="btn btn-primary"
              onClick={() => messageMutation.mutate()}
              disabled={!messageDraft.content.trim() || messageMutation.isPending}
            >
              Wyślij
            </button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="msg-channel">Kanał</label>
          <select
            id="msg-channel"
            value={messageDraft.channel}
            onChange={(e) =>
              setMessageDraft((d) => ({ ...d, channel: e.target.value as MessageChannel }))
            }
          >
            {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="msg-subject">Temat (opcjonalnie)</label>
          <input
            id="msg-subject"
            type="text"
            value={messageDraft.subject}
            onChange={(e) => setMessageDraft((d) => ({ ...d, subject: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="msg-content">Treść</label>
          <textarea
            id="msg-content"
            rows={4}
            value={messageDraft.content}
            onChange={(e) => setMessageDraft((d) => ({ ...d, content: e.target.value }))}
          />
        </div>
        <p className="hint">
          Wiadomość zapisuje się w historii korespondencji. Faktyczna wysyłka e-mail/SMS należy do
          modułu powiadomień.
        </p>
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
