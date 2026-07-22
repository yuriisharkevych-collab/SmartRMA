/* ============================================================================
   SmartRMA AI — Prototyp UI — powłoka aplikacji (sidebar/topbar), rola,
   drobne funkcje pomocnicze UI. Ładowany na każdej stronie po data.js.
   ========================================================================= */

const ICONS = {
  dashboard: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  cases: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z"/></svg>',
  manufacturers: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V10l6 4v-4l6 4V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v15"/><path d="M3 21h18"/></svg>',
  users: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16.5 4.6a3.2 3.2 0 0 1 0 6.2"/><path d="M20 20c0-2.9-1.7-5-4-5.7"/></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  bell: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14 18 8Z"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  chevronDown: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  arrowLeft: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
  logout: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>',
  clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: 'dashboard' },
  { key: 'cases', label: 'Reklamacje', href: 'cases.html', icon: 'cases' },
  { key: 'manufacturers', label: 'Producenci', href: 'manufacturers.html', icon: 'manufacturers', minRole: ['Kierownik', 'Administrator'] },
  { key: 'users', label: 'Użytkownicy', href: 'users.html', icon: 'users', minRole: ['Administrator'] },
];

const ROLE_TO_USER = { Pracownik: 'u1', Kierownik: 'u2', Administrator: 'u3', Serwis: 'u6', Odczyt: 'u7' };

function getCurrentRole() {
  return localStorage.getItem('smartrma_role') || 'Pracownik';
}

function setCurrentRole(role) {
  localStorage.setItem('smartrma_role', role);
}

function getCurrentUser() {
  return SMARTRMA_DATA.findUser(ROLE_TO_USER[getCurrentRole()]);
}

function roleAllows(minRoleList) {
  if (!minRoleList) return true;
  return minRoleList.includes(getCurrentRole());
}

/* --------------------------------------------------------------------------
   Sidebar + Topbar
   ------------------------------------------------------------------------ */

function renderSidebar(activeKey) {
  const el = document.getElementById('sidebar');
  if (!el) return;
  const role = getCurrentRole();

  const navHtml = NAV_ITEMS.filter((item) => roleAllows(item.minRole))
    .map((item) => `
      <a class="nav-item ${item.key === activeKey ? 'active' : ''}" href="${item.href}">
        ${ICONS[item.icon]}<span>${item.label}</span>
      </a>
    `).join('');

  el.innerHTML = `
    <div class="sidebar-brand">
      <div class="sidebar-brand-mark">R</div>
      <div class="sidebar-brand-text">Smart<span>RMA</span></div>
    </div>
    <div class="nav-section-label">Menu</div>
    ${navHtml}
    <div class="sidebar-footer">
      <div class="role-switcher">
        <label for="role-select">Podgląd jako</label>
        <select id="role-select">
          <option value="Pracownik" ${role === 'Pracownik' ? 'selected' : ''}>Pracownik — Anna Kowalska</option>
          <option value="Kierownik" ${role === 'Kierownik' ? 'selected' : ''}>Kierownik — Marek Nowak</option>
          <option value="Administrator" ${role === 'Administrator' ? 'selected' : ''}>Administrator — Ewa Wiśniewska</option>
          <option value="Serwis" ${role === 'Serwis' ? 'selected' : ''}>Serwis — Tomasz Serwisant</option>
          <option value="Odczyt" ${role === 'Odczyt' ? 'selected' : ''}>Odczyt — Beata Obserwator</option>
        </select>
      </div>
      <a href="#" id="reset-demo-data" class="nav-item" style="font-size:12px; color:var(--text-muted);">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
        <span>Resetuj dane demo</span>
      </a>
    </div>
  `;

  document.getElementById('role-select').addEventListener('change', (e) => {
    setCurrentRole(e.target.value);
    const item = NAV_ITEMS.find((i) => i.key === activeKey);
    if (item && !roleAllows(item.minRole)) {
      window.location.href = 'dashboard.html';
    } else {
      window.location.reload();
    }
  });

  document.getElementById('reset-demo-data').addEventListener('click', (e) => {
    e.preventDefault();
    if (confirm('Przywrócić dane prototypu do stanu początkowego? Wszystkie zmiany wprowadzone podczas testowania (nowe sprawy, klienci, producenci, użytkownicy) zostaną utracone.')) {
      SMARTRMA_DATA.resetToSeed();
    }
  });
}

