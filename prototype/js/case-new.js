/* Formularz Nowa reklamacja — logika UX (bez backendu, dane w pamięci) */

let selectedCustomerId = null;

document.addEventListener('DOMContentLoaded', () => {
  initShell('cases', { showSearch: false });

  populateManufacturers();
  populateBrandList();
  wireBrandAutoDetect();
  populateOwners();
  setupCustomerSearch();
  setupComplaintTypeCards();
  setupFileAttachments();

  document.getElementById('toggle-new-customer').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('customer-search-block').classList.add('hidden');
    document.getElementById('new-customer-block').classList.remove('hidden');
  });

  document.getElementById('clear-customer').addEventListener('click', () => {
    selectedCustomerId = null;
    document.getElementById('selected-customer-block').classList.add('hidden');
    document.getElementById('customer-search-block').classList.remove('hidden');
    document.getElementById('customer-search').value = '';
  });

  document.getElementById('case-form').addEventListener('submit', handleSubmit);
});

function populateManufacturers() {
  const select = document.getElementById('p-manufacturer');
  select.innerHTML = '<option value="">Wybierz producenta…</option>' +
    SMARTRMA_DATA.manufacturers.filter((m) => m.active)
      .map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
}

// Marka jest opcjonalna i wyłącznie pomocnicza - nie zastępuje wyboru
// producenta (który zostaje wymaganym, walidowanym polem), tylko go
// przyspiesza. Patrz docs/DECISIONS.md - świadoma decyzja, żeby nie
// przebudowywać już przetestowanego formularza wokół marki jako pola
// głównego.
function populateBrandList() {
  const datalist = document.getElementById('p-brand-list');
  datalist.innerHTML = SMARTRMA_DATA.brands.map((b) => `<option value="${b.name}"></option>`).join('');
}

function wireBrandAutoDetect() {
  document.getElementById('p-brand').addEventListener('input', (e) => {
    const brand = SMARTRMA_DATA.brands.find((b) => b.name.toLowerCase() === e.target.value.trim().toLowerCase());
    if (brand && brand.manufacturerId) {
      document.getElementById('p-manufacturer').value = brand.manufacturerId;
      showToast(`Producent ustawiony automatycznie na podstawie marki „${brand.name}”.`);
    }
  });
}

function populateOwners() {
  const select = document.getElementById('f-owner');
  const current = getCurrentUser();
  select.innerHTML = SMARTRMA_DATA.users.filter((u) => u.active)
    .map((u) => `<option value="${u.id}" ${u.id === current.id ? 'selected' : ''}>${u.firstName} ${u.lastName} — ${u.role}</option>`)
    .join('');
}

function setupCustomerSearch() {
  const input = document.getElementById('customer-search');
  const results = document.getElementById('customer-results');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) {
      results.classList.remove('open');
      results.innerHTML = '';
      return;
    }
    const matches = SMARTRMA_DATA.customers.filter((c) =>
      `${c.firstName} ${c.lastName} ${c.phone} ${c.email}`.toLowerCase().includes(q)
    ).slice(0, 6);

    if (matches.length === 0) {
      results.innerHTML = `<div class="autocomplete-item"><div class="meta">Brak wyników — użyj „Dodaj nowego klienta”.</div></div>`;
    } else {
      results.innerHTML = matches.map((c) => `
        <div class="autocomplete-item" data-id="${c.id}">
          <div class="name">${c.firstName} ${c.lastName}</div>
          <div class="meta">${c.phone} · ${c.email}</div>
        </div>
      `).join('');
    }
    results.classList.add('open');

    results.querySelectorAll('[data-id]').forEach((node) => {
      node.addEventListener('click', () => selectCustomer(node.dataset.id));
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-wrap')) {
      results.classList.remove('open');
    }
  });
}

function selectCustomer(id) {
  selectedCustomerId = id;
  const c = SMARTRMA_DATA.findCustomer(id);
  document.getElementById('selected-customer-name').textContent = `${c.firstName} ${c.lastName}`;
  document.getElementById('selected-customer-meta').textContent = `${c.phone} · ${c.email}`;
  document.getElementById('customer-search-block').classList.add('hidden');
  document.getElementById('selected-customer-block').classList.remove('hidden');
  document.getElementById('customer-results').classList.remove('open');
}

function setupComplaintTypeCards() {
  const cards = document.querySelectorAll('.radio-card');
  function refresh() {
    cards.forEach((card) => {
      const input = card.querySelector('input');
      card.classList.toggle('selected', input.checked);
    });
  }
  cards.forEach((card) => card.addEventListener('click', () => {
    card.querySelector('input').checked = true;
    refresh();
  }));
  refresh();
}

