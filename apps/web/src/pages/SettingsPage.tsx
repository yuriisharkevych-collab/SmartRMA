import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { companiesApi, type UpdateCompanyPayload } from '@/api/companies.api';
import {
  type NotificationTemplate,
  notificationTemplatesApi,
  type UpsertTemplateBody,
} from '@/api/notification-templates.api';
import {
  type AiSettings,
  type EmailProvider,
  settingsApi,
  type UpdateEmailSettingsPayload,
  type UpdateNumberingPayload,
  type UpdateSecurityPayload,
} from '@/api/settings.api';
import { isApiError } from '@/api/client';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { copyToClipboard } from '@/lib/clipboard';
import { CaseStatusesTab } from './settings/CaseStatusesTab';

type TabKey =
  | 'company'
  | 'numbering'
  | 'statuses'
  | 'templates'
  | 'security'
  | 'reminders'
  | 'backup'
  | 'ai'
  | 'email'
  | 'stats';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'company', label: 'Dane firmy' },
  { key: 'numbering', label: 'Numeracja' },
  { key: 'statuses', label: 'Statusy reklamacji' },
  { key: 'templates', label: 'Szablony wiadomości' },
  { key: 'security', label: 'Bezpieczeństwo' },
  { key: 'reminders', label: 'Przypomnienia' },
  { key: 'backup', label: 'Backup' },
  { key: 'ai', label: 'SmartRMA AI' },
  { key: 'email', label: 'E-mail' },
  { key: 'stats', label: 'Statystyki systemu' },
];

/**
 * Ekran administracyjny, nie kopia prototypu — `settings.html` nie istnieje
 * (nowy moduł). Każda zakładka ma własny stan/zapis: administrator zmienia
 * numerację bez utraty niezapisanej edycji szablonu wiadomości w innej
 * zakładce (osobne mutacje zamiast jednego wspólnego formularza).
 */