function renderTopbar({ showSearch = true, searchPlaceholder = 'Szukaj sprawy, klienta, produktu…' } = {}) {
  const el = document.getElementById('topbar');
  if (!el) return;
  const user = getCurrentUser();

  el.innerHTML = `
    <div class="topbar-search" style="${showSearch ? '' : 'visibility:hidden;'}">
      ${ICONS.search}
      <input type="text" id="global-search" placeholder="${searchPlaceholder}" autocomplete="off" />
    </div>
    <div class="topbar-right">
      <button class="icon-btn" type="button" title="Powiadomienia" aria-label="Powiadomienia">${ICONS.bell}</button>
      <div class="user-chip" id="user-chip" role="button" tabindex="0" aria-label="Menu użytkownika: ${user.firstName} ${user.lastName}, wyloguj się">
        <div class="avatar">${SMARTRMA_DATA.initials(user)}</div>
        <div>
          <div class="user-chip-name">${user.firstName} ${user.lastName}</div>
          <div class="user-chip-role">${user.role}</div>
        </div>
        ${ICONS.chevronDown}
      </div>
    </div>
  `;

  const userChip = document.getElementById('user-chip');
  const triggerLogout = () => {
    if (confirm('Wylogować się z prototypu SmartRMA AI?')) {
      window.location.href = 'index.html';
    }
  };
  userChip.addEventListener('click', triggerLogout);
  userChip.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      triggerLogout();
    }
  });

  if (showSearch) {
    document.getElementById('global-search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        window.location.href = `cases.html?q=${encodeURIComponent(e.target.value.trim())}`;
      }
    });
  }
}

function initShell(activeKey, topbarOpts) {
  if (!localStorage.getItem('smartrma_role')) {
    setCurrentRole('Pracownik');
  }
  renderSidebar(activeKey);
  renderTopbar(topbarOpts);
  applyRoleGates();
  renderStorageWarningIfNeeded();
}

// POPRAWKA KRYTYCZNA (UX Review Iteracja 2, punkt 2). Jeśli localStorage nie
// działa w tym oknie (file://, tryb prywatny, podgląd w piaskownicy o innym
// originie), informujemy o tym jawnie zamiast dawać fałszywy komunikat
// sukcesu przy zapisie - patrz data.js: storageAvailable().
function renderStorageWarningIfNeeded() {
  if (SMARTRMA_DATA.storageAvailable) return;
  const main = document.querySelector('.main');
  if (!main || document.getElementById('storage-warning')) return;
  const banner = document.createElement('div');
  banner.id = 'storage-warning';
  banner.className = 'storage-warning';
  banner.innerHTML = `
    <strong>Zmiany nie będą zapisywane trwale w tym oknie.</strong>
    Przeglądarka blokuje localStorage (często zdarza się przy otwieraniu pliku bezpośrednio
    przez <span class="mono">file://</span>, w trybie prywatnym albo w podglądzie typu iframe).
    Uruchom prototyp przez lokalny serwer opisany w README.md, żeby nowe sprawy i zmiany
    statusów zapisywały się między ekranami.
  `;
  main.prepend(banner);
}

/* --------------------------------------------------------------------------
   Wspólny renderer wiersza/tabeli spraw - używany przez cases.js
   (pełna lista) i dashboard.js (sekcja "Wszystkie sprawy" z filtrem
   statusów), żeby nie utrzymywać dwóch kopii tego samego <tr>.
   ------------------------------------------------------------------------ */

function caseRowHtml(c) {
  const customer = SMARTRMA_DATA.findCustomer(c.customerId);
  const manufacturer = SMARTRMA_DATA.findManufacturer(c.product.manufacturerId);
  const owner = SMARTRMA_DATA.findUser(c.ownerId);
  return `
    <tr data-id="${c.id}">
      <td class="mono cell-primary">${c.caseNumber}</td>
      <td>
        <div class="cell-primary">${customer ? customer.firstName + ' ' + customer.lastName : '—'}</div>
        <div class="cell-secondary">${customer ? customer.phone : ''}</div>
      </td>
      <td>
        <div class="cell-primary">${c.product.model}</div>
        <div class="cell-secondary">${c.product.serialNumber || 'brak nr seryjnego'}</div>
      </td>
      <td>${manufacturer ? manufacturer.name : '—'}</td>
      <td>${complaintTypeTag(c.complaintType)}${c.submissionMode === 'BezposrednioDoProducenta' ? ' <span class="tag" style="border-color:var(--amber); color:var(--amber);">Monitorowana</span>' : ''}</td>
      <td>${statusBadge(c.status)}</td>
      <td>${owner ? owner.firstName + ' ' + owner.lastName : '—'}</td>
      <td class="cell-secondary">${SMARTRMA_DATA.formatDate(c.createdAt)}</td>
    </tr>
  `;
}

