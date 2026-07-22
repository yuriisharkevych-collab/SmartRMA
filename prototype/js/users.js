/* Zarządzanie użytkownikami — dostęp wyłącznie: Administrator.
   Rozbudowane o: pełne CRUD (w tym usuwanie), reset hasła (mock),
   przypisanie do oddziału, historię logowań i aktywność w sprawach
   (SmartRMA - Kolejny etap rozwoju panelu administracyjnego). */

let editingUserId = null;
let activeResetUserId = null;

document.addEventListener('DOMContentLoaded', () => {
  initShell('users', { showSearch: false });
  render();
});

function hasAccess() {
  return getCurrentRole() === 'Administrator';
}

function render() {
  const root = document.getElementById('content-root');

  if (!hasAccess()) {
    root.innerHTML = accessDeniedState();
    return;
  }

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Użytkownicy</h1>
        <p class="page-subtitle">Zarządzanie kontami, rolami i oddziałami (dostępne wyłącznie dla Administratora).</p>
      </div>
      <button class="btn btn-primary" id="btn-add-user" data-write-action>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        Dodaj użytkownika
      </button>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Imię i nazwisko</th>
              <th>E-mail</th>
              <th>Rola</th>
              <th>Oddział</th>
              <th>Status</th>
              <th>Sprawy jako właściciel</th>
              <th>Ostatnie logowanie</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="users-tbody"></tbody>
        </table>
      </div>
    </div>

    <div class="card card-pad mt-20" style="background:var(--surface-sunken); border-style:dashed;">
      <p class="text-sm text-secondary">
        <strong>Uwaga projektowa:</strong> w małych organizacjach jedna osoba może pełnić więcej niż jedną rolę
        (np. właściciel jako Kierownik i Administrator jednocześnie) — zgodnie z ROLES_AND_PERMISSIONS.md.
        Ten prototyp modeluje jedną rolę na użytkownika; obsługa wielu ról na konto zostanie doprecyzowana
        przy implementacji.
      </p>
    </div>
  `;

  populateRoleSelect();
  populateBranchSelect();
  renderTable();
  applyRoleGates();
  document.getElementById('btn-add-user').addEventListener('click', () => openUserModal(null));
  document.getElementById('u-save').addEventListener('click', saveUser);
  document.getElementById('u-delete').addEventListener('click', deleteUser);
  document.getElementById('u-reset-password').addEventListener('click', () => openResetPasswordModal(editingUserId));
  document.getElementById('reset-password-confirm').addEventListener('click', confirmResetPassword);
}

function populateRoleSelect() {
  const select = document.getElementById('u-role');
  select.innerHTML = SMARTRMA_DATA.ALL_ROLES.map((role) =>
    `<option value="${role}">${SMARTRMA_DATA.ROLE_LABELS[role]}</option>`).join('');
}

function populateBranchSelect() {
  const select = document.getElementById('u-branch');
  select.innerHTML = SMARTRMA_DATA.branches.map((b) =>
    `<option value="${b.id}">${b.name}</option>`).join('');
}

const ROLE_BADGE_TONE = { Pracownik: 'blue', Kierownik: 'primary', Administrator: 'amber', Serwis: 'green', Odczyt: 'gray' };

function renderTable() {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = SMARTRMA_DATA.users.map((u) => {
    const caseCount = SMARTRMA_DATA.cases.filter((c) => c.ownerId === u.id).length;
    const branch = SMARTRMA_DATA.findBranch(u.branchId);
    const lastLogin = u.loginHistory && u.loginHistory.length
      ? SMARTRMA_DATA.formatDateTime(u.loginHistory[0].at)
      : 'Nigdy';
    return `
      <tr data-id="${u.id}">
        <td class="flex items-center gap-10">
          <div class="avatar">${SMARTRMA_DATA.initials(u)}</div>
          <span class="cell-primary">${u.firstName} ${u.lastName}</span>
        </td>
        <td class="cell-secondary">${u.email}</td>
        <td><span class="badge badge-${ROLE_BADGE_TONE[u.role] || 'gray'}">${SMARTRMA_DATA.ROLE_LABELS[u.role] || u.role}</span></td>
        <td class="cell-secondary">${branch ? branch.name : '—'}</td>
        <td>${u.active ? '<span class="badge badge-green">Aktywny</span>' : '<span class="badge badge-gray">Nieaktywny</span>'}</td>
        <td class="cell-secondary">${caseCount}</td>
        <td class="cell-secondary">${lastLogin}</td>
        <td><button type="button" class="btn btn-ghost btn-sm" data-activity-id="${u.id}">Historia</button></td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-activity-id]')) return; // osobna akcja, nie otwiera edycji
      openUserModal(row.dataset.id);
    });
  });
  tbody.querySelectorAll('[data-activity-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openActivityModal(btn.dataset.activityId);
    });
  });
}

function openUserModal(id) {
  editingUserId = id;
  const u = id ? SMARTRMA_DATA.findUser(id) : null;

  document.getElementById('user-modal-title').textContent = u ? 'Edytuj użytkownika' : 'Dodaj użytkownika';
  document.getElementById('u-firstName').value = u?.firstName || '';
  document.getElementById('u-lastName').value = u?.lastName || '';
  document.getElementById('u-email').value = u?.email || '';
  document.getElementById('u-role').value = u?.role || 'Pracownik';
  document.getElementById('u-branch').value = u?.branchId || SMARTRMA_DATA.branches[0]?.id || '';
  document.getElementById('u-active').checked = u ? u.active : true;
  document.getElementById('u-delete').classList.toggle('hidden', !u);
  document.getElementById('u-reset-password').classList.toggle('hidden', !u);

  openModal('modal-user');
}

