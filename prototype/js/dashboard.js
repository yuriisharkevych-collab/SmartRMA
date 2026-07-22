/* Dashboard — statystyki i listy oparte o SMARTRMA_DATA.cases */

// TODAY / isOpenCase / daysUntil żyją teraz w data.js (SMARTRMA_DATA), żeby
// dashboard.js i cases.js liczyły "przeterminowane" / "na dziś" identycznie
// - kafelki dashboardu linkują do list, które muszą zwracać te same sprawy.

// UX Review Iteracja 2, punkt 1: pełny pasek filtrów statusów bezpośrednio
// na Dashboardzie - "Wszystkie" + wszystkie 14 statusów z ALL_STATUSES,
// filtrowanie w 100% po stronie klienta (bez nawigacji), żeby wynik
// pojawiał się natychmiast po kliknięciu.
let dashboardStatusFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
  initShell('dashboard', { searchPlaceholder: 'Szukaj sprawy, klienta, produktu…' });

  const user = getCurrentUser();
  document.getElementById('greeting').textContent = `Witaj, ${user.firstName}`;

  const openCases = SMARTRMA_DATA.cases.filter(SMARTRMA_DATA.isOpenCase);
  const newCases = SMARTRMA_DATA.cases.filter((c) => c.status === 'Nowa');
  const overdue = SMARTRMA_DATA.cases.filter(SMARTRMA_DATA.isOverdue);
  const dueToday = SMARTRMA_DATA.cases.filter(SMARTRMA_DATA.isDueToday);

  document.getElementById('subtitle').textContent =
    `Masz ${openCases.length} otwartych spraw, w tym ${overdue.length} przeterminowanych.`;

  document.getElementById('stat-grid').innerHTML = `
    <a href="cases.html?filter=new" class="stat-card accent-blue" style="display:block; cursor:pointer;">
      <div class="stat-card-label">Nowe reklamacje</div>
      <div class="stat-card-value">${newCases.length}</div>
      <div class="stat-card-trend">Wymagają weryfikacji i przyjęcia produktu</div>
    </a>
    <a href="cases.html?filter=open" class="stat-card accent-primary" style="display:block; cursor:pointer;">
      <div class="stat-card-label">Sprawy otwarte</div>
      <div class="stat-card-value">${openCases.length}</div>
      <div class="stat-card-trend">Łącznie w toku procesu reklamacyjnego</div>
    </a>
    <a href="cases.html?filter=overdue" class="stat-card accent-red" style="display:block; cursor:pointer;">
      <div class="stat-card-label">Przeterminowane</div>
      <div class="stat-card-value">${overdue.length}</div>
      <div class="stat-card-trend">Next Action po terminie</div>
    </a>
    <a href="cases.html?filter=today" class="stat-card accent-amber" style="display:block; cursor:pointer;">
      <div class="stat-card-label">Zadania na dziś</div>
      <div class="stat-card-value">${dueToday.length}</div>
      <div class="stat-card-trend">Termin Next Action mija dzisiaj</div>
    </a>
  `;

  const attention = [...openCases]
    .filter((c) => c.nextActionDueDate)
    .sort((a, b) => new Date(a.nextActionDueDate) - new Date(b.nextActionDueDate))
    .slice(0, 6);

  const attentionList = document.getElementById('attention-list');
  if (attention.length === 0) {
    attentionList.innerHTML = emptyState('Brak spraw wymagających uwagi', 'Wszystkie sprawy są aktualne.');
  } else {
    attentionList.innerHTML = attention.map((c) => attentionRow(c)).join('');
    attentionList.querySelectorAll('[data-case-id]').forEach((node) => {
      node.addEventListener('click', () => {
        window.location.href = `case-detail.html?id=${node.dataset.caseId}`;
      });
    });
  }

  const todayList = document.getElementById('today-list');
  const todayItems = [...dueToday, ...overdue].slice(0, 6);
  if (todayItems.length === 0) {
    todayList.innerHTML = emptyState('Brak pilnych zadań', 'Miłego dnia pracy.');
  } else {
    todayList.innerHTML = todayItems.map((c) => todayRow(c)).join('');
    todayList.querySelectorAll('[data-case-id]').forEach((node) => {
      node.addEventListener('click', () => {
        window.location.href = `case-detail.html?id=${node.dataset.caseId}`;
      });
    });
  }

  renderDashboardFilterTabs();
  renderDashboardCasesTable();
});

function renderDashboardFilterTabs() {
  const el = document.getElementById('dashboard-filter-tabs');
  const tabs = [{ key: 'all', label: 'Wszystkie' }, ...SMARTRMA_DATA.ALL_STATUSES.map((s) => ({
    key: s, label: SMARTRMA_DATA.STATUS_META[s].label,
  }))];

  el.innerHTML = tabs.map((t) => `
    <div class="filter-tab ${t.key === dashboardStatusFilter ? 'active' : ''}" data-key="${t.key}">${t.label}</div>
  `).join('');

  el.querySelectorAll('.filter-tab').forEach((node) => {
    node.addEventListener('click', () => {
      dashboardStatusFilter = node.dataset.key;
      renderDashboardFilterTabs();
      renderDashboardCasesTable();
    });
  });
}

function renderDashboardCasesTable() {
  const rows = SMARTRMA_DATA.cases
    .filter((c) => dashboardStatusFilter === 'all' || c.status === dashboardStatusFilter)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const tbody = document.getElementById('dashboard-cases-tbody');
  const emptyWrap = document.getElementById('dashboard-empty-wrap');

  if (rows.length === 0) {
    tbody.innerHTML = '';
    emptyWrap.innerHTML = `
      <div class="empty-state">
        <div class="icon-wrap">${ICONS.search}</div>
        <h4>Brak spraw w tym statusie</h4>
        <p>Wybierz inny filtr powyżej.</p>
      </div>
    `;
    return;
  }
  emptyWrap.innerHTML = '';
  renderCasesIntoTable(tbody, rows);
}

function attentionRow(c) {
  const d = SMARTRMA_DATA.daysUntil(c.nextActionDueDate);
  const dueLabel = d < 0 ? `${Math.abs(d)} dni po terminie` : d === 0 ? 'dzisiaj' : `za ${d} dni`;
  const dueClass = d < 0 ? 'badge-red' : d === 0 ? 'badge-amber' : 'badge-gray';
  return `
    <div class="kv-row" data-case-id="${c.id}" style="cursor:pointer; padding: 14px 20px; border-bottom:1px solid var(--border);">
      <div style="flex:1;">
        <div class="flex items-center gap-8">
          <span class="mono" style="font-size:12.5px; font-weight:600;">${c.caseNumber}</span>
          ${statusBadge(c.status)}
        </div>
        <div class="mt-4" style="font-size:12.5px; color:var(--text-secondary);">${c.nextAction || '—'}</div>
      </div>
      <span class="badge ${dueClass}">${dueLabel}</span>
    </div>
  `;
}

function todayRow(c) {
  return `
    <div data-case-id="${c.id}" style="cursor:pointer; padding: 13px 20px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:10px;">
      <span class="mono" style="font-size:12px; color:var(--text-muted);">${c.caseNumber}</span>
      <span style="font-size:12.5px; flex:1;">${(c.nextAction || '—').slice(0, 54)}${(c.nextAction || '').length > 54 ? '…' : ''}</span>
    </div>
  `;
}

function emptyState(title, desc) {
  return `
    <div class="empty-state">
      <div class="icon-wrap">${ICONS.clock}</div>
      <h4>${title}</h4>
      <p>${desc}</p>
    </div>
  `;
}
