import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isPortalApiError } from '@/api/portalClient';
import {
  type CaseCompletenessItem,
  type PortalCaseView,
  type PortalDocumentCategory,
  portalApi,
} from '@/api/portal.api';
import { clearPortalSession, getPortalSession } from '@/api/portal-token-storage';
import { useToast } from '@/hooks/useToast';
import { usePortalBrand } from '@/layouts/PortalLayout';
import {
  DOCUMENT_CATEGORY_LABELS,
  formatDateTime,
  historyIcon,
  HISTORY_ACTION_LABELS,
} from '@/lib/case-labels';

type Tab = 'status' | 'complete' | 'messages' | 'documents';

const TABS: { key: Tab; label: string }[] = [
  { key: 'status', label: 'Status' },
  { key: 'complete', label: 'Uzupełnij' },
  { key: 'messages', label: 'Wiadomości' },
  { key: 'documents', label: 'Dokumenty' },
];

/** Akceptowane typy pliku + czy pokazać przycisk aparatu (mobile-first, patrz zadanie "Portal Klienta"). */
const CATEGORY_ACCEPT: Record<
  PortalDocumentCategory,
  { accept: string; capture: boolean; label: string }
> = {
  Photo: { accept: 'image/*', capture: true, label: 'Dodaj zdjęcie' },
  Video: { accept: 'video/*', capture: true, label: 'Dodaj film' },
  PurchaseProof: { accept: 'image/*,application/pdf', capture: false, label: 'Dodaj dowód zakupu' },
  Other: { accept: 'image/*,video/*,application/pdf', capture: false, label: 'Dodaj plik' },
};

function extractError(err: unknown, fallback: string): string {
  if (isPortalApiError(err)) return err.response?.data.error.message ?? fallback;
  return fallback;
}

interface PendingFile {
  key: string;
  itemId: string;
  category: PortalDocumentCategory;
  file: File;
}

