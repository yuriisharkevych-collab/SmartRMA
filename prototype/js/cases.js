/* Lista reklamacji — filtry statusu + wyszukiwanie tekstowe (client-side) */

const FILTERS = [
  { key: 'all', label: 'Wszystkie', match: () => true },
  { key: 'open', label: 'Otwarte', match: (c) => SMARTRMA_DATA.isOpenCase(c) },
  { key: 'new', label: 'Nowe', match: (c) => c.status === 'Nowa' },
  { key: 'waiting', label: 'Oczekujące na decyzję', match: (c) => [
      'OczekiwanieNaDecyzjeProducenta', 'OczekiwanieNaDecyzjeKierownika',
    ].includes(c.status) },
  { key: 'overdue', label: 'Przeterminowane', match: (c) => SMARTRMA_DATA.isOverdue(c) },
  { key: 'today', label: 'Na dziś', match: (c) => SMARTRMA_DATA.isDueToday(c) },
  { key: 'monitored', label: 'Monitorowane', match: (c) => c.submissionMode === 'BezposrednioDoProducenta' },
  { key: 'closed', label: 'Zamknięte', match: (c) => ['Zamknieta', 'Anulowana', 'Zarchiwizowana'].includes(c.status) },
];

let activeFilter = 'open';
let searchQuery = '';

document.addEventListener('DOMContentLoaded', () => {
  initShell('cases', { searchPlaceholder: 'Szukaj sprawy, klienta, produktu…' });

  const params = new URLSearchParams(window.location.search);
  if (params.get('q')) {
    searchQuery = params.get('q');
    document.getElementById('table-search').value = searchQuery;
  }
  // Kafelki dashboardu linkują tu z ?filter=new|open|overdue|today - patrz dashboard.js
  const filterParam = params.get('filter');
  if (filterParam && FILTERS.some((f) => f.key === filterParam)) {
    activeFilter = filterParam;
  }

  renderFilterTabs();
  renderTable();

  document.getElementById('table-search').addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderTable();
  });
});

function renderFilterTabs() {
  const el = document.getElementById('filter-tabs');
  el.innerHTML = FILTERS.map((f) => `
    <div class="filter-tab ${f.key === activeFilter ? 'active' : ''}" data-key="${f.key}">${f.label}</div>
  `).join('');
  el.querySelectorAll('.filter-tab').forEach((node) => {
    node.addEventListener('click', () => {
      activeFilter = node.dataset.key;
      renderFilterTabs();
      renderTable();
    });
  });
}

function matchesSearch(c, q) {
  if (!q) return true;
  const customer = SMARTRMA_DATA.findCustomer(c.customerId);
  const manufacturer = SMARTRMA_DATA.findManufacturer(c.product.manufacturerId);
  const haystack = [
    c.caseNumber, customer?.firstName, customer?.lastName, customer?.phone, customer?.email,
    c.product.model, c.product.serialNumber, c.product.frameNumber, manufacturer?.name,
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

function renderTable() {
  const filter = FILTERS.find((f) => f.key === activeFilter);
  const rows = SMARTRMA_DATA.cases
    .filter(filter.match)
    .filter((c) => matchesSearch(c, searchQuery))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  document.getElementById('subtitle').textContent = `${rows.length} spraw w widoku „${filter.label}”.`;

  const tbody = document.getElementById('cases-tbody');
  const emptyWrap = document.getElementById('empty-wrap');

  if (rows.length === 0) {
    tbody.innerHTML = '';
    emptyWrap.innerHTML = `
      <div class="empty-state">
        <div class="icon-wrap">${ICONS.search}</div>
        <h4>Brak wyników</h4>
        <p>Zmień filtr statusu lub wyszukiwane hasło.</p>
      </div>
    `;
    return;
  }
  emptyWrap.innerHTML = '';
  renderCasesIntoTable(document.getElementById('cases-tbody'), rows);
}