export function SettingsPage() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<TabKey>('company');
  const canManage = hasPermission('settings.manage');

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Ustawienia</h1>
          <p className="page-subtitle">
            Skonfiguruj SmartRMA dla swojej firmy — bez pomocy programisty.
          </p>
        </div>
      </div>

      <div className="card report-controls" style={{ marginBottom: 16 }}>
        <div className="table-toolbar">
          <div className="filter-tabs">
            {TABS.map((t) => (
              <div
                key={t.key}
                className={`filter-tab ${tab === t.key ? 'active' : ''}`}
                onClick={() => setTab(t.key)}
                role="button"
                tabIndex={0}
              >
                {t.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {!canManage && (
        <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
          Masz dostęp tylko do odczytu (brak uprawnienia „settings.manage") — pola są zablokowane.
        </p>
      )}

      {tab === 'company' && <CompanyTab canManage={canManage} />}
      {tab === 'numbering' && <NumberingTab canManage={canManage} />}
      {tab === 'statuses' && <CaseStatusesTab canManage={hasPermission('caseStatuses.manage')} />}
      {tab === 'templates' && <TemplatesTab canManage={canManage} />}
      {tab === 'security' && <SecurityTab canManage={canManage} />}
      {tab === 'reminders' && <RemindersTab canManage={canManage} />}
      {tab === 'backup' && <BackupTab />}
      {tab === 'ai' && <AiTab canManage={canManage} />}
      {tab === 'email' && <EmailTab canManage={canManage} />}
      {tab === 'stats' && <StatsTab />}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Dane firmy                                                              */
/* ---------------------------------------------------------------------- */

function CompanyTab({ canManage }: { canManage: boolean }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['company-me'],
    queryFn: companiesApi.me,
  });
  const [form, setForm] = useState<UpdateCompanyPayload>({});
  const initialized = useRef(false);

  // Synchronizacja formularza z serwerem TYLKO przy pierwszym załadowaniu —
  // React Query może odświeżyć `data` w tle (np. powrót do karty przeglądarki),
  // a bezwarunkowy efekt na `[data]` kasowałby wtedy niezapisaną edycję admina.
  useEffect(() => {
    if (data && !initialized.current) {
      initialized.current = true;
      setForm({
        name: data.name,
        nip: data.nip ?? '',
        regon: data.regon ?? '',
        address: data.address ?? '',
        email: data.email ?? '',
        phone: data.phone ?? '',
        website: data.website ?? '',
        privacyPolicyUrl: data.privacyPolicyUrl ?? '',
        privacyPolicyVersion: data.privacyPolicyVersion ?? '',
        termsUrl: data.termsUrl ?? '',
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    // Pola opcjonalne wyczyszczone do "" (pole nigdy nie było wypełnione) muszą
    // zniknąć z payloadu, nie polecieć jako pusty string — `@IsOptional()` w
    // DTO pomija WYŁĄCZNIE `undefined`, a `@IsEmail`/`@IsUrl` odrzuca `""`.
    mutationFn: () => {
      const payload = Object.fromEntries(
        Object.entries(form).filter(([key, value]) => key === 'name' || value !== ''),
      ) as UpdateCompanyPayload;
      return companiesApi.update(payload);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['company-me'], updated);
      showToast('Dane firmy zapisane.');
    },
    onError: (err) => {
      const detail = isApiError(err) ? err.response?.data.error.message : undefined;
      showToast(
        detail
          ? `Nie udało się zapisać danych firmy: ${detail}`
          : 'Nie udało się zapisać danych firmy.',
      );
    },
  });

  const logoMutation = useMutation({
    mutationFn: (file: File) => companiesApi.uploadLogo(file),
    onSuccess: (updated) => {
      queryClient.setQueryData(['company-me'], updated);
      showToast('Logo zapisane.');
    },
    onError: () =>
      showToast('Nie udało się wgrać logo (dozwolone: PNG/JPG/WEBP/SVG/GIF, do 2 MB).'),
  });

  function set<K extends keyof UpdateCompanyPayload>(key: K, value: UpdateCompanyPayload[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  if (isLoading) return <LoadingIndicator />;
  if (isError || !data) return <EmptyState title="Nie udało się pobrać danych firmy" />;

  return (
    <div className="card card-pad">
      <div className="modal-section-label">Logo</div>
      <div className="flex items-center gap-16" style={{ marginBottom: 20 }}>
        <div
          style={{
            width: 96,
            height: 96,
            border: '1px dashed var(--border)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            background: 'var(--surface-alt, #f7f7f8)',
          }}
        >
          {data.logoUrl ? (
            <img
              src={companiesApi.logoAbsoluteUrl(data.logoUrl)}
              alt="Logo firmy"
              style={{ maxWidth: '100%', maxHeight: '100%' }}
            />
          ) : (
            <span className="text-xs text-muted">Brak logo</span>
          )}
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) logoMutation.mutate(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!canManage || logoMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {logoMutation.isPending ? 'Wgrywanie…' : data.logoUrl ? 'Zmień logo' : 'Wgraj logo'}
          </button>
          <p className="text-xs text-muted" style={{ marginTop: 6 }}>
            PNG, JPG, WEBP, SVG lub GIF, maks. 2 MB. Pojawi się na wydrukach potwierdzeń.
          </p>
        </div>
      </div>

      <div className="modal-section-label">Dane firmy</div>
      <div className="form-grid">
        <div className="field span-2">
          <label htmlFor="co-name">Nazwa firmy</label>
          <input
            id="co-name"
            type="text"
            disabled={!canManage}
            value={form.name ?? ''}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="co-nip">NIP</label>
          <input
            id="co-nip"
            type="text"
            placeholder="np. 123-456-32-18"
            disabled={!canManage}
            value={form.nip ?? ''}
            onChange={(e) => set('nip', e.target.value)}
          />
          {/* Sama walidacja (format + suma kontrolna) i normalizacja żyją WYŁĄCZNIE
              po stronie backendu (`IsPolishNip`, `UpdateCompanyDto`) — ten hint tylko
              podpowiada dozwolony zapis z góry; błąd (np. zła suma kontrolna) i tak
              trafia do użytkownika przez istniejący toast w `onError` niżej
              (`err.response?.data.error.message` — już czyta prawdziwą treść
              VALIDATION-006 z backendu), więc nie duplikujemy logiki walidacji w JS. */}
          <span className="hint">10 cyfr — myślniki i spacje są dozwolone.</span>
        </div>
        <div className="field">
          <label htmlFor="co-regon">REGON</label>
          <input
            id="co-regon"
            type="text"
            disabled={!canManage}
            value={form.regon ?? ''}
            onChange={(e) => set('regon', e.target.value)}
          />
        </div>
        <div className="field span-2">
          <label htmlFor="co-address">Adres</label>
          <input
            id="co-address"
            type="text"
            disabled={!canManage}
            value={form.address ?? ''}
            onChange={(e) => set('address', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="co-phone">Telefon</label>
          <input
            id="co-phone"
            type="text"
            disabled={!canManage}
            value={form.phone ?? ''}
            onChange={(e) => set('phone', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="co-email">E-mail</label>
          <input
            id="co-email"
            type="email"
            disabled={!canManage}
            value={form.email ?? ''}
            onChange={(e) => set('email', e.target.value)}
          />
        </div>
        <div className="field span-2">
          <label htmlFor="co-website">Strona internetowa</label>
          <input
            id="co-website"
            type="text"
            placeholder="https://…"
            disabled={!canManage}
            value={form.website ?? ''}
            onChange={(e) => set('website', e.target.value)}
          />
        </div>
        <div className="field span-2">
          <label htmlFor="co-privacy-url">Link do Polityki Prywatności (Portal Klienta)</label>
          <input
            id="co-privacy-url"
            type="text"
            placeholder="https://twoja-firma.pl/polityka-prywatnosci"
            disabled={!canManage}
            value={form.privacyPolicyUrl ?? ''}
            onChange={(e) => set('privacyPolicyUrl', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="co-privacy-version">Wersja Polityki Prywatności</label>
          <input
            id="co-privacy-version"
            type="text"
            placeholder="np. 2026-08-01"
            disabled={!canManage}
            value={form.privacyPolicyVersion ?? ''}
            onChange={(e) => set('privacyPolicyVersion', e.target.value)}
          />
        </div>
        <div className="field span-2">
          <label htmlFor="co-terms-url">
            Link do Regulaminu (Publiczny Formularz Reklamacyjny)
          </label>
          <input
            id="co-terms-url"
            type="text"
            placeholder="https://twoja-firma.pl/regulamin"
            disabled={!canManage}
            value={form.termsUrl ?? ''}
            onChange={(e) => set('termsUrl', e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-muted" style={{ marginTop: 4, marginBottom: 12 }}>
        Te dane pojawiają się na wydrukach potwierdzeń oraz w sekcji RODO Portalu Klienta i
        Publicznego Formularza Reklamacyjnego.
      </p>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={!canManage || saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? 'Zapisywanie…' : 'Zapisz dane firmy'}
      </button>

      <div className="modal-section-label" style={{ marginTop: 28 }}>
        Publiczny Formularz Reklamacyjny
      </div>
      <PublicFormLinkCard slug={data?.slug ?? null} />
    </div>
  );
}

/** Gotowy, kopiowalny link do wysłania klientowi zamiast ręcznego proszenia o zdjęcia/numer seryjny w mailach — patrz uzasadnienie modułu Intake. Adres ze slugiem TEJ organizacji (`/reklamacja/:slug`), nie ogólny redirect (`/reklamacja`). */
function PublicFormLinkCard({ slug }: { slug: string | null }) {
  const { showToast } = useToast();
  const formUrl = `${window.location.origin}/reklamacja/${slug ?? ''}`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
      <input
        type="text"
        readOnly
        value={formUrl}
        style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
      />
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={async () => {
          const ok = await copyToClipboard(formUrl);
          showToast(
            ok ? 'Link skopiowany.' : 'Nie udało się skopiować — zaznacz i skopiuj ręcznie.',
          );
        }}
      >
        Kopiuj link
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Numeracja reklamacji                                                    */
/* ---------------------------------------------------------------------- */

function NumberingTab({ canManage }: { canManage: boolean }) {
  const { showToast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['settings-overview'],
    queryFn: settingsApi.overview,
  });
  const [form, setForm] = useState<UpdateNumberingPayload>({});
  const initialized = useRef(false);

  useEffect(() => {
    if (data && !initialized.current) {
      initialized.current = true;
      setForm({
        caseNumberPrefix: data.numbering.caseNumberPrefix,
        caseNumberPadding: data.numbering.caseNumberPadding,
        caseNumberResetYearly: data.numbering.caseNumberResetYearly,
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => settingsApi.updateNumbering(form),
    onSuccess: () => {
      showToast('Numeracja zapisana — dotyczy WYŁĄCZNIE nowych spraw.');
      refetch();
    },
    onError: () => showToast('Nie udało się zapisać numeracji.'),
  });

  if (isLoading) return <LoadingIndicator />;
  if (isError || !data) return <EmptyState title="Nie udało się pobrać ustawień numeracji" />;

  const previewPrefix = form.caseNumberPrefix ?? data.numbering.caseNumberPrefix;
  const previewPadding = form.caseNumberPadding ?? data.numbering.caseNumberPadding;
  const previewResetYearly = form.caseNumberResetYearly ?? data.numbering.caseNumberResetYearly;
  // Ta sama sekwencja co backend liczy dla `exampleNextNumber` (stats.caseCount + 1) —
  // podgląd na żywo reaguje na zmiany formularza, ale MUSI pokazywać prawdziwą
  // kolejną liczbę, nie zawsze "1" (mylące przy istniejących sprawach).
  const previewSequence = String(data.stats.caseCount + 1).padStart(previewPadding, '0');
  const preview = previewResetYearly
    ? `${previewPrefix}/${new Date().getFullYear()}/${previewSequence}`
    : `${previewPrefix}/${previewSequence}`;

  return (
    <div className="card card-pad">
      <div className="form-grid">
        <div className="field">
          <label htmlFor="num-prefix">Prefiks numeru</label>
          <input
            id="num-prefix"
            type="text"
            maxLength={10}
            disabled={!canManage}
            value={form.caseNumberPrefix ?? ''}
            onChange={(e) =>
              setForm((p) => ({ ...p, caseNumberPrefix: e.target.value.toUpperCase() }))
            }
          />
        </div>
        <div className="field">
          <label htmlFor="num-padding">Liczba cyfr sekwencji</label>
          <input
            id="num-padding"
            type="number"
            min={1}
            max={10}
            disabled={!canManage}
            value={form.caseNumberPadding ?? 5}
            onChange={(e) => setForm((p) => ({ ...p, caseNumberPadding: Number(e.target.value) }))}
          />
        </div>
        <div className="field span-2">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              disabled={!canManage}
              checked={form.caseNumberResetYearly ?? true}
              onChange={(e) => setForm((p) => ({ ...p, caseNumberResetYearly: e.target.checked }))}
            />
            Resetuj numerację co rok (numer zawiera rok)
          </label>
        </div>
      </div>

      <div
        className="empty-state"
        style={{ padding: '16px 20px', marginTop: 4, marginBottom: 16, textAlign: 'left' }}
      >
        <p className="text-sm">
          Kolejna sprawa dostanie numer: <strong>{preview}</strong>
        </p>
        <p className="text-xs text-muted" style={{ marginTop: 4 }}>
          Zmiana wpływa wyłącznie na przyszłe reklamacje — istniejące numery nigdy nie są
          przeliczane.
        </p>
      </div>

      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={!canManage || saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? 'Zapisywanie…' : 'Zapisz numerację'}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Szablony wiadomości                                                     */
/* ---------------------------------------------------------------------- */

const TEMPLATE_LABELS: Record<string, string> = {
  'case.created.customer': 'Potwierdzenie przyjęcia',
  'case.info_requested.customer': 'Prośba o uzupełnienie danych',
  'case.sent_to_manufacturer.customer': 'Przekazanie do producenta',
  'case.closed.customer': 'Zakończenie reklamacji',
  'case.status_changed.customer': 'Zmiana statusu (ogólna)',
  'case.ready_for_pickup.customer': 'Gotowa do odbioru',
  'case.cancelled.customer': 'Anulowanie reklamacji',
  'case.owner_changed.employee': 'Przypisanie opiekuna (pracownik)',
  'case.portal_access.customer': 'Dostęp do Portalu Klienta (kod)',
  'case.message_added.customer': 'Nowa wiadomość od pracownika',
  'case.created.public.customer': 'Potwierdzenie zgłoszenia (formularz publiczny)',
};

const HIGHLIGHTED_TEMPLATE_CODES = [
  'case.created.customer',
  'case.info_requested.customer',
  'case.sent_to_manufacturer.customer',
  'case.closed.customer',
];

function TemplatesTab({ canManage }: { canManage: boolean }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['notification-templates'],
    queryFn: notificationTemplatesApi.list,
  });
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ subject: string; bodyTemplate: string }>({
    subject: '',
    bodyTemplate: '',
  });

  const saveMutation = useMutation({
    mutationFn: async (template: NotificationTemplate) => {
      // `code`/`channel` to tożsamość szablonu — PATCH nie zna tych pól
      // (`OmitType` w `UpdateTemplateDto`) i globalny `forbidNonWhitelisted`
      // odrzuca żądanie, jeśli i tak je wyślemy. Tylko POST (nowe nadpisanie) ich potrzebuje.
      if (template.companyId === user?.companyId) {
        return notificationTemplatesApi.update(template.id, {
          subject: draft.subject || undefined,
          bodyTemplate: draft.bodyTemplate,
          variables: template.variables,
        });
      }
      const body: UpsertTemplateBody = {
        code: template.code,
        channel: template.channel,
        subject: draft.subject || undefined,
        bodyTemplate: draft.bodyTemplate,
        variables: template.variables,
      };
      return notificationTemplatesApi.create(body);
    },
    onSuccess: () => {
      showToast('Szablon zapisany.');
      setEditingCode(null);
      queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
    },
    onError: () => showToast('Nie udało się zapisać szablonu.'),
  });

  if (isLoading) return <LoadingIndicator />;
  if (isError || !data) return <EmptyState title="Nie udało się pobrać szablonów wiadomości" />;

  // Firma widzi globalny + własne nadpisanie dla tego samego code/channel — pokazujemy nadpisanie, jeśli istnieje.
  const byCode = new Map<string, NotificationTemplate>();
  for (const t of data) {
    const existing = byCode.get(t.code);
    if (!existing || t.companyId === user?.companyId) byCode.set(t.code, t);
  }
  const ordered = [
    ...HIGHLIGHTED_TEMPLATE_CODES,
    ...[...byCode.keys()].filter((c) => !HIGHLIGHTED_TEMPLATE_CODES.includes(c)),
  ];

  return (
    <div className="card card-pad">
      <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
        Wiadomości wysyłane automatycznie do klienta na kolejnych etapach reklamacji. Docelowo
        SmartRMA AI będzie z nich korzystać przy generowaniu odpowiedzi.
      </p>
      {ordered.map((code) => {
        const template = byCode.get(code);
        if (!template) return null;
        const isEditing = editingCode === code;
        const isOverride = template.companyId === user?.companyId;

        return (
          <div
            key={code}
            className="card card-pad"
            style={{ marginBottom: 12, background: 'var(--surface-alt, #f9f9fa)' }}
          >
            {/* Audyt mobilny (Ustawienia → Szablony wiadomości) — `code` bywa
                jednym, długim, niełamliwym ciągiem bez spacji (np.
                "case.sent_to_manufacturer.customer"); jako flex-item bez
                `min-width:0` ten lewy `<div>` nie kurczył się poniżej
                szerokości tego ciągu, więc przy ~320px wypychał przycisk
                „Edytuj” poza kartę (i całą stronę w poziomy scroll).
                `minWidth:0` pozwala flexowi realnie skurczyć kolumnę,
                `overflowWrap:'anywhere'` pozwala samemu ciągowi złamać się
                w środku, gdy zabraknie miejsca — na desktopie, gdzie miejsca
                jest pod dostatkiem, oba nie mają żadnego efektu wizualnego. */}
            <div className="flex items-center justify-between">
              <div style={{ minWidth: 0 }}>
                <strong className="text-sm">{TEMPLATE_LABELS[code] ?? code}</strong>
                <div className="text-xs text-muted" style={{ overflowWrap: 'anywhere' }}>
                  {code} · {template.channel}
                  {isOverride ? ' · dostosowany' : ' · domyślny'}
                </div>
              </div>
              {canManage && !isEditing && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ flexShrink: 0 }}
                  onClick={() => {
                    setEditingCode(code);
                    setDraft({
                      subject: template.subject ?? '',
                      bodyTemplate: template.bodyTemplate,
                    });
                  }}
                >
                  Edytuj
                </button>
              )}
            </div>

            {isEditing ? (
              <div style={{ marginTop: 12 }}>
                {template.channel !== 'System' && (
                  <div className="field" style={{ marginBottom: 8 }}>
                    <label htmlFor={`tpl-subject-${code}`}>Temat</label>
                    <input
                      id={`tpl-subject-${code}`}
                      type="text"
                      value={draft.subject}
                      onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                    />
                  </div>
                )}
                <div className="field">
                  <label htmlFor={`tpl-body-${code}`}>Treść</label>
                  <textarea
                    id={`tpl-body-${code}`}
                    rows={4}
                    value={draft.bodyTemplate}
                    onChange={(e) => setDraft((d) => ({ ...d, bodyTemplate: e.target.value }))}
                  />
                </div>
                <p className="text-xs text-muted" style={{ margin: '6px 0' }}>
                  Dostępne placeholdery: {template.variables.map((v) => `{{${v}}}`).join(', ')}
                </p>
                <div className="flex gap-8">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={saveMutation.isPending}
                    onClick={() => saveMutation.mutate(template)}
                  >
                    {saveMutation.isPending ? 'Zapisywanie…' : 'Zapisz szablon'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditingCode(null)}
                  >
                    Anuluj
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
                {template.bodyTemplate}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Bezpieczeństwo                                                          */
/* ---------------------------------------------------------------------- */

const SESSION_PRESETS = [
  { minutes: 15, label: '15 minut' },
  { minutes: 60, label: '1 godzina' },
  { minutes: 480, label: '8 godzin' },
  { minutes: 1440, label: '24 godziny' },
  { minutes: 10080, label: '7 dni' },
  { minutes: 43200, label: '30 dni' },
];

function SecurityTab({ canManage }: { canManage: boolean }) {
  const { showToast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['settings-overview'],
    queryFn: settingsApi.overview,
  });
  const [form, setForm] = useState<UpdateSecurityPayload>({});
  const initialized = useRef(false);

  useEffect(() => {
    if (data && !initialized.current) {
      initialized.current = true;
      setForm({
        passwordMinLength: data.security.passwordMinLength,
        passwordRequireUppercase: data.security.passwordRequireUppercase,
        passwordRequireNumber: data.security.passwordRequireNumber,
        passwordRequireSymbol: data.security.passwordRequireSymbol,
        sessionTimeoutMinutes: data.security.sessionTimeoutMinutes,
        maxLoginAttempts: data.security.maxLoginAttempts,
        lockoutDurationMinutes: data.security.lockoutDurationMinutes,
        pinLoginEnabled: data.security.pinLoginEnabled,
        pinLength: data.security.pinLength,
        maxPinAttempts: data.security.maxPinAttempts,
        pinLockoutDurationMinutes: data.security.pinLockoutDurationMinutes,
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => settingsApi.updateSecurity(form),
    onSuccess: () => {
      showToast('Ustawienia bezpieczeństwa zapisane.');
      refetch();
    },
    onError: () => showToast('Nie udało się zapisać ustawień bezpieczeństwa.'),
  });

  if (isLoading) return <LoadingIndicator />;
  if (isError || !data) return <EmptyState title="Nie udało się pobrać ustawień bezpieczeństwa" />;

  return (
    <div className="card card-pad">
      <div className="modal-section-label">Polityka haseł</div>
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div className="field">
          <label htmlFor="sec-minlen">Minimalna długość hasła</label>
          <input
            id="sec-minlen"
            type="number"
            min={6}
            max={64}
            disabled={!canManage}
            value={form.passwordMinLength ?? 8}
            onChange={(e) => setForm((p) => ({ ...p, passwordMinLength: Number(e.target.value) }))}
          />
        </div>
        <div className="field span-2">
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 500 }}>Wymagania hasła</span>
            <span className="flex items-center gap-8">
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                disabled={!canManage}
                checked={form.passwordRequireUppercase ?? true}
                onChange={(e) =>
                  setForm((p) => ({ ...p, passwordRequireUppercase: e.target.checked }))
                }
              />
              Wielka litera
            </span>
            <span className="flex items-center gap-8">
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                disabled={!canManage}
                checked={form.passwordRequireNumber ?? true}
                onChange={(e) =>
                  setForm((p) => ({ ...p, passwordRequireNumber: e.target.checked }))
                }
              />
              Cyfra
            </span>
            <span className="flex items-center gap-8">
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                disabled={!canManage}
                checked={form.passwordRequireSymbol ?? false}
                onChange={(e) =>
                  setForm((p) => ({ ...p, passwordRequireSymbol: e.target.checked }))
                }
              />
              Znak specjalny
            </span>
          </label>
        </div>
      </div>

      <div className="modal-section-label">Sesja i blokada konta</div>
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div className="field">
          <label htmlFor="sec-session">Długość sesji</label>
          <select
            id="sec-session"
            disabled={!canManage}
            value={form.sessionTimeoutMinutes ?? 10080}
            onChange={(e) =>
              setForm((p) => ({ ...p, sessionTimeoutMinutes: Number(e.target.value) }))
            }
          >
            {SESSION_PRESETS.map((p) => (
              <option key={p.minutes} value={p.minutes}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sec-attempts">Maks. liczba prób logowania</label>
          <input
            id="sec-attempts"
            type="number"
            min={3}
            max={20}
            disabled={!canManage}
            value={form.maxLoginAttempts ?? 5}
            onChange={(e) => setForm((p) => ({ ...p, maxLoginAttempts: Number(e.target.value) }))}
          />
        </div>
        <div className="field">
          <label htmlFor="sec-lockout">Blokada konta na (minuty)</label>
          <input
            id="sec-lockout"
            type="number"
            min={1}
            max={1440}
            disabled={!canManage}
            value={form.lockoutDurationMinutes ?? 15}
            onChange={(e) =>
              setForm((p) => ({ ...p, lockoutDurationMinutes: Number(e.target.value) }))
            }
          />
        </div>
      </div>

      <div className="modal-section-label">Logowanie PIN-em</div>
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div className="field span-2">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              disabled={!canManage}
              checked={form.pinLoginEnabled ?? false}
              onChange={(e) => setForm((p) => ({ ...p, pinLoginEnabled: e.target.checked }))}
            />
            Zezwól na logowanie PIN-em zamiast hasła
          </label>
          <span className="hint">
            Dla pracowników bez roli Administrator/Kierownik — przydatne, gdy wiele stanowisk dzieli
            jeden e-mail firmowy. PIN odróżnia wtedy konkretnego pracownika.
          </span>
        </div>
        <div className="field">
          <label htmlFor="sec-pin-length">Liczba cyfr PIN-u</label>
          <input
            id="sec-pin-length"
            type="number"
            min={4}
            max={8}
            disabled={!canManage}
            value={form.pinLength ?? 6}
            onChange={(e) => setForm((p) => ({ ...p, pinLength: Number(e.target.value) }))}
          />
        </div>
        <div className="field">
          <label htmlFor="sec-pin-attempts">Maks. liczba prób PIN-u</label>
          <input
            id="sec-pin-attempts"
            type="number"
            min={3}
            max={20}
            disabled={!canManage}
            value={form.maxPinAttempts ?? 3}
            onChange={(e) => setForm((p) => ({ ...p, maxPinAttempts: Number(e.target.value) }))}
          />
        </div>
        <div className="field">
          <label htmlFor="sec-pin-lockout">Blokada logowania PIN-em na (minuty)</label>
          <input
            id="sec-pin-lockout"
            type="number"
            min={1}
            max={1440}
            disabled={!canManage}
            value={form.pinLockoutDurationMinutes ?? 30}
            onChange={(e) =>
              setForm((p) => ({ ...p, pinLockoutDurationMinutes: Number(e.target.value) }))
            }
          />
        </div>
      </div>

      <div className="modal-section-label">Uwierzytelnianie dwuskładnikowe (2FA)</div>
      <div
        className="empty-state"
        style={{ padding: '14px 18px', marginBottom: 16, textAlign: 'left' }}
      >
        <p className="text-sm">
          <span className="badge badge-gray" style={{ marginRight: 8 }}>
            Wkrótce
          </span>
          Miejsce zarezerwowane pod przyszłą funkcję 2FA — jeszcze niedostępna.
        </p>
      </div>

      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={!canManage || saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? 'Zapisywanie…' : 'Zapisz ustawienia bezpieczeństwa'}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Przypomnienia o reakcji                                                 */
/* ---------------------------------------------------------------------- */

/** Puste pole = brak progu (`null`), nie zero — wzorzec z sekcji SLA w `ManufacturersPage.tsx`. */
function dayFieldToPayload(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

function RemindersTab({ canManage }: { canManage: boolean }) {
  const { showToast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['settings-overview'],
    queryFn: settingsApi.overview,
  });
  const [statusStaleDays, setStatusStaleDays] = useState('');
  const [caseAgeStaleDays, setCaseAgeStaleDays] = useState('');
  const initialized = useRef(false);

  useEffect(() => {
    if (data && !initialized.current) {
      initialized.current = true;
      setStatusStaleDays(data.reminders.defaultStatusStaleDays?.toString() ?? '');
      setCaseAgeStaleDays(data.reminders.defaultCaseAgeStaleDays?.toString() ?? '');
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      settingsApi.updateReminders({
        defaultStatusStaleDays: dayFieldToPayload(statusStaleDays),
        defaultCaseAgeStaleDays: dayFieldToPayload(caseAgeStaleDays),
      }),
    onSuccess: () => {
      showToast('Ustawienia przypomnień zapisane.');
      refetch();
    },
    onError: () => showToast('Nie udało się zapisać ustawień przypomnień.'),
  });

  if (isLoading) return <LoadingIndicator />;
  if (isError || !data) return <EmptyState title="Nie udało się pobrać ustawień przypomnień" />;

  return (
    <div className="card card-pad">
      <div className="modal-section-label">Przypomnienia o reakcji</div>
      <p className="text-sm text-muted" style={{ marginTop: -8, marginBottom: 14 }}>
        Sprawy, które przekroczą poniższe progi, pojawiają się na kafelku „Sprawy wymagające
        reakcji" na Dashboardzie, a właściciel sprawy dostaje powiadomienie w systemie. To są
        wartości DOMYŚLNE dla całej firmy — dla konkretnego producenta można je nadpisać w
        Ustawienia → Producenci (sekcja SLA).
      </p>
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div className="field">
          <label htmlFor="rem-status-stale">Brak zmiany statusu przez (dni)</label>
          <input
            id="rem-status-stale"
            type="number"
            min={1}
            placeholder="Wyłączone"
            disabled={!canManage}
            value={statusStaleDays}
            onChange={(e) => setStatusStaleDays(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="rem-age-stale">Dni od zgłoszenia reklamacji</label>
          <input
            id="rem-age-stale"
            type="number"
            min={1}
            placeholder="Wyłączone"
            disabled={!canManage}
            value={caseAgeStaleDays}
            onChange={(e) => setCaseAgeStaleDays(e.target.value)}
          />
        </div>
      </div>
      <p className="text-sm text-muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Puste pole = przypomnienie wyłączone dla tej podstawy liczenia dni.
      </p>

      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={!canManage || saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? 'Zapisywanie…' : 'Zapisz ustawienia przypomnień'}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Backup                                                                   */
/* ---------------------------------------------------------------------- */

function BackupTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['settings-overview'],
    queryFn: settingsApi.overview,
  });
  if (isLoading) return <LoadingIndicator />;
  if (isError || !data) return <EmptyState title="Nie udało się pobrać informacji o backupie" />;

  const { backup } = data;
  return (
    <div className="card card-pad">
      <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
        Ten ekran WYŁĄCZNIE pokazuje stan backupu skonfigurowanego operacyjnie (poza aplikacją) —
        SmartRMA nie wykonuje jeszcze kopii zapasowych automatycznie.
      </p>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="text-xs text-muted">Status konfiguracji</div>
          <div className="text-sm" style={{ marginTop: 4, fontWeight: 600 }}>
            {backup.configured ? (
              <span className="badge badge-green">Skonfigurowane</span>
            ) : (
              <span className="badge badge-amber">Nieskonfigurowane</span>
            )}
          </div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-muted">Lokalizacja</div>
          <div className="text-sm" style={{ marginTop: 4 }}>
            {backup.location ?? '—'}
          </div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-muted">Ostatni backup</div>
          <div className="text-sm" style={{ marginTop: 4 }}>
            {backup.lastBackupAt ?? 'brak danych'}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* SmartRMA AI                                                             */
/* ---------------------------------------------------------------------- */

const AI_FEATURES: Array<{ key: keyof AiSettings; label: string; description: string }> = [
  {
    key: 'monitorCompleteness',
    label: 'Monitorowanie kompletności',
    description: 'AI monitoruje kompletność reklamacji.',
  },
  {
    key: 'trackDeadlines',
    label: 'Pilnowanie terminów',
    description: 'AI pilnuje terminów SLA i przypomina o zbliżających się.',
  },
  {
    key: 'draftCustomerReplies',
    label: 'Odpowiedzi dla klientów',
    description: 'AI przygotowuje wersje robocze odpowiedzi dla klientów.',
  },
  {
    key: 'draftManufacturerMessages',
    label: 'Wiadomości do producentów',
    description: 'AI przygotowuje wersje robocze wiadomości do producentów.',
  },
  {
    key: 'analyzeHistory',
    label: 'Analiza historii reklamacji',
    description: 'AI analizuje historię reklamacji pod kątem trendów.',
  },
  {
    key: 'generateDailyPlan',
    label: 'Codzienny plan pracy',
    description: 'AI generuje codzienny plan pracy dla pracownika.',
  },
  { key: 'analyzePhotos', label: 'Analiza zdjęć', description: 'AI analizuje zdjęcia uszkodzeń.' },
  {
    key: 'findSimilarCases',
    label: 'Podobne reklamacje',
    description: 'AI wyszukuje podobne, wcześniej obsłużone reklamacje.',
  },
];

function AiTab({ canManage }: { canManage: boolean }) {
  const { showToast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['settings-overview'],
    queryFn: settingsApi.overview,
  });
  const [form, setForm] = useState<Partial<AiSettings>>({});
  const initialized = useRef(false);

  useEffect(() => {
    if (data && !initialized.current) {
      initialized.current = true;
      setForm(data.ai);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => settingsApi.updateAi(form),
    onSuccess: () => {
      showToast('Preferencje SmartRMA AI zapisane.');
      refetch();
    },
    onError: () => showToast('Nie udało się zapisać preferencji AI.'),
  });

  if (isLoading) return <LoadingIndicator />;
  if (isError || !data) return <EmptyState title="Nie udało się pobrać ustawień AI" />;

  return (
    <div className="card card-pad">
      <div
        className="empty-state"
        style={{ padding: '14px 18px', marginBottom: 16, textAlign: 'left' }}
      >
        <p className="text-sm">
          <span className="badge badge-gray" style={{ marginRight: 8 }}>
            Planowane w SmartRMA AI
          </span>
          Żadna z poniższych funkcji nie działa jeszcze — to przygotowanie konfiguracji pod przyszły
          moduł. Zapisane preferencje zostaną wykorzystane, gdy funkcje zostaną wdrożone.
        </p>
      </div>

      {AI_FEATURES.map((feature) => (
        <div
          key={feature.key}
          className="flex items-center justify-between"
          style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}
        >
          <div>
            <div className="text-sm" style={{ fontWeight: 500 }}>
              {feature.label}
            </div>
            <div className="text-xs text-muted">{feature.description}</div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              disabled={!canManage}
              checked={form[feature.key] ?? false}
              onChange={(e) => setForm((p) => ({ ...p, [feature.key]: e.target.checked }))}
            />
            <span className="slider" />
          </label>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-primary btn-sm"
        style={{ marginTop: 16 }}
        disabled={!canManage || saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? 'Zapisywanie…' : 'Zapisz preferencje AI'}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* E-mail                                                                   */
/* ---------------------------------------------------------------------- */

const EMAIL_PROVIDER_PRESETS: Record<
  Exclude<EmailProvider, 'Resend'>,
  { host: string; port: number }
> = {
  Smtp: { host: '', port: 587 },
  Microsoft365: { host: 'smtp.office365.com', port: 587 },
  GoogleWorkspace: { host: 'smtp.gmail.com', port: 587 },
};

const EMAIL_PROVIDER_OPTIONS: { value: EmailProvider; label: string }[] = [
  { value: 'Smtp', label: 'SMTP (ogólny)' },
  { value: 'Resend', label: 'Resend API' },
  { value: 'Microsoft365', label: 'Microsoft 365' },
  { value: 'GoogleWorkspace', label: 'Google Workspace' },
];

/**
 * Sekrety (hasło SMTP / klucz API Resend) żyją w OSOBNYM, nie-inicjalizowanym
 * z danych stanie — backend nigdy nie zwraca ich wartości (tylko flagi
 * `hasSmtpPassword`/`hasResendApiKey`), więc nie ma czego seedować przez
 * `initialized`-ref jak resztę `form`. Puste pole przy zapisie = zostaw
 * zapisany sekret bez zmian (patrz `UpdateEmailSettingsPayload`).
 */
function EmailTab({ canManage }: { canManage: boolean }) {
  const { showToast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['settings-overview'],
    queryFn: settingsApi.overview,
  });
  const [form, setForm] = useState<UpdateEmailSettingsPayload>({});
  const [smtpPasswordInput, setSmtpPasswordInput] = useState('');
  const [resendApiKeyInput, setResendApiKeyInput] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const initialized = useRef(false);

  useEffect(() => {
    if (data && !initialized.current) {
      initialized.current = true;
      setForm({
        provider: data.email.provider,
        senderName: data.email.senderName ?? undefined,
        senderEmail: data.email.senderEmail ?? undefined,
        smtpHost: data.email.smtpHost ?? undefined,
        smtpPort: data.email.smtpPort ?? undefined,
        smtpUsername: data.email.smtpUsername ?? undefined,
        smtpEncryption: data.email.smtpEncryption,
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      settingsApi.updateEmail({
        ...form,
        smtpPassword: smtpPasswordInput || undefined,
        resendApiKey: resendApiKeyInput || undefined,
      }),
    onSuccess: () => {
      showToast('Ustawienia e-mail zapisane.');
      setSmtpPasswordInput('');
      setResendApiKeyInput('');
      refetch();
    },
    onError: () => showToast('Nie udało się zapisać ustawień e-mail.'),
  });

  const testMutation = useMutation({
    mutationFn: () => settingsApi.sendTestEmail(testEmail),
    onSuccess: () => showToast(`Wiadomość testowa wysłana na ${testEmail}.`),
    onError: (err) => {
      const detail = isApiError(err) ? err.response?.data.error.message : undefined;
      showToast(
        detail ? `Wysyłka nieudana: ${detail}` : 'Nie udało się wysłać wiadomości testowej.',
      );
    },
  });

  if (isLoading) return <LoadingIndicator />;
  if (isError || !data) return <EmptyState title="Nie udało się pobrać ustawień e-mail" />;

  const provider = form.provider ?? 'Smtp';
  const isResend = provider === 'Resend';

  function handleProviderChange(next: EmailProvider) {
    setForm((p) => {
      if (next === 'Resend') return { ...p, provider: next };
      const preset = EMAIL_PROVIDER_PRESETS[next];
      return {
        ...p,
        provider: next,
        smtpHost: p.smtpHost || preset.host || undefined,
        smtpPort: p.smtpPort ?? preset.port,
      };
    });
  }

  return (
    <div className="card card-pad">
      <div className="modal-section-label">Nadawca</div>
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div className="field">
          <label htmlFor="email-sender-name">Nazwa nadawcy</label>
          <input
            id="email-sender-name"
            type="text"
            disabled={!canManage}
            placeholder="np. SmartRMA — Dawidam"
            value={form.senderName ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, senderName: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="email-sender-email">Adres e-mail nadawcy</label>
          <input
            id="email-sender-email"
            type="email"
            disabled={!canManage}
            placeholder="reklamacje@twojafirma.pl"
            value={form.senderEmail ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, senderEmail: e.target.value }))}
          />
        </div>
      </div>

      <div className="modal-section-label">Dostawca</div>
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div className="field">
          <label htmlFor="email-provider">Sposób wysyłki</label>
          <select
            id="email-provider"
            disabled={!canManage}
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as EmailProvider)}
          >
            {EMAIL_PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isResend ? (
        <div className="form-grid" style={{ marginBottom: 16 }}>
          <div className="field">
            <label htmlFor="email-resend-key">Klucz API Resend</label>
            <input
              id="email-resend-key"
              type="password"
              disabled={!canManage}
              placeholder={data.email.hasResendApiKey ? '●●●●●●●● (zapisany)' : 're_...'}
              value={resendApiKeyInput}
              onChange={(e) => setResendApiKeyInput(e.target.value)}
            />
            <span className="hint">Zostaw puste, żeby zachować zapisany klucz.</span>
          </div>
        </div>
      ) : (
        <div className="form-grid" style={{ marginBottom: 16 }}>
          <div className="field">
            <label htmlFor="email-smtp-host">Serwer SMTP</label>
            <input
              id="email-smtp-host"
              type="text"
              disabled={!canManage}
              placeholder="smtp.twojserwer.pl"
              value={form.smtpHost ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, smtpHost: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="email-smtp-port">Port</label>
            <input
              id="email-smtp-port"
              type="number"
              disabled={!canManage}
              value={form.smtpPort ?? ''}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  smtpPort: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="email-smtp-username">Login</label>
            <input
              id="email-smtp-username"
              type="text"
              disabled={!canManage}
              value={form.smtpUsername ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, smtpUsername: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="email-smtp-password">Hasło</label>
            <input
              id="email-smtp-password"
              type="password"
              disabled={!canManage}
              placeholder={data.email.hasSmtpPassword ? '●●●●●●●● (zapisane)' : ''}
              value={smtpPasswordInput}
              onChange={(e) => setSmtpPasswordInput(e.target.value)}
            />
            <span className="hint">Zostaw puste, żeby zachować zapisane hasło.</span>
          </div>
          <div className="field">
            <label htmlFor="email-smtp-encryption">Szyfrowanie</label>
            <select
              id="email-smtp-encryption"
              disabled={!canManage}
              value={form.smtpEncryption ?? 'Tls'}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  smtpEncryption: e.target.value as UpdateEmailSettingsPayload['smtpEncryption'],
                }))
              }
            >
              <option value="Tls">TLS (STARTTLS)</option>
              <option value="Ssl">SSL</option>
              <option value="None">Brak</option>
            </select>
          </div>
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={!canManage || saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? 'Zapisywanie…' : 'Zapisz ustawienia e-mail'}
      </button>

      <div className="modal-section-label" style={{ marginTop: 28 }}>
        Wiadomość testowa
      </div>
      <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
        Wysyła testową wiadomość przy użyciu ZAPISANEJ konfiguracji — zapisz ustawienia powyżej
        przed testem.
      </p>
      {/* Audyt mobilny (Ustawienia → E-mail) — input (maxWidth:280) + przycisk
          w jednym, nie zawijanym rzędzie flex nie mieściły się razem poniżej
          ~420px ("Wyślij wiadomość testową" wychodziło poza kartę i ciągnęło
          całą stronę w poziomy scroll). `flexWrap: 'wrap'` pozwala
          przyciskowi zejść pod pole na wąskich ekranach — na desktopie oba
          mieszczą się w jednym rzędzie bez zmian. */}
      <div className="flex items-center gap-8" style={{ flexWrap: 'wrap' }}>
        <input
          type="email"
          placeholder="adres@example.com"
          disabled={!canManage}
          value={testEmail}
          onChange={(e) => setTestEmail(e.target.value)}
          style={{ maxWidth: 280, flex: '1 1 200px' }}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!canManage || !testEmail || testMutation.isPending}
          title={!testEmail ? 'Wpisz adres e-mail w polu obok, żeby wysłać test.' : undefined}
          onClick={() => testMutation.mutate()}
        >
          {testMutation.isPending ? 'Wysyłanie…' : 'Wyślij wiadomość testową'}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Statystyki systemu                                                       */
/* ---------------------------------------------------------------------- */

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function StatsTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['settings-overview'],
    queryFn: settingsApi.overview,
  });
  if (isLoading) return <LoadingIndicator />;
  if (isError || !data) return <EmptyState title="Nie udało się pobrać statystyk systemu" />;

  const { stats } = data;
  const tiles: Array<{ label: string; value: string }> = [
    { label: 'Użytkownicy', value: String(stats.userCount) },
    { label: 'Klienci', value: String(stats.customerCount) },
    { label: 'Reklamacje', value: String(stats.caseCount) },
    { label: 'Producenci', value: String(stats.manufacturerCount) },
    { label: 'Produkty', value: String(stats.productCount) },
    { label: 'Dokumenty', value: String(stats.documentCount) },
    { label: 'Zajęte miejsce na dysku', value: formatBytes(stats.storageUsedBytes) },
    { label: 'Wersja aplikacji', value: stats.appVersion },
    { label: 'Wersja bazy danych', value: stats.databaseVersion.split(' on ')[0] },
  ];

  return (
    <div className="card card-pad">
      <div className="kpi-grid">
        {tiles.map((tile) => (
          <div className="kpi-card" key={tile.label}>
            <div className="text-xs text-muted">{tile.label}</div>
            <div className="text-sm" style={{ marginTop: 4, fontWeight: 600 }}>
              {tile.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="empty-state">
      <h4>{title}</h4>
      <p>Spróbuj ponownie odświeżyć stronę.</p>
    </div>
  );
}
