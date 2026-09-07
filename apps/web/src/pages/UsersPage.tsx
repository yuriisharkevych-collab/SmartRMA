import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { casesApi } from '@/api/cases.api';
import { isApiError } from '@/api/client';
import { settingsApi } from '@/api/settings.api';
import {
  rolesApi,
  shopsApi,
  usersApi,
  type LoginEvent,
  type LoginMethod,
  type User,
} from '@/api/users.api';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { Modal } from '@/components/common/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { PlusIcon, SearchIcon, UsersIcon } from '@/components/common/icons';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { formatDateTime } from '@/lib/case-labels';
import { focusNextOnEnter } from '@/lib/focus-next';

/** Kolory odznak ról — 1:1 z `ROLE_BADGE_TONE` w prototypie (`js/users.js`). */
const ROLE_BADGE_TONE: Record<string, string> = {
  Pracownik: 'blue',
  Kierownik: 'primary',
  Administrator: 'amber',
  Serwis: 'green',
  Odczyt: 'gray',
};

type StatusFilter = 'all' | 'active' | 'inactive';

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'Wszyscy' },
  { key: 'active', label: 'Aktywni' },
  { key: 'inactive', label: 'Nieaktywni' },
];

function initials(user: { firstName: string; lastName: string }): string {
  return `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  loginMethod: LoginMethod;
  password: string;
  pin: string;
  shopId: string;
  roleIds: string[];
  active: boolean;
}

const EMPTY_FORM: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  loginMethod: 'Password',
  password: '',
  pin: '',
  shopId: '',
  roleIds: [],
  active: true,
};

/** Role, których nie można połączyć z logowaniem PIN-em (USER-006, RBAC.md §5) — PIN trafia wyłącznie do kont, które nie mogą wyrządzić poważnej szkody. */
const ROLES_INCOMPATIBLE_WITH_PIN = new Set(['Administrator', 'Kierownik']);

/**
 * Odpowiednik `users.html` + `js/users.js`.
 *
 * Trzy świadome różnice wobec prototypu, wymuszone przez realny model RBAC:
 *  - **Wiele ról na użytkownika.** Prototyp miał jeden `<select>` roli i sam
 *    oznaczał to jako uproszczenie („obsługa wielu ról na konto zostanie
 *    doprecyzowana przy implementacji"). `User.roles` to relacja
 *    wiele-do-wielu, więc rola jest tu listą kart wyboru — dokładnie ta
 *    funkcja, którą prototyp zapowiadał.
 *  - **Trwałe usuwanie konta jest wyjątkiem, nie regułą.** Domyślnym
 *    działaniem pozostaje dezaktywacja (`active=false`) — blokuje logowanie
 *    (AUTH-002) i zachowuje historię. `users.delete` (RBAC.md §5) istnieje
 *    obok niej wyłącznie do czyszczenia kont testowych: backend blokuje
 *    usunięcie (USER-004), gdy konto jest właścicielem/autorem czegokolwiek
 *    w systemie (sprawa, dokument, wpis historii/notatka/wiadomość,
 *    `AuditLog`), oraz samo-usunięcie (USER-005).
 *  - **Podgląd uprawnień przy rolach.** Prototyp pokazywał samą nazwę roli;
 *    tutaj rozwijana lista kodów uprawnień, żeby administrator widział, co
 *    faktycznie nadaje, bez zaglądania do RBAC.md.
 *
 * Ergonomia: Enter przechodzi do kolejnego pola (`focusNextOnEnter`),
 * autofocus na pierwszym polu modalu, filtry działają bez zatwierdzania.
 */
export function UsersPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { user: currentUser, hasPermission } = useAuth();
  const canDelete = hasPermission('users.delete');

  const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list });
  const { data: shops } = useQuery({ queryKey: ['shops'], queryFn: shopsApi.list, retry: false });
  const { data: cases } = useQuery({ queryKey: ['cases'], queryFn: casesApi.list, retry: false });
  // `retry:false` — brak `settings.view` (np. rola bez tego uprawnienia) po prostu chowa opcję PIN, nie wywraca strony.
  const { data: settingsOverview } = useQuery({
    queryKey: ['settings-overview'],
    queryFn: settingsApi.overview,
    retry: false,
  });
  const pinLoginEnabled = settingsOverview?.security.pinLoginEnabled ?? false;
  const pinLength = settingsOverview?.security.pinLength ?? 6;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [roleFilter, setRoleFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [tempPin, setTempPin] = useState<string | null>(null);

  const [historyTarget, setHistoryTarget] = useState<User | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { data: loginEvents } = useQuery({
    queryKey: ['login-events', historyTarget?.id],
    queryFn: () => usersApi.loginEvents(historyTarget!.id),
    enabled: Boolean(historyTarget),
  });

  const roleById = useMemo(() => new Map((roles ?? []).map((r) => [r.id, r])), [roles]);
  const roleByCode = useMemo(() => new Map((roles ?? []).map((r) => [r.code, r])), [roles]);
  const shopById = useMemo(() => new Map((shops ?? []).map((s) => [s.id, s])), [shops]);

  /** „Sprawy jako właściciel" — liczone z listy spraw, tak jak prototyp liczył z `SMARTRMA_DATA.cases`. */
  const caseCountByOwner = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cases ?? []) {
      if (c.ownerId) counts.set(c.ownerId, (counts.get(c.ownerId) ?? 0) + 1);
    }
    return counts;
  }, [cases]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (users ?? [])
      .filter((u) =>
        statusFilter === 'all' ? true : statusFilter === 'active' ? u.active : !u.active,
      )
      .filter((u) => (roleFilter ? u.roles.includes(roleFilter) : true))
      .filter((u) =>
        query ? `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(query) : true,
      )
      .sort((a, b) =>
        `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`, 'pl'),
      );
  }, [users, statusFilter, roleFilter, search]);

  function openCreate() {
    setEditing(null);
    const pracownik = roleByCode.get('Pracownik');
    setForm({ ...EMPTY_FORM, roleIds: pracownik ? [pracownik.id] : [] });
    setError(null);
    setModalOpen(true);
  }

  function openEdit(user: User) {
    setEditing(user);
    setForm({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      loginMethod: user.loginMethod,
      password: '',
      pin: '',
      shopId: user.shopId ?? '',
      roleIds: (roles ?? []).filter((r) => user.roles.includes(r.code)).map((r) => r.id),
      active: user.active,
    });
    setError(null);
    setModalOpen(true);
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        await usersApi.update(editing.id, {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          shopId: form.shopId || undefined,
        });

        // Role i status mają WŁASNE endpointy i uprawnienia (RBAC.md §2) —
        // wysyłamy je tylko przy realnej zmianie, żeby edycja danych kontaktowych
        // nie wymagała uprawnień administracyjnych.
        const currentRoleIds = (roles ?? [])
          .filter((r) => editing.roles.includes(r.code))
          .map((r) => r.id);
        const rolesChanged =
          currentRoleIds.length !== form.roleIds.length ||
          form.roleIds.some((id) => !currentRoleIds.includes(id));
        if (rolesChanged && hasPermission('users.roles.assign')) {
          await usersApi.assignRoles(editing.id, form.roleIds);
        }

        if (form.active !== editing.active && hasPermission('users.deactivate')) {
          if (form.active) {
            await usersApi.activate(editing.id);
          } else {
            const result = await usersApi.deactivate(editing.id);
            if (result.warnings.includes('USER-003')) {
              showToast(
                'Konto dezaktywowane. Uwaga: użytkownik prowadzi otwarte sprawy — rozważ przeniesienie ich na innego opiekuna.',
              );
            }
          }
        }
        return 'updated' as const;
      }

      await usersApi.create({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        loginMethod: form.loginMethod,
        password: form.loginMethod === 'Pin' ? undefined : form.password,
        pin: form.loginMethod === 'Pin' ? form.pin.trim() : undefined,
        shopId: form.shopId || undefined,
        roleIds: form.roleIds,
      });
      return 'created' as const;
    },
    onSuccess: (kind) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showToast(kind === 'created' ? 'Użytkownik dodany.' : 'Dane użytkownika zaktualizowane.');
      setModalOpen(false);
    },
    onError: (err) =>
      setError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się zapisać użytkownika.')
          : 'Nie udało się zapisać użytkownika.',
      ),
  });

  const resetMutation = useMutation({
    mutationFn: () => usersApi.resetPassword(resetTarget!.id),
    onSuccess: ({ temporaryPassword }) => {
      setTempPassword(temporaryPassword);
      showToast('Hasło tymczasowe wygenerowane.');
    },
    onError: (err) =>
      setError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się zresetować hasła.')
          : 'Nie udało się zresetować hasła.',
      ),
  });

  const resetPinMutation = useMutation({
    mutationFn: () => usersApi.resetPin(resetTarget!.id),
    onSuccess: ({ temporaryPin }) => {
      setTempPin(temporaryPin);
      showToast('PIN tymczasowy wygenerowany.');
    },
    onError: (err) =>
      setError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się zresetować PIN-u.')
          : 'Nie udało się zresetować PIN-u.',
      ),
  });

  /** `users.delete` (RBAC.md §5) — TRWAŁE, nieodwracalne usunięcie. Zablokowane przez backend (USER-004), gdy konto ma ślad realnej pracy w systemie, lub (USER-005) przy próbie usunięcia własnego konta. */
  const deleteMutation = useMutation({
    mutationFn: () => usersApi.delete(deleteTarget!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      showToast('Konto trwale usunięte.');
      setDeleteTarget(null);
    },
    onError: (err) => {
      setDeleteError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się usunąć konta.')
          : 'Nie udało się usunąć konta.',
      );
    },
  });

  function openDelete(user: User) {
    setDeleteTarget(user);
    setDeleteConfirmText('');
    setDeleteError(null);
  }

  function handleSave() {
    setError(null);
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setError('Uzupełnij imię, nazwisko i e-mail.');
      return;
    }
    if (form.roleIds.length === 0) {
      setError('Przypisz co najmniej jedną rolę (RBAC-004).');
      return;
    }
    if (!editing) {
      if (form.loginMethod === 'Pin') {
        if (!/^\d+$/.test(form.pin) || form.pin.length !== pinLength) {
          setError(`PIN musi mieć dokładnie ${pinLength} cyfr.`);
          return;
        }
      } else if (form.password.length < 8) {
        setError('Hasło początkowe musi mieć co najmniej 8 znaków (AUTH-004).');
        return;
      }
    }
    saveMutation.mutate();
  }

  const selectedPermissions = useMemo(() => {
    const codes = new Set<string>();
    for (const id of form.roleIds) {
      for (const code of roleById.get(id)?.permissionCodes ?? []) codes.add(code);
    }
    return Array.from(codes).sort();
  }, [form.roleIds, roleById]);

  const isSelf = editing?.id === currentUser?.userId;
  /** USER-006 (RBAC.md §5) — w edycji sposób logowania jest ustalony przy tworzeniu (patrz `openEdit`/`form.loginMethod` niezmieniane tutaj), więc ograniczenie ról liczymy z ISTNIEJĄCEGO konta; przy tworzeniu — z wyboru w formularzu. */
  const pinRestricted = editing ? editing.loginMethod === 'Pin' : form.loginMethod === 'Pin';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Użytkownicy</h1>
          <p className="page-subtitle">Zarządzanie kontami, rolami i oddziałami.</p>
        </div>
        <PermissionGate permissions={['users.create']}>
          <button className="btn btn-primary" onClick={openCreate}>
            <PlusIcon />
            Dodaj użytkownika
          </button>
        </PermissionGate>
      </div>

      <div className="card">
        <div className="table-toolbar">
          <div className="filter-tabs">
            {STATUS_FILTERS.map((f) => (
              <div
                key={f.key}
                className={`filter-tab ${statusFilter === f.key ? 'active' : ''}`}
                onClick={() => setStatusFilter(f.key)}
                role="button"
                tabIndex={0}
              >
                {f.label}
              </div>
            ))}
          </div>
          <div className="search-input">
            <SearchIcon width={15} height={15} />
            <input
              type="text"
              placeholder="Imię, nazwisko lub e-mail…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="table-toolbar" style={{ borderTop: 'none', paddingTop: 0 }}>
          <div className="toolbar-filters">
            <select
              className="toolbar-select"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Filtr: rola"
            >
              <option value="">Rola: wszystkie</option>
              {(roles ?? []).map((r) => (
                <option key={r.id} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
            {(search || roleFilter || statusFilter !== 'all') && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setSearch('');
                  setRoleFilter('');
                  setStatusFilter('all');
                }}
              >
                Wyczyść filtry
              </button>
            )}
          </div>
        </div>

        {isLoading && <LoadingIndicator />}

        {!isLoading && rows.length === 0 && (
          <div className="empty-state">
            <div className="icon-wrap">
              <UsersIcon />
            </div>
            <h4>Brak użytkowników</h4>
            <p>Zmień filtry albo dodaj nowe konto.</p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Imię i nazwisko</th>
                  <th>E-mail</th>
                  <th>Rola</th>
                  <th>Oddział</th>
                  <th>Status</th>
                  <th className="col-hide-mobile">Sprawy jako właściciel</th>
                  <th className="col-hide-mobile">Ostatnie logowanie</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} onClick={() => openEdit(u)}>
                    <td>
                      <div className="flex items-center gap-10">
                        <div className="avatar">{initials(u)}</div>
                        <span className="cell-primary">
                          {u.firstName} {u.lastName}
                          {u.id === currentUser?.userId && (
                            <span className="tag" style={{ marginLeft: 6 }}>
                              to Ty
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="cell-secondary">
                      {u.email}
                      {u.loginMethod === 'Pin' && (
                        <span
                          className="badge badge-gray"
                          style={{ marginLeft: 6 }}
                          title="Logowanie PIN-em"
                        >
                          PIN
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
                        {u.roles.length === 0 && <span className="cell-secondary">—</span>}
                        {u.roles.map((code) => (
                          <span
                            key={code}
                            className={`badge badge-${ROLE_BADGE_TONE[code] ?? 'gray'}`}
                          >
                            {roleByCode.get(code)?.name ?? code}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="cell-secondary">
                      {u.shopId ? (shopById.get(u.shopId)?.name ?? '—') : '—'}
                    </td>
                    <td>
                      {u.active ? (
                        <span className="badge badge-green">Aktywny</span>
                      ) : (
                        <span className="badge badge-gray">Nieaktywny</span>
                      )}
                    </td>
                    <td className="cell-secondary col-hide-mobile">
                      {caseCountByOwner.get(u.id) ?? 0}
                    </td>
                    <td className="cell-secondary col-hide-mobile">
                      {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Nigdy'}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-6">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setHistoryTarget(u)}
                        >
                          Historia
                        </button>
                        {canDelete && u.id !== currentUser?.userId && (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => openDelete(u)}
                            title="Trwałe, nieodwracalne usunięcie konta — wyłącznie do kont testowych"
                          >
                            Usuń
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- Modal: dodaj / edytuj --- */}
      <Modal
        open={modalOpen}
        title={editing ? 'Edytuj użytkownika' : 'Dodaj użytkownika'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            {editing && (
              <PermissionGate permissions={['users.resetPassword']}>
                <button
                  className="btn btn-secondary"
                  style={{ marginRight: 'auto' }}
                  onClick={() => {
                    setResetTarget(editing);
                    setTempPassword(null);
                    setTempPin(null);
                    setError(null);
                    setModalOpen(false);
                    setResetModalOpen(true);
                  }}
                >
                  {editing.loginMethod === 'Pin' ? 'Resetuj PIN' : 'Resetuj hasło'}
                </button>
              </PermissionGate>
            )}
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
              Anuluj
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Zapisywanie…' : 'Zapisz użytkownika'}
            </button>
          </>
        }
      >
        <form onKeyDown={focusNextOnEnter} onSubmit={(e) => e.preventDefault()}>
          {error && (
            <p className="field-error" style={{ display: 'block', marginBottom: 10 }}>
              {error}
            </p>
          )}

          <div className="form-grid">
            <div className="field">
              <label htmlFor="u-firstName">Imię</label>
              <input
                id="u-firstName"
                type="text"
                autoFocus
                value={form.firstName}
                onChange={(e) => set('firstName', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="u-lastName">Nazwisko</label>
              <input
                id="u-lastName"
                type="text"
                value={form.lastName}
                onChange={(e) => set('lastName', e.target.value)}
              />
            </div>
            <div className="field span-2">
              <label htmlFor="u-email">E-mail</label>
              <input
                id="u-email"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </div>
            {!editing && pinLoginEnabled && (
              <div className="field span-2">
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontWeight: 500 }}>Sposób logowania</span>
                  <span className="flex gap-8">
                    <label
                      className={`radio-card ${form.loginMethod === 'Password' ? 'selected' : ''}`}
                      style={{ flex: 1 }}
                    >
                      <input
                        type="radio"
                        name="u-login-method"
                        checked={form.loginMethod === 'Password'}
                        onChange={() => set('loginMethod', 'Password')}
                      />
                      <div className="radio-card-title">Hasło</div>
                    </label>
                    <label
                      className={`radio-card ${form.loginMethod === 'Pin' ? 'selected' : ''}`}
                      style={{ flex: 1 }}
                    >
                      <input
                        type="radio"
                        name="u-login-method"
                        checked={form.loginMethod === 'Pin'}
                        onChange={() =>
                          setForm((current) => ({
                            ...current,
                            loginMethod: 'Pin',
                            // Przełączenie na PIN od razu usuwa niekompatybilne role (USER-006) —
                            // zamiast zostawiać zaznaczony, ale wyszarzony/zablokowany checkbox.
                            roleIds: current.roleIds.filter(
                              (id) =>
                                !ROLES_INCOMPATIBLE_WITH_PIN.has(roleById.get(id)?.code ?? ''),
                            ),
                          }))
                        }
                      />
                      <div className="radio-card-title">PIN</div>
                    </label>
                  </span>
                </label>
                <span className="hint">
                  PIN — dla pracowników bez roli Administrator/Kierownik, przydatne, gdy wiele
                  stanowisk dzieli jeden e-mail firmowy (odróżnia wtedy konkretnego pracownika).
                </span>
              </div>
            )}
            {!editing && form.loginMethod === 'Password' && (
              <div className="field span-2">
                <label htmlFor="u-password">Hasło początkowe</label>
                <input
                  id="u-password"
                  type="text"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                />
                <span className="hint">
                  Min. 8 znaków (AUTH-004). Pracownik powinien je zmienić po pierwszym logowaniu.
                </span>
              </div>
            )}
            {!editing && form.loginMethod === 'Pin' && (
              <div className="field span-2">
                <label htmlFor="u-pin">PIN początkowy</label>
                <input
                  id="u-pin"
                  type="text"
                  inputMode="numeric"
                  maxLength={pinLength}
                  value={form.pin}
                  onChange={(e) => set('pin', e.target.value.replace(/\D/g, ''))}
                />
                <span className="hint">
                  Dokładnie {pinLength} cyfr. Pracownik może go później zmienić przez reset PIN-u.
                </span>
              </div>
            )}
            {editing && (
              <div className="field span-2">
                <span className="hint">
                  Sposób logowania:{' '}
                  <strong>{editing.loginMethod === 'Pin' ? 'PIN' : 'Hasło'}</strong> — ustalany przy
                  tworzeniu konta, nie do zmiany w edycji.
                </span>
              </div>
            )}
            <div className="field span-2">
              <label htmlFor="u-branch">Sklep / oddział</label>
              <select
                id="u-branch"
                value={form.shopId}
                onChange={(e) => set('shopId', e.target.value)}
              >
                <option value="">— brak przypisania —</option>
                {(shops ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.city ? ` — ${s.city}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="modal-section-label">Role</div>
          <div className="field">
            <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
              {(roles ?? []).map((r) => {
                const disabledByPin = pinRestricted && ROLES_INCOMPATIBLE_WITH_PIN.has(r.code);
                return (
                  <label
                    key={r.id}
                    className={`radio-card ${form.roleIds.includes(r.id) ? 'selected' : ''}`}
                    style={{ flex: '1 1 190px', opacity: disabledByPin ? 0.5 : 1 }}
                    title={
                      disabledByPin
                        ? 'Niedostępne dla kont logujących się PIN-em (USER-006).'
                        : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      disabled={disabledByPin}
                      checked={form.roleIds.includes(r.id)}
                      onChange={(e) =>
                        set(
                          'roleIds',
                          e.target.checked
                            ? [...form.roleIds, r.id]
                            : form.roleIds.filter((id) => id !== r.id),
                        )
                      }
                    />
                    <div>
                      <div className="radio-card-title">{r.name}</div>
                      <div className="radio-card-desc">
                        {r.description ?? `${r.permissionCodes.length} uprawnień`}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            <span className="hint">
              Jedna osoba może pełnić kilka ról naraz (np. właściciel jako Kierownik i
              Administrator) — uprawnienia się sumują.
              {pinRestricted &&
                ' Konto logujące się PIN-em nie może mieć roli Administrator ani Kierownik.'}
            </span>
          </div>

          {selectedPermissions.length > 0 && (
            <details>
              <summary
                style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--text-secondary)' }}
              >
                Uprawnienia wynikające z wybranych ról ({selectedPermissions.length})
              </summary>
              <div className="chip-list mt-8">
                {selectedPermissions.map((code) => (
                  <span className="chip" key={code}>
                    {code}
                  </span>
                ))}
              </div>
            </details>
          )}

          <div className="modal-section-label">Status konta</div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
              <input
                id="u-active"
                type="checkbox"
                style={{ width: 'auto' }}
                checked={form.active}
                disabled={!editing || isSelf}
                onChange={(e) => set('active', e.target.checked)}
              />
              Konto aktywne
            </label>
            <span className="hint">
              {isSelf
                ? 'Nie możesz dezaktywować własnego konta.'
                : 'Nieaktywne konto nie może się zalogować (AUTH-002). Kont nie usuwamy — użytkownik pozostaje właścicielem swoich spraw i wpisów w historii.'}
            </span>
          </div>
        </form>
      </Modal>

      {/* --- Modal: reset hasła / PIN-u --- */}
      <Modal
        open={resetModalOpen}
        title={resetTarget?.loginMethod === 'Pin' ? 'Resetuj PIN' : 'Resetuj hasło'}
        onClose={() => setResetModalOpen(false)}
        error={error}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setResetModalOpen(false)}>
              Zamknij
            </button>
            {resetTarget?.loginMethod === 'Pin'
              ? !tempPin && (
                  <button
                    className="btn btn-primary"
                    onClick={() => resetPinMutation.mutate()}
                    disabled={resetPinMutation.isPending}
                  >
                    {resetPinMutation.isPending ? 'Generowanie…' : 'Wygeneruj nowy PIN'}
                  </button>
                )
              : !tempPassword && (
                  <button
                    className="btn btn-primary"
                    onClick={() => resetMutation.mutate()}
                    disabled={resetMutation.isPending}
                  >
                    {resetMutation.isPending ? 'Generowanie…' : 'Wygeneruj nowe hasło'}
                  </button>
                )}
          </>
        }
      >
        {resetTarget?.loginMethod === 'Pin' ? (
          <>
            <p className="text-sm text-secondary">
              Wygeneruj nowy, tymczasowy PIN dla {resetTarget?.firstName} {resetTarget?.lastName}.
              Poprzedni PIN przestanie działać.
            </p>
            {tempPin && (
              <div>
                <div className="access-code-display">{tempPin}</div>
                <p className="text-sm text-muted mt-8">
                  Przekaż ten PIN pracownikowi bezpiecznym kanałem — nie jest nigdzie zapisany
                  jawnie poza tym oknem.
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-secondary">
              Wygeneruj nowe, tymczasowe hasło dla {resetTarget?.firstName} {resetTarget?.lastName}.
              Poprzednie hasło przestanie działać.
            </p>
            {tempPassword && (
              <div>
                <div className="access-code-display">{tempPassword}</div>
                <p className="text-sm text-muted mt-8">
                  Przekaż to hasło pracownikowi bezpiecznym kanałem — nie jest nigdzie zapisane
                  jawnie poza tym oknem.
                </p>
              </div>
            )}
          </>
        )}
      </Modal>

      {/* --- Modal: historia logowań --- */}
      <Modal
        open={Boolean(historyTarget)}
        title={`Historia — ${historyTarget?.firstName ?? ''} ${historyTarget?.lastName ?? ''}`}
        onClose={() => setHistoryTarget(null)}
        footer={
          <button className="btn btn-secondary" onClick={() => setHistoryTarget(null)}>
            Zamknij
          </button>
        }
      >
        <div className="modal-section-label">Historia logowań</div>
        {!loginEvents || loginEvents.length === 0 ? (
          <p className="text-sm text-muted">Brak zarejestrowanych logowań.</p>
        ) : (
          <div className="kv-list">
            {loginEvents.map((e: LoginEvent) => (
              <div className="kv-row" key={e.id}>
                <span className="kv-label">
                  {formatDateTime(e.createdAt)}{' '}
                  {!e.success && <span className="badge badge-red">nieudane</span>}
                </span>
                <span className="kv-value mono">{e.ipAddress ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
        <p className="hint">
          Rejestrowane są także próby nieudane — błędne hasło oraz logowanie na konto nieaktywne.
        </p>
      </Modal>

      {/* --- Modal: TRWAŁE usunięcie (RBAC.md §5, wyłącznie Administrator) --- */}
      <Modal
        open={deleteTarget !== null}
        title={`Trwale usunąć konto ${deleteTarget?.firstName ?? ''} ${deleteTarget?.lastName ?? ''}?`}
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
                deleteConfirmText.trim() !== deleteTarget?.email || deleteMutation.isPending
              }
            >
              {deleteMutation.isPending ? 'Usuwanie…' : 'Usuń trwale'}
            </button>
          </>
        }
      >
        <p className="field-error" role="alert" style={{ display: 'block', marginBottom: 14 }}>
          Tej operacji NIE da się cofnąć. Zablokowana automatycznie, jeśli konto jest
          właścicielem/autorem czegokolwiek w systemie (sprawa, dokument, wpis historii, notatka,
          wiadomość, wpis audytu) — w takim wypadku dezaktywuj konto zamiast usuwać.
        </p>
        <div className="field">
          <label htmlFor="u-delete-confirm">
            Wpisz adres e-mail <strong className="mono">{deleteTarget?.email}</strong>, aby
            potwierdzić
          </label>
          <input
            id="u-delete-confirm"
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder={deleteTarget?.email}
            autoComplete="off"
          />
        </div>
      </Modal>
    </div>
  );
}