function renderCasesIntoTable(tbodyEl, casesArray) {
  tbodyEl.innerHTML = casesArray.map(caseRowHtml).join('');
  tbodyEl.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', () => {
      window.location.href = `case-detail.html?id=${row.dataset.id}`;
    });
  });
}

// Ukrywa elementy oznaczone data-min-role="Kierownik,Administrator" dla ról,
// które nie mają wystarczających uprawnień (symulacja RBAC z
// ROLES_AND_PERMISSIONS.md bez realnej autoryzacji backendowej).
function applyRoleGates() {
  const role = getCurrentRole();
  document.querySelectorAll('[data-min-role]').forEach((node) => {
    const allowed = node.getAttribute('data-min-role').split(',').map((s) => s.trim());
    node.style.display = allowed.includes(role) ? '' : 'none';
  });
  // Rola "Odczyt (tylko podgląd)" - ukrywamy WSZYSTKIE elementy oznaczone
  // jako akcja zapisu, jednym generycznym atrybutem zamiast wymieniania
  // roli na każdym przycisku z osobna (łatwiej utrzymać, mniej miejsc do
  // pamiętania przy dodawaniu nowych przycisków w przyszłości).
  document.querySelectorAll('[data-write-action]').forEach((node) => {
    node.style.display = role === 'Odczyt' ? 'none' : '';
  });
}

/* --------------------------------------------------------------------------
   Badge / status helpers
   ------------------------------------------------------------------------ */

function statusBadge(status) {
  const meta = SMARTRMA_DATA.STATUS_META[status] || { label: status, tone: 'gray' };
  return `<span class="badge badge-${meta.tone}">${meta.label}</span>`;
}

function complaintTypeTag(type) {
  const meta = SMARTRMA_DATA.COMPLAINT_TYPE_META[type] || { label: type };
  return `<span class="tag">${meta.label}</span>`;
}

function priorityBadge(priority) {
  const tones = { Niski: 'gray', Normalny: 'blue', Wysoki: 'red' };
  return `<span class="badge badge-${tones[priority] || 'gray'}">${priority}</span>`;
}

/* --------------------------------------------------------------------------
   Toast
   ------------------------------------------------------------------------ */

function showToast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.innerHTML = `<span class="dot"></span>${message}`;
  el.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* --------------------------------------------------------------------------
   Modal
   ------------------------------------------------------------------------ */

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// Dostępność (Code Review pkt 9): Escape zamyka aktualnie otwarty modal.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.modal-overlay.open').forEach((el) => el.classList.remove('open'));
});

/* --------------------------------------------------------------------------
   Karta dokumentu — współdzielona przez widok pracownika i Portal Klienta
   (Code Review pkt 6: "Przygotuj komponent tak, aby później bez zmian mógł
   korzystać z prawdziwych danych backendowych" + uwaga architektoniczna o
   niepowielaniu komponentów UI). Kształt `doc` odpowiada 1:1 modelowi
   Document w schema.prisma (fileName, fileType, mimeType, fileSize,
   uploadedAt), więc podłączenie realnego API to tylko zmiana źródła danych,
   nie zmiana renderowania.
   ------------------------------------------------------------------------ */

const DOC_TYPE_ICON = {
  PDF: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3v5a1 1 0 0 0 1 1h5"/><path d="M6 3h8l6 6v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/></svg>',
  JPG: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>',
  PNG: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>',
  MP4: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3Z"/></svg>',
};