/** Status/Historia/Uzupełnienie/Wiadomości/Dokumenty — jedyny ekran uwierzytelnionego Portalu (BR-081, mobile-first). */
export function ClientPortalPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const setBrandName = usePortalBrand();
  const [tab, setTab] = useState<Tab>('status');

  useEffect(() => {
    if (!getPortalSession()) {
      navigate('/portal/login', { replace: true });
    }
  }, [navigate]);

  const caseQuery = useQuery({
    queryKey: ['portal', 'case'],
    queryFn: portalApi.getCase,
    retry: false,
  });

  // Problem 8e — nagłówek Portalu ma pokazywać firmę, z którą klient faktycznie
  // się kontaktuje, nie stałe "SmartRMA" (patrz doc-comment `PortalLayout`).
  useEffect(() => {
    setBrandName(caseQuery.data?.companyInfo.name ?? null);
    return () => setBrandName(null);
  }, [caseQuery.data?.companyInfo.name, setBrandName]);
  const completenessQuery = useQuery({
    queryKey: ['portal', 'completeness'],
    queryFn: portalApi.getCompleteness,
    retry: false,
  });
  const historyQuery = useQuery({
    queryKey: ['portal', 'history'],
    queryFn: portalApi.getHistory,
    retry: false,
  });
  const documentsQuery = useQuery({
    queryKey: ['portal', 'documents'],
    queryFn: portalApi.getDocuments,
    retry: false,
  });
  const messagesQuery = useQuery({
    queryKey: ['portal', 'messages'],
    queryFn: portalApi.getMessages,
    retry: false,
  });

  const missingCount = (completenessQuery.data?.requirements ?? []).filter(
    (r) => !r.satisfied,
  ).length;
  const unreadMessagesCount = caseQuery.data?.unreadMessagesCount ?? 0;

  function invalidateAll() {
    return queryClient.invalidateQueries({ queryKey: ['portal'] });
  }

  const markReadMutation = useMutation({
    mutationFn: portalApi.markMessagesRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portal', 'case'] }),
  });

  // Wejście na zakładkę Wiadomości = przeczytanie ich przez klienta — czerwony
  // znacznik na zakładce ma zniknąć bez ręcznego odświeżania.
  useEffect(() => {
    if (tab === 'messages' && unreadMessagesCount > 0) {
      markReadMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, unreadMessagesCount]);

  function handleLogout() {
    clearPortalSession();
    navigate('/portal/login', { replace: true });
  }

  if (caseQuery.isLoading) {
    return <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Wczytywanie…</p>;
  }
  if (caseQuery.isError || !caseQuery.data) {
    return (
      <div className="public-card">
        <p className="field-error" style={{ display: 'block' }}>
          {extractError(caseQuery.error, 'Nie udało się wczytać sprawy. Zaloguj się ponownie.')}
        </p>
        <button className="btn btn-primary" onClick={handleLogout}>
          Wróć do logowania
        </button>
      </div>
    );
  }

  const caseView = caseQuery.data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <HeaderCard caseView={caseView} onLogout={handleLogout} />

      <div className="public-tabs">
        {TABS.map((t) => (
          <div
            key={t.key}
            className={`public-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
            style={{ position: 'relative' }}
          >
            <span>{t.label}</span>
            {t.key === 'complete' && missingCount > 0 && (
              <span className="badge badge-amber">{missingCount}</span>
            )}
            {t.key === 'messages' && unreadMessagesCount > 0 && (
              <span
                title={`Nieprzeczytana wiadomość (${unreadMessagesCount})`}
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--red)',
                }}
              />
            )}
          </div>
        ))}
      </div>

      {tab === 'status' && (
        <StatusTab
          historyEntries={historyQuery.data ?? []}
          missingCount={missingCount}
          onGoToComplete={() => setTab('complete')}
        />
      )}

      {tab === 'complete' && (
        <CompleteTab
          requirements={completenessQuery.data?.requirements ?? []}
          consentGiven={caseView.consentGiven}
          gdprInfoText={caseView.gdprInfoText}
          gdprRequiredConsentText={caseView.gdprRequiredConsentText}
          gdprMarketingConsentText={caseView.gdprMarketingConsentText}
          gdprDocumentSharingConsentText={caseView.gdprDocumentSharingConsentText}
          companyInfo={caseView.companyInfo}
          onSaved={async () => {
            await invalidateAll();
            showToast('Zgłoszenie zaktualizowane.');
          }}
        />
      )}

      {tab === 'messages' && (
        <MessagesTab
          messages={messagesQuery.data ?? []}
          onRefresh={() => messagesQuery.refetch()}
          isRefreshing={messagesQuery.isFetching}
          onSent={async () => {
            await invalidateAll();
          }}
        />
      )}

      {tab === 'documents' && <DocumentsTab documents={documentsQuery.data ?? []} />}

      <div className="mobile-tab-bar">
        {TABS.map((t) => (
          <div
            key={t.key}
            className={`public-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
            style={{ position: 'relative' }}
          >
            <span>{t.label}</span>
            {t.key === 'complete' && missingCount > 0 && (
              <span className="badge badge-amber">{missingCount}</span>
            )}
            {t.key === 'messages' && unreadMessagesCount > 0 && (
              <span
                title={`Nieprzeczytana wiadomość (${unreadMessagesCount})`}
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--red)',
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function HeaderCard({ caseView, onLogout }: { caseView: PortalCaseView; onLogout: () => void }) {
  const isSpecial = caseView.stageIndex === 0;
  return (
    <div className="public-card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
        }}
      >
        <div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Numer reklamacji</p>
          <p style={{ fontSize: 18, fontWeight: 700, margin: '2px 0 0' }}>{caseView.caseNumber}</p>
        </div>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onLogout}>
          Wyloguj
        </button>
      </div>

      {isSpecial ? (
        <div
          className={`lockout-banner`}
          style={
            caseView.stage === 'Zarchiwizowana'
              ? {
                  background: 'var(--gray-soft)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }
              : undefined
          }
        >
          {caseView.stageLabel}
        </div>
      ) : (
        <>
          <div className="stage-stepper" style={{ marginTop: 18 }}>
            {Array.from({ length: caseView.stageCount }, (_, i) => i + 1).map((step) => (
              <div
                key={step}
                className={`stage-step ${step < caseView.stageIndex ? 'done' : ''} ${step === caseView.stageIndex ? 'current' : ''}`}
              >
                <span className="dot">{step}</span>
                <span className="line" />
                <span className="label">{STAGE_STEP_LABELS[step - 1] ?? ''}</span>
              </div>
            ))}
          </div>
          <p className="stage-current-desc">{caseView.stageLabel}</p>
        </>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginTop: 14,
          fontSize: 13,
          color: 'var(--text-secondary)',
        }}
      >
        <span>Data zgłoszenia: {formatDateTime(caseView.createdAt)}</span>
        {caseView.decisionLabel && <span>Decyzja: {caseView.decisionLabel}</span>}
      </div>

      {caseView.owner && (
        <div className="contact-person-card" style={{ marginTop: 14 }}>
          <div className="avatar">
            {caseView.owner.firstName[0]}
            {caseView.owner.lastName[0]}
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
              {caseView.owner.firstName} {caseView.owner.lastName}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Opiekun sprawy</p>
          </div>
        </div>
      )}
    </div>
  );
}

const STAGE_STEP_LABELS = ['Zgłoszona', 'Przyjęta', 'W trakcie', 'Decyzja', 'Zakończona'];

function StatusTab({
  historyEntries,
  missingCount,
  onGoToComplete,
}: {
  historyEntries: { action: string; newValue: string | null; createdAt: string }[];
  missingCount: number;
  onGoToComplete: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {missingCount > 0 && (
        <div className="public-card" style={{ borderColor: 'var(--amber)' }}>
          <p style={{ margin: '0 0 10px', fontWeight: 700 }}>Brakuje do zakończenia zgłoszenia</p>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
            Uzupełnij brakujące dane, aby przyspieszyć rozpatrzenie reklamacji.
          </p>
          <button
            className="btn btn-primary w-full"
            style={{ justifyContent: 'center' }}
            onClick={onGoToComplete}
          >
            Uzupełnij zgłoszenie ({missingCount})
          </button>
        </div>
      )}

      <div className="public-card">
        <p style={{ margin: '0 0 12px', fontWeight: 700 }}>Historia sprawy</p>
        {historyEntries.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Brak zdarzeń do wyświetlenia.</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {historyEntries.map((entry, index) => (
            <div key={index} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16 }}>{historyIcon(entry.action, entry.newValue)}</span>
              <div>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>
                  {HISTORY_ACTION_LABELS[entry.action] ?? entry.action}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  {formatDateTime(entry.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompleteTab({
  requirements,
  consentGiven,
  gdprInfoText,
  gdprRequiredConsentText,
  gdprMarketingConsentText,
  gdprDocumentSharingConsentText,
  companyInfo,
  onSaved,
}: {
  requirements: CaseCompletenessItem[];
  consentGiven: boolean;
  gdprInfoText: string;
  gdprRequiredConsentText: string;
  gdprMarketingConsentText: string;
  gdprDocumentSharingConsentText: string;
  companyInfo: {
    name: string;
    address: string | null;
    nip: string | null;
    email: string | null;
    phone: string | null;
    privacyPolicyUrl: string | null;
  };
  onSaved: () => Promise<void> | void;
}) {
  const [fieldEdits, setFieldEdits] = useState<Record<string, Record<string, string>>>({});
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [requiredConsent, setRequiredConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [documentSharingConsent, setDocumentSharingConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const fieldRequirements = requirements.filter((r) => r.kind === 'field');
  const documentRequirements = requirements.filter((r) => r.kind === 'document');

  function scrollToRow(code: string, itemId: string) {
    const key = `${itemId}:${code}`;
    rowRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function handleFieldChange(itemId: string, field: string, value: string) {
    setFieldEdits((prev) => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
  }

  function handleFilesPicked(
    itemId: string,
    category: PortalDocumentCategory,
    files: FileList | null,
  ) {
    if (!files || files.length === 0) return;
    const picked = Array.from(files);
    setPendingFiles((prev) => [
      ...prev,
      ...picked.map((file) => ({
        key: `${itemId}:${category}:${file.name}:${file.size}:${Date.now()}`,
        itemId,
        category,
        file,
      })),
    ]);
  }

  function removePendingFile(key: string) {
    setPendingFiles((prev) => prev.filter((f) => f.key !== key));
  }

  const hasAnything =
    Object.values(fieldEdits).some((edits) => Object.values(edits).some((v) => v.trim())) ||
    pendingFiles.length > 0;

  async function handleSubmit() {
    if (!requiredConsent && !consentGiven) {
      setError('Zaznacz zgodę na przetwarzanie danych osobowych, aby wysłać formularz.');
      return;
    }
    if (!hasAnything) {
      setError('Uzupełnij co najmniej jedno pole lub dodaj załącznik przed zapisaniem.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (!consentGiven || requiredConsent) {
        await portalApi.recordConsent({
          requiredConsent: true,
          marketingConsent,
          documentSharingConsent,
        });
      }
      for (const [itemId, edits] of Object.entries(fieldEdits)) {
        const payload = Object.fromEntries(
          Object.entries(edits).filter(([, v]) => v.trim().length > 0),
        );
        if (Object.keys(payload).length > 0) {
          await portalApi.updateItemFields(itemId, payload);
        }
      }
      for (const pending of pendingFiles) {
        await portalApi.uploadDocument(pending.file, pending.category, pending.itemId);
      }
      setFieldEdits({});
      setPendingFiles([]);
      setRequiredConsent(false);
      setMarketingConsent(false);
      setDocumentSharingConsent(false);
      await onSaved();
    } catch (err) {
      setError(extractError(err, 'Nie udało się zapisać zmian. Spróbuj ponownie.'));
    } finally {
      setSubmitting(false);
    }
  }

  const allSatisfied = requirements.length === 0 || requirements.every((r) => r.satisfied);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="public-card">
        <p style={{ margin: '0 0 12px', fontWeight: 700 }}>
          {allSatisfied ? 'Zgłoszenie jest kompletne' : 'Brakuje do zakończenia zgłoszenia'}
        </p>
        {allSatisfied && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Reklamacja jest już kompletna — nie potrzebujemy od Ciebie dodatkowych danych.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {requirements.map((r) => (
            <div
              key={`${r.itemId}:${r.code}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                fontSize: 13.5,
              }}
            >
              <span>
                {r.satisfied ? '✅' : '❌'} {r.label}
              </span>
              {!r.satisfied && (
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => scrollToRow(r.code, r.itemId)}
                >
                  Uzupełnij
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {fieldRequirements.length > 0 && (
        <div className="public-card">
          <p style={{ margin: '0 0 12px', fontWeight: 700 }}>Dane egzemplarza</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {fieldRequirements.map((r) => (
              <div
                key={`${r.itemId}:${r.code}`}
                ref={(el) => (rowRefs.current[`${r.itemId}:${r.code}`] = el)}
                className="field"
              >
                <label>{r.label}</label>
                <input
                  type="text"
                  value={fieldEdits[r.itemId]?.[r.field!] ?? ''}
                  onChange={(e) => handleFieldChange(r.itemId, r.field!, e.target.value)}
                  placeholder={r.satisfied ? 'Uzupełniono' : 'Wpisz wartość'}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {documentRequirements.length > 0 && (
        <div className="public-card">
          <p style={{ margin: '0 0 12px', fontWeight: 700 }}>Zdjęcia, film i dokumenty</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {documentRequirements.map((r) => {
              const category = (r.category ?? 'Other') as PortalDocumentCategory;
              const meta = CATEGORY_ACCEPT[category];
              const inputKey = `${r.itemId}:${r.code}`;
              const staged = pendingFiles.filter(
                (f) => f.itemId === r.itemId && f.category === category,
              );
              return (
                <div key={inputKey} ref={(el) => (rowRefs.current[inputKey] = el)}>
                  <p style={{ margin: '0 0 8px', fontSize: 13.5 }}>
                    {r.satisfied ? '✅' : '❌'} {r.label}
                  </p>
                  <input
                    ref={(el) => (fileInputRefs.current[inputKey] = el)}
                    type="file"
                    multiple
                    accept={meta.accept}
                    capture={meta.capture ? 'environment' : undefined}
                    hidden
                    onChange={(e) => {
                      handleFilesPicked(r.itemId, category, e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={() => fileInputRefs.current[inputKey]?.click()}
                  >
                    {meta.label}
                  </button>
                  {staged.length > 0 && (
                    <ul
                      style={{
                        margin: '8px 0 0',
                        paddingLeft: 0,
                        listStyle: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      {staged.map((f) => (
                        <li
                          key={f.key}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 12.5,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <span>{f.file.name}</span>
                          <button
                            className="btn btn-ghost"
                            style={{ padding: '0 6px' }}
                            onClick={() => removePendingFile(f.key)}
                          >
                            Usuń
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="public-card">
        <p style={{ margin: '0 0 10px', fontWeight: 700 }}>
          Informacja o przetwarzaniu danych osobowych
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {gdprInfoText}
        </p>

        <div
          style={{
            fontSize: 12.5,
            color: 'var(--text-secondary)',
            margin: '10px 0',
            lineHeight: 1.6,
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--text)' }}>{companyInfo.name}</p>
          {companyInfo.address && <p style={{ margin: 0 }}>{companyInfo.address}</p>}
          {companyInfo.nip && <p style={{ margin: 0 }}>NIP: {companyInfo.nip}</p>}
          {companyInfo.email && <p style={{ margin: 0 }}>{companyInfo.email}</p>}
          {companyInfo.phone && <p style={{ margin: 0 }}>{companyInfo.phone}</p>}
        </div>

        {companyInfo.privacyPolicyUrl && (
          <a
            href={companyInfo.privacyPolicyUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
            style={{ display: 'inline-flex', marginBottom: 14 }}
          >
            Polityka Prywatności
          </a>
        )}

        <div className="consent-row" style={{ marginTop: 6 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={consentGiven || requiredConsent}
              disabled={consentGiven}
              onChange={(e) => setRequiredConsent(e.target.checked)}
            />
            <span>{gdprRequiredConsentText}</span>
          </label>
          <label
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              fontSize: 13,
              marginTop: 10,
            }}
          >
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
            />
            <span>{gdprMarketingConsentText}</span>
          </label>
          <label
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              fontSize: 13,
              marginTop: 10,
            }}
          >
            <input
              type="checkbox"
              checked={documentSharingConsent}
              onChange={(e) => setDocumentSharingConsent(e.target.checked)}
            />
            <span>{gdprDocumentSharingConsentText}</span>
          </label>
        </div>
      </div>

      {error && (
        <p className="field-error" style={{ display: 'block' }}>
          {error}
        </p>
      )}
      <button
        className="btn btn-primary w-full"
        style={{ justifyContent: 'center', padding: 12 }}
        disabled={submitting}
        onClick={handleSubmit}
      >
        {submitting ? 'Zapisywanie…' : 'Zapisz i wyślij'}
      </button>
    </div>
  );
}

function MessagesTab({
  messages,
  onSent,
  onRefresh,
  isRefreshing,
}: {
  messages: {
    id: string;
    senderType: string;
    content: string;
    sentAt: string;
    documents: { id: string; fileName: string }[];
  }[];
  onSent: () => Promise<void> | void;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleSend() {
    if (!content.trim()) return;
    setSending(true);
    setError(null);
    try {
      const documentIds: string[] = [];
      for (const file of attachments) {
        const uploaded = await portalApi.uploadDocument(file, 'Other');
        documentIds.push(uploaded.id);
      }
      await portalApi.sendMessage(content.trim(), documentIds.length > 0 ? documentIds : undefined);
      setContent('');
      setAttachments([]);
      await onSent();
    } catch (err) {
      setError(extractError(err, 'Nie udało się wysłać wiadomości.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="public-card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: messages.length === 0 ? 0 : 10,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>Wiadomości</p>
          <button
            className="btn"
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              padding: '6px 12px',
              background: 'var(--amber-soft)',
              color: 'var(--amber)',
              border: '1px solid var(--amber-soft)',
              borderRadius: 8,
            }}
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Wiadomości nie odświeżają się automatycznie — sprawdź, czy sklep coś napisał."
          >
            {isRefreshing ? 'Odświeżanie…' : '⟳ Odśwież'}
          </button>
        </div>
        {messages.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Brak wiadomości. Napisz do nas, jeśli masz pytania dotyczące reklamacji.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.senderType === 'Customer' ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                background:
                  m.senderType === 'Customer' ? 'var(--primary-soft)' : 'var(--surface-sunken)',
                borderRadius: 10,
                padding: '8px 12px',
              }}
            >
              <p style={{ margin: 0, fontSize: 13.5 }}>{m.content}</p>
              {m.documents.map((doc) => (
                <p
                  key={doc.id}
                  style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}
                >
                  📎 {doc.fileName}
                </p>
              ))}
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                {formatDateTime(m.sentAt)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="public-card">
        {error && (
          <p className="field-error" style={{ display: 'block' }}>
            {error}
          </p>
        )}
        <textarea
          rows={3}
          placeholder="Napisz wiadomość do sklepu…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{ width: '100%', resize: 'vertical' }}
        />
        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {attachments.map((file, idx) => (
              <span
                key={`${file.name}-${idx}`}
                style={{
                  fontSize: 12,
                  background: 'var(--surface-sunken)',
                  borderRadius: 8,
                  padding: '4px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                📎 {file.name}
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                  style={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                  }}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 10,
            gap: 8,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) =>
              setAttachments((prev) => [...prev, ...Array.from(e.target.files ?? [])])
            }
          />
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12.5 }}
            onClick={() => fileInputRef.current?.click()}
          >
            {attachments.length > 0 ? `Załączniki: ${attachments.length}` : 'Dodaj załączniki'}
          </button>
          <button
            className="btn btn-primary"
            disabled={sending || !content.trim()}
            onClick={handleSend}
          >
            {sending ? 'Wysyłanie…' : 'Wyślij'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DocumentsTab({
  documents,
}: {
  documents: { id: string; fileName: string; category: string; uploadedAt: string }[];
}) {
  return (
    <div className="public-card">
      {documents.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Brak załączników w tej sprawie.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {documents.map((doc) => (
          <div
            key={doc.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div>
              <p style={{ margin: 0, fontSize: 13.5 }}>{doc.fileName}</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                {formatDateTime(doc.uploadedAt)}
              </p>
            </div>
            <span className="badge badge-gray">
              {DOCUMENT_CATEGORY_LABELS[doc.category] ?? doc.category}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
