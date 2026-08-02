import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { casesApi } from '@/api/cases.api';
import { isApiError } from '@/api/client';
import { rolesApi, shopsApi, usersApi, type LoginEvent, type User } from '@/api/users.api';
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
  password: string;
  shopId: string;
  roleIds: string[];
  active: boolean;
}

const EMPTY_FORM: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  shopId: '',
  roleIds: [],
  active: true,
};

/**
 * Odpowiednik `users.html` + `js/users.js`.
 *
 * Trzy świadome różnice wobec prototypu, wymuszone przez realny model RBAC:
 *  - **Wiele ról na użytkownika.** Prototyp miał jeden `<select>` roli i sam
 *    oznaczał to jako uproszczenie („obsługa wielu ról na konto zostanie
 *    doprecyzowana przy implementacji"). `User.roles` to relacja
 *    wiele-do-wielu, więc rola jest tu listą kart wyboru — dokładnie ta
 *    funkcja, którą prototyp zapowiadał.
 *  - **Brak trwałego usuwania konta.** Prototyp miał „Usuń użytkownika"
 *    (`splice` z tablicy w pamięci). W realnym modelu `User` jest
 *    właścicielem spraw oraz autorem wpisów `CaseHistory`, notatek i
 *    `AuditLog` — skasowanie wiersza zerwałoby klucze obce i wyczyściło ślad
 *    audytowy (BR-088/090). Odpowiednikiem jest dezaktywacja
 *    (`active=false`), która blokuje logowanie (AUTH-002) i zachowuje historię.
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

  const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list });
  const { data: shops } = useQuery({ queryKey: ['shops'], queryFn: shopsApi.list, retry: false });
  const { data: cases } = useQuery({ queryKey: ['cases'], queryFn: casesApi.list, retry: false });

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

  const [historyTarget, setHistoryTarget] = useState<User | null>(null);
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
      password: '',
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
        password: form.password,
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
    if (!editing && form.password.length < 8) {
      setError('Hasło początkowe musi mieć co najmniej 8 znaków (AUTH-004).');
      return;
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
          <div className="flex gap-10 items-center" style={{ flexWrap: 'wrap' }}>
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
                  <th>Sprawy jako właściciel</th>
                  <th>Ostatnie logowanie</th>
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
                    <td className="cell-secondary">{u.email}</td>
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
                    <td className="cell-secondary">{caseCountByOwner.get(u.id) ?? 0}</td>
                    <td className="cell-secondary">
                      {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Nigdy'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHistoryTarget(u);
                        }}
                      >
                        Historia
                      </button>
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
                    setResetModalOpen(true);
                  }}
                >
                  Resetuj hasło
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
            {!editing && (
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
              {(roles ?? []).map((r) => (
                <label
                  key={r.id}
                  className={`radio-card ${form.roleIds.includes(r.id) ? 'selected' : ''}`}
                  style={{ flex: '1 1 190px' }}
                >
                  <input
                    type="checkbox"
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
              ))}
            </div>
            <span className="hint">
              Jedna osoba może pełnić kilka ról naraz (np. właściciel jako Kierownik i
              Administrator) — uprawnienia się sumują.
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

      {/* --- Modal: reset hasła --- */}
      <Modal
        open={resetModalOpen}
        title="Resetuj hasło"
        onClose={() => setResetModalOpen(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setResetModalOpen(false)}>
              Zamknij
            </button>
            {!tempPassword && (
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
        <p className="text-sm text-secondary">
          Wygeneruj nowe, tymczasowe hasło dla {resetTarget?.firstName} {resetTarget?.lastName}.
          Poprzednie hasło przestanie działać.
        </p>
        {tempPassword && (
          <div>
            <div className="access-code-display">{tempPassword}</div>
            <p className="text-sm text-muted mt-8">
              Przekaż to hasło pracownikowi bezpiecznym kanałem — nie jest nigdzie zapisane jawnie
              poza tym oknem.
            </p>
          </div>
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
    </div>
  );
}