// Code Review (Finalizacja modułu), pkt 3: "Proszę przygotować [komponent
// dokumentów] tak, aby w przyszłości obsługiwał: podgląd PDF, zdjęcia,
// dokumenty producenta, protokoły, decyzje reklamacyjne. Nie implementujemy
// jeszcze podglądu - chodzi o odpowiednią architekturę."
//
// Rozwiązanie: `doc.category` (confirmation/photo/manufacturer/protocol/
// decision/other - patrz data.js) jest NIEZALEŻNE od `doc.fileType`
// (PDF/JPG/MP4). Kategoria decyduje o TYM, jak dokument będzie się kiedyś
// zachowywał (np. "decyzja" i "protokół" to zawsze PDF, ale mogą wymagać
// innego traktowania niż zwykłe potwierdzenie), fileType decyduje o ikonie
// i o TYM, czy podgląd jest w ogóle technicznie możliwy (podgląd PDF/JPG/PNG
// - tak, MP4 - inny odtwarzacz, inne pliki - nie). getDocumentPreviewInfo()
// poniżej jest jedynym miejscem, które będzie trzeba zmienić, żeby włączyć
// realny podgląd (np. otwarcie modala z <iframe>/<img> zamiast pobierania) -
// dziś świadomie zwraca tylko informację "czy dałoby się pokazać podgląd",
// nie pokazuje go.
const PREVIEWABLE_FILE_TYPES = new Set(['PDF', 'JPG', 'PNG']);

function getDocumentPreviewInfo(doc) {
  return {
    previewable: PREVIEWABLE_FILE_TYPES.has(doc.fileType),
    kind: doc.fileType === 'PDF' ? 'pdf' : (doc.fileType === 'JPG' || doc.fileType === 'PNG') ? 'image' : null,
    category: doc.category || 'other',
  };
}

function renderDocumentCard(doc, { downloadHref, downloadLabel, onDownloadClick } = {}) {
  const icon = DOC_TYPE_ICON[doc.fileType] || DOC_TYPE_ICON.PDF;
  const preview = getDocumentPreviewInfo(doc);
  const label = downloadLabel || t('documents_download');

  const actionHtml = downloadHref
    ? `<a href="${downloadHref}" target="_blank" class="btn btn-secondary btn-sm" aria-label="${t('documents_download')}: ${doc.fileName}">${label}</a>`
    : `<button type="button" class="btn btn-secondary btn-sm doc-download-btn" data-doc-id="${doc.id}" aria-label="${t('documents_download')}: ${doc.fileName}">${label}</button>`;

  // Przycisk podglądu pokazywany (wyszarzony) tylko dla typów, które
  // technicznie dałoby się kiedyś podejrzeć - buduje właściwe oczekiwanie
  // UI bez obiecywania funkcji dla plików wideo/innych.
  const previewHtml = preview.previewable
    ? `<button type="button" class="btn btn-ghost btn-sm doc-preview-btn" data-doc-id="${doc.id}" aria-label="${t('documents_preview')}: ${doc.fileName}" title="${t('documents_preview_unavailable')}">${t('documents_preview')}</button>`
    : '';

  return `
    <div class="document-row" data-category="${preview.category}">
      <div class="flex items-center gap-10" style="min-width:0;">
        <div class="doc-icon">${icon}</div>
        <div style="min-width:0;">
          <div class="doc-name">${doc.fileName}</div>
          <div class="text-sm text-muted">${doc.fileType} · ${SMARTRMA_DATA.formatFileSize(doc.fileSize)} · dodano ${SMARTRMA_DATA.formatDate(doc.uploadedAt)}</div>
        </div>
      </div>
      <div class="flex gap-6" style="flex-shrink:0;">
        ${previewHtml}
        ${actionHtml}
      </div>
    </div>
  `;
}

function wireMockDocumentDownloads(container) {
  container.querySelectorAll('.doc-download-btn').forEach((btn) => {
    btn.addEventListener('click', () => showToast(t('documents_download_mock')));
  });
  // BACKEND/FRONTEND TODO: podłączyć realny podgląd (modal + <iframe>/<img>)
  // zamiast toasta, gdy powstanie storage plików. getDocumentPreviewInfo()
  // powyżej już mówi, który typ się do tego nadaje.
  container.querySelectorAll('.doc-preview-btn').forEach((btn) => {
    btn.addEventListener('click', () => showToast(t('documents_preview_unavailable')));
  });
}