// Wyłącznie element UI - wybrane pliki są pokazywane jako chipy, ale
// nigdzie nie są zapisywane ani wysyłane. Realny upload to zakres modułu
// Dokumentów (poza obecnym etapem).
let selectedFiles = [];

function setupFileAttachments() {
  const dropzone = document.getElementById('file-drop');
  const input = document.getElementById('file-input');
  const list = document.getElementById('file-list');

  dropzone.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    Array.from(input.files).forEach((file) => selectedFiles.push(file.name));
    input.value = '';
    renderFileList();
  });

  function renderFileList() {
    list.innerHTML = selectedFiles.map((name, idx) => `
      <span class="file-chip">
        ${name}
        <button type="button" data-idx="${idx}" title="Usuń">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </span>
    `).join('');
    list.querySelectorAll('button[data-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedFiles.splice(Number(btn.dataset.idx), 1);
        renderFileList();
      });
    });
  }
}

// generateCaseNumber() przeniesione do data.js (SMARTRMA_DATA.generateCaseNumber) -
// współdzielone z kreatorem klienta (client-new-case.js), żeby uniknąć dwóch
// niezależnych liczników.

function handleSubmit(e) {
  e.preventDefault();

  const newCustomerVisible = !document.getElementById('new-customer-block').classList.contains('hidden');
  if (!selectedCustomerId && !newCustomerVisible) {
    showToast('Wybierz istniejącego klienta lub dodaj nowego.');
    return;
  }

  let customerId = selectedCustomerId;
  if (!customerId) {
    const firstName = document.getElementById('c-firstName').value.trim();
    const lastName = document.getElementById('c-lastName').value.trim();
    const phone = document.getElementById('c-phone').value.trim();
    if (!firstName || !lastName || !phone) {
      showToast('Uzupełnij imię, nazwisko i telefon nowego klienta.');
      return;
    }
    const newCustomer = {
      id: 'c' + (SMARTRMA_DATA.customers.length + 1),
      firstName, lastName, phone,
      email: document.getElementById('c-email').value.trim(),
      address: document.getElementById('c-address').value.trim(),
    };
    SMARTRMA_DATA.customers.push(newCustomer);
    SMARTRMA_DATA.persist();
    customerId = newCustomer.id;
  }

  const manufacturerId = document.getElementById('p-manufacturer').value;
  const model = document.getElementById('p-model').value.trim();
  if (!manufacturerId || !model) {
    showToast('Wybierz producenta i podaj model produktu.');
    return;
  }

  const description = document.getElementById('f-description').value.trim();
  const requestedResolution = document.getElementById('f-resolution').value.trim();
  if (!description || !requestedResolution) {
    showToast('Uzupełnij opis zgłoszenia i oczekiwane rozwiązanie.');
    return;
  }

  const complaintType = document.querySelector('input[name="complaintType"]:checked').value;
  const ownerId = document.getElementById('f-owner').value;

  const newCase = {
    id: 'case' + (SMARTRMA_DATA.cases.length + 1) + '-' + Date.now(),
    caseNumber: SMARTRMA_DATA.generateCaseNumber(),
    customerId,
    product: {
      manufacturerId,
      model,
      serialNumber: document.getElementById('p-serial').value.trim(),
      frameNumber: document.getElementById('p-frame').value.trim(),
      purchaseDate: document.getElementById('p-purchaseDate').value || null,
      purchaseProofNumber: document.getElementById('p-proof').value.trim(),
    },
    complaintType,
    source: document.getElementById('f-source').value,
    description,
    customerStatement: document.getElementById('f-statement').value.trim(),
    requestedResolution,
    status: 'Nowa',
    priority: 'Normalny',
    decision: null,
    decisionAt: null,
    nextAction: 'Zweryfikuj kompletność zgłoszenia i przyjmij produkt od klienta.',
    nextActionDueDate: '2026-07-21',
    requiresManagerApproval: false,
    isException: false,
    ownerId,
    createdAt: new Date('2026-07-18T10:00:00').toISOString(),
    history: [
      { action: 'CaseCreated', newValue: 'Nowa', userId: ownerId, createdAt: new Date('2026-07-18T10:00:00').toISOString() },
    ],
  };

  SMARTRMA_DATA.cases.unshift(newCase);
  SMARTRMA_DATA.persist();

  showToast(`Zgłoszenie ${newCase.caseNumber} zapisane`);
  setTimeout(() => {
    window.location.href = `case-detail.html?id=${newCase.id}`;
  }, 700);
}