function saveUser() {
  const firstName = document.getElementById('u-firstName').value.trim();
  const lastName = document.getElementById('u-lastName').value.trim();
  const email = document.getElementById('u-email').value.trim();
  if (!firstName || !lastName || !email) {
    showToast('Uzupełnij imię, nazwisko i e-mail.');
    return;
  }

  const data = {
    firstName, lastName, email,
    role: document.getElementById('u-role').value,
    branchId: document.getElementById('u-branch').value,
    active: document.getElementById('u-active').checked,
  };

  if (editingUserId) {
    const u = SMARTRMA_DATA.findUser(editingUserId);
    Object.assign(u, data);
    showToast('Dane użytkownika zaktualizowane.');
  } else {
    SMARTRMA_DATA.users.push({
      id: 'u' + (SMARTRMA_DATA.users.length + 1) + '-' + Date.now(),
      loginHistory: [], passwordResetAt: null, ...data,
    });
    showToast('Użytkownik dodany.');
  }
  SMARTRMA_DATA.persist();

  closeModal('modal-user');
  renderTable();
}

function deleteUser() {
  if (!editingUserId) return;
  const u = SMARTRMA_DATA.findUser(editingUserId);
  const ownedCases = SMARTRMA_DATA.cases.filter((c) => c.ownerId === editingUserId).length;
  const warning = ownedCases > 0
    ? ` Ten użytkownik jest właścicielem ${ownedCases} spraw — pozostaną przypisane do niego w danych historycznych.`
    : '';
  if (!confirm(`Czy na pewno usunąć użytkownika ${u.firstName} ${u.lastName}?${warning}`)) return;

  const idx = SMARTRMA_DATA.users.findIndex((usr) => usr.id === editingUserId);
  if (idx !== -1) SMARTRMA_DATA.users.splice(idx, 1);
  SMARTRMA_DATA.persist();

  closeModal('modal-user');
  showToast('Użytkownik usunięty.');
  renderTable();
}

/* --------------------------------------------------------------------------
   Reset hasła (mock — patrz generateTempPassword() w data.js: BACKEND TODO)
   ------------------------------------------------------------------------ */

function openResetPasswordModal(userId) {
  activeResetUserId = userId;
  const u = SMARTRMA_DATA.findUser(userId);
  document.getElementById('reset-password-intro').textContent =
    `Wygeneruj nowe, tymczasowe hasło dla ${u.firstName} ${u.lastName}. Poprzednie hasło przestanie działać.`;
  document.getElementById('reset-password-result').classList.add('hidden');
  document.getElementById('reset-password-confirm').classList.remove('hidden');
  openModal('modal-reset-password');
}

function confirmResetPassword() {
  const u = SMARTRMA_DATA.findUser(activeResetUserId);
  if (!u) return;
  const tempPassword = SMARTRMA_DATA.generateTempPassword();
  u.passwordResetAt = new Date().toISOString();
  SMARTRMA_DATA.persist();

  document.getElementById('reset-password-value').textContent = tempPassword;
  document.getElementById('reset-password-result').classList.remove('hidden');
  document.getElementById('reset-password-confirm').classList.add('hidden');
  showToast('Hasło tymczasowe wygenerowane.');
}

/* --------------------------------------------------------------------------
   Historia logowań + aktywność - aktywność liczona z PRAWDZIWYCH wpisów
   CaseHistory tego użytkownika (nie osobny, zmyślony log), żeby uniknąć
   utrzymywania dwóch niezależnych źródeł prawdy o tym, co pracownik robił.
   ------------------------------------------------------------------------ */

function openActivityModal(userId) {
  const u = SMARTRMA_DATA.findUser(userId);
  document.getElementById('activity-modal-title').textContent = `Historia — ${u.firstName} ${u.lastName}`;

  const loginHistory = u.loginHistory || [];
  document.getElementById('activity-login-history').innerHTML = loginHistory.length
    ? `<div class="kv-list">${loginHistory.slice(0, 8).map((entry) => `
        <div class="kv-row"><span class="kv-label">${SMARTRMA_DATA.formatDateTime(entry.at)}</span><span class="kv-value mono">${entry.ip}</span></div>
      `).join('')}</div>`
    : '<p class="text-sm text-muted">Brak zarejestrowanych logowań.</p>';

  const activity = SMARTRMA_DATA.cases
    .flatMap((c) => c.history.filter((h) => h.userId === userId).map((h) => ({ ...h, caseNumber: c.caseNumber })))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);

  document.getElementById('activity-case-log').innerHTML = activity.length
    ? `<div class="timeline">${activity.map((h) => `
        <div class="timeline-item">
          <div class="timeline-dot-col"><div class="timeline-dot"></div><div class="timeline-line"></div></div>
          <div class="timeline-content">
            <div class="timeline-action"><span class="mono">${h.caseNumber}</span> — ${h.action}</div>
            <div class="timeline-meta">${SMARTRMA_DATA.formatDateTime(h.createdAt)}</div>
          </div>
        </div>
      `).join('')}</div>`
    : '<p class="text-sm text-muted">Brak zarejestrowanej aktywności w sprawach.</p>';

  openModal('modal-user-activity');
}

function accessDeniedState() {
  return `
    <div class="empty-state" style="margin-top:60px;">
      <div class="icon-wrap">${ICONS.users}</div>
      <h4>Brak dostępu</h4>
      <p>Zarządzanie użytkownikami jest dostępne wyłącznie dla roli Administrator.<br/>Zmień rolę w panelu bocznym, aby zobaczyć ten ekran.</p>
    </div>
  `;
}
