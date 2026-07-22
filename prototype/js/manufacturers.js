/* Zarządzanie producentami — dostęp: Kierownik, Administrator
   (ROLES_AND_PERMISSIONS.md). Rozbudowane o: dane firmowe, logistykę,
   automatyzację, marki i statystyki (SmartRMA - Kolejny etap rozwoju
   panelu administracyjnego). */

let editingManufacturerId = null;
let editingBrandIds = []; // robocza kopia w trakcie edycji modala (przed zapisem)

document.addEventListener('DOMContentLoaded', () => {
  initShell('manufacturers', { showSearch: false });
  render();
});

function hasAccess() {
  return ['Kierownik', 'Administrator'].includes(getCurrentRole());
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
        <h1>Producenci</h1>
        <p class="page-subtitle">Konfiguracja procesu reklamacyjnego, logistyki i automatyzacji dla poszczególnych producentów.</p>
      </div>
      <button class="btn btn-primary" id="btn-add-manufacturer" data-write-action>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        Dodaj producenta
      </button>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nazwa</th>
              <th>Kraj</th>
              <th>Marki</th>
              <th>Sposób zgłoszenia</th>
              <th>Sprawy</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="manufacturers-tbody"></tbody>
        </table>
      </div>
    </div>
  `;

  renderTable();
  applyRoleGates();
  document.getElementById('btn-add-manufacturer').addEventListener('click', () => openManufacturerModal(null));
  document.getElementById('mf-save').addEventListener('click', saveManufacturer);
  document.getElementById('mf-method').addEventListener('change', updatePortalFieldsVisibility);
  document.getElementById('mf-brand-add').addEventListener('click', addBrandChip);
  document.getElementById('mf-brand-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addBrandChip(); }
  });
}

function renderTable() {
  const tbody = document.getElementById('manufacturers-tbody');
  tbody.innerHTML = SMARTRMA_DATA.manufacturers.map((m) => {
    const stats = SMARTRMA_DATA.getManufacturerStats(m.id);
    const brands = SMARTRMA_DATA.getBrandsForManufacturer(m.id);
    const brandsLabel = brands.length
      ? brands.slice(0, 3).map((b) => b.name).join(', ') + (brands.length > 3 ? ` +${brands.length - 3}` : '')
      : '—';
    return `
      <tr data-id="${m.id}">
        <td class="cell-primary">${m.name}</td>
        <td class="cell-secondary">${m.country || '—'}</td>
        <td class="cell-secondary">${brandsLabel}</td>
        <td>${m.submissionMethod || '—'}</td>
        <td class="cell-secondary">${stats.totalCases} (${stats.openCases} otwartych)</td>
        <td>${m.active ? '<span class="badge badge-green">Aktywny</span>' : '<span class="badge badge-gray">Nieaktywny</span>'}</td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', () => openManufacturerModal(row.dataset.id));
  });
}

function updatePortalFieldsVisibility() {
  const isB2B = document.getElementById('mf-method').value === 'Portal B2B';
  document.getElementById('mf-portal-fields-wrap').style.display = isB2B ? '' : 'none';
}

function renderBrandChips() {
  const container = document.getElementById('mf-brand-chips');
  if (editingBrandIds.length === 0) {
    container.innerHTML = '<span class="text-sm text-muted">Brak przypisanych marek.</span>';
    return;
  }
  container.innerHTML = editingBrandIds.map((brandId) => {
    const brand = SMARTRMA_DATA.findBrand(brandId);
    if (!brand) return '';
    return `
      <span class="chip" data-brand-id="${brandId}">
        ${brand.name}
        <button type="button" data-remove-brand="${brandId}" aria-label="Usuń markę ${brand.name}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </span>
    `;
  }).join('');

  container.querySelectorAll('[data-remove-brand]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingBrandIds = editingBrandIds.filter((id) => id !== btn.dataset.removeBrand);
      renderBrandChips();
    });
  });
}

function addBrandChip() {
  const input = document.getElementById('mf-brand-input');
  const name = input.value.trim();
  if (!name) return;

  // Marka może już istnieć (przypisana do innego producenta) - w tym
  // modelu (jeden producent -> wiele marek, marka należy do jednego
  // producenta) po prostu tworzymy nową markę o tej nazwie, jeśli klient
  // wpisał nazwę już istniejącej gdzie indziej - to jest świadome
  // uproszczenie, nie próba scalania/wykrywania duplikatów nazw.
  const existing = SMARTRMA_DATA.brands.find((b) => b.name.toLowerCase() === name.toLowerCase());
  if (existing && editingBrandIds.includes(existing.id)) {
    showToast('Ta marka jest już przypisana.');
    input.value = '';
    return;
  }

  const brandId = existing ? existing.id : 'br' + (SMARTRMA_DATA.brands.length + 1) + '-' + Date.now();
  if (!existing) {
    SMARTRMA_DATA.brands.push({ id: brandId, name, manufacturerId: editingManufacturerId || null });
  }
  editingBrandIds.push(brandId);
  input.value = '';
  renderBrandChips();
}

function openManufacturerModal(id) {
  editingManufacturerId = id;
  const m = id ? SMARTRMA_DATA.findManufacturer(id) : null;
  editingBrandIds = m ? SMARTRMA_DATA.getBrandsForManufacturer(m.id).map((b) => b.id) : [];

  document.getElementById('manufacturer-modal-title').textContent = m ? 'Edytuj producenta' : 'Dodaj producenta';

  document.getElementById('mf-name').value = m?.name || '';
  document.getElementById('mf-country').value = m?.country || 'Polska';
  document.getElementById('mf-nip').value = m?.nip || '';
  document.getElementById('mf-address').value = m?.address || '';
  document.getElementById('mf-active').checked = m ? m.active : true;

  document.getElementById('mf-contact-person').value = m?.contactPerson || '';
  document.getElementById('mf-phone').value = m?.contactPhone || '';
  document.getElementById('mf-email').value = m?.contactEmail || '';

  document.getElementById('mf-method').value = m?.submissionMethod || 'E-mail';
  document.getElementById('mf-portal').value = m?.portalUrl || '';
  document.getElementById('mf-portal-login').value = m?.portalLogin || '';
  document.getElementById('mf-portal-password').value = m?.portalPassword || '';
  updatePortalFieldsVisibility();

  document.getElementById('mf-procedure').value = m?.complaintProcedure || '';
  document.getElementById('mf-docs').value = m?.requiredDocumentsNote || '';
  document.getElementById('mf-photos').value = m?.requiredPhotosNote || '';
  document.getElementById('mf-videos').value = m?.requiredVideosNote || '';
  document.getElementById('mf-max-photos').value = m?.maxPhotos ?? 6;
  document.getElementById('mf-max-size').value = m?.maxAttachmentSizeMb ?? 15;
  document.getElementById('mf-req-serial').checked = m?.requiresSerialNumber ?? false;
  document.getElementById('mf-req-frame').checked = m?.requiresFrameNumber ?? false;
  document.getElementById('mf-req-proof').checked = m?.requiresProofOfPurchase ?? true;

  const logistics = m?.logistics || {};
  document.getElementById('mf-return-address').value = logistics.returnAddress || '';
  document.getElementById('mf-transport-organizer').value = logistics.transportOrganizer || 'Klient';
  document.getElementById('mf-manufacturer-label').checked = logistics.manufacturerProvidesLabel || false;
  document.getElementById('mf-shop-courier').checked = logistics.shopCanOrderCourier || false;
  document.getElementById('mf-courier-cost').value = logistics.shopCourierCost ?? 20;
  document.getElementById('mf-original-packaging').checked = logistics.originalPackagingRequired ?? true;
  document.getElementById('mf-substitute-packaging').checked = logistics.substitutePackagingAllowed ?? true;
  document.getElementById('mf-transport-protection').value = logistics.transportProtectionNote || '';
  document.getElementById('mf-product-condition').value = logistics.productConditionNote || '';

  const automation = m?.automation || {};
  document.getElementById('mf-auto-email').checked = automation.autoEmailEnabled || false;
  document.getElementById('mf-auto-reminders').checked = automation.autoReminders || false;
  document.getElementById('mf-auto-escalation').checked = automation.autoEscalation || false;
  document.getElementById('mf-auto-close').checked = automation.autoCloseEnabled || false;
  document.getElementById('mf-auto-close-days').value = automation.autoCloseDays ?? 30;

  renderBrandChips();
  openModal('modal-manufacturer');
}

function saveManufacturer() {
  const name = document.getElementById('mf-name').value.trim();
  if (!name) {
    showToast('Podaj nazwę producenta.');
    return;
  }

  const data = {
    name,
    country: document.getElementById('mf-country').value.trim(),
    nip: document.getElementById('mf-nip').value.trim(),
    address: document.getElementById('mf-address').value.trim(),
    active: document.getElementById('mf-active').checked,

    contactPerson: document.getElementById('mf-contact-person').value.trim(),
    contactPhone: document.getElementById('mf-phone').value.trim(),
    contactEmail: document.getElementById('mf-email').value.trim(),

    submissionMethod: document.getElementById('mf-method').value,
    portalUrl: document.getElementById('mf-portal').value.trim(),
    portalLogin: document.getElementById('mf-portal-login').value.trim(),
    portalPassword: document.getElementById('mf-portal-password').value,

    complaintProcedure: document.getElementById('mf-procedure').value.trim(),
    requiredDocumentsNote: document.getElementById('mf-docs').value.trim(),
    requiredPhotosNote: document.getElementById('mf-photos').value.trim(),
    requiredVideosNote: document.getElementById('mf-videos').value.trim(),
    maxPhotos: Number(document.getElementById('mf-max-photos').value) || 0,
    maxAttachmentSizeMb: Number(document.getElementById('mf-max-size').value) || 0,
    requiresSerialNumber: document.getElementById('mf-req-serial').checked,
    requiresFrameNumber: document.getElementById('mf-req-frame').checked,
    requiresProofOfPurchase: document.getElementById('mf-req-proof').checked,

    logistics: {
      returnAddress: document.getElementById('mf-return-address').value.trim(),
      transportOrganizer: document.getElementById('mf-transport-organizer').value,
      manufacturerProvidesLabel: document.getElementById('mf-manufacturer-label').checked,
      shopCanOrderCourier: document.getElementById('mf-shop-courier').checked,
      shopCourierCost: Number(document.getElementById('mf-courier-cost').value) || 0,
      originalPackagingRequired: document.getElementById('mf-original-packaging').checked,
      substitutePackagingAllowed: document.getElementById('mf-substitute-packaging').checked,
      transportProtectionNote: document.getElementById('mf-transport-protection').value.trim(),
      productConditionNote: document.getElementById('mf-product-condition').value.trim(),
    },
    automation: {
      autoEmailEnabled: document.getElementById('mf-auto-email').checked,
      autoReminders: document.getElementById('mf-auto-reminders').checked,
      autoEscalation: document.getElementById('mf-auto-escalation').checked,
      autoCloseEnabled: document.getElementById('mf-auto-close').checked,
      autoCloseDays: Number(document.getElementById('mf-auto-close-days').value) || 30,
    },
  };

  let manufacturerId = editingManufacturerId;
  if (editingManufacturerId) {
    const m = SMARTRMA_DATA.findManufacturer(editingManufacturerId);
    Object.assign(m, data);
    showToast('Dane producenta zaktualizowane.');
  } else {
    manufacturerId = 'm' + (SMARTRMA_DATA.manufacturers.length + 1) + '-' + Date.now();
    SMARTRMA_DATA.manufacturers.push({ id: manufacturerId, brandIds: [], ...data });
    showToast('Producent dodany.');
  }

  // Zsynchronizuj przypisanie marek: marki dodane w tej sesji (addBrandChip)
  // mogły mieć manufacturerId === null (nowy producent jeszcze nie miał
  // id) - domykamy to tutaj.
  editingBrandIds.forEach((brandId) => {
    const brand = SMARTRMA_DATA.findBrand(brandId);
    if (brand) brand.manufacturerId = manufacturerId;
  });
  const manufacturer = SMARTRMA_DATA.findManufacturer(manufacturerId);
  manufacturer.brandIds = editingBrandIds.slice();

  SMARTRMA_DATA.persist();
  closeModal('modal-manufacturer');
  renderTable();
}

function accessDeniedState() {
  return `
    <div class="empty-state" style="margin-top:60px;">
      <div class="icon-wrap">${ICONS.manufacturers}</div>
      <h4>Brak dostępu</h4>
      <p>Zarządzanie producentami jest dostępne dla ról Kierownik i Administrator.<br/>Zmień rolę w panelu bocznym, aby zobaczyć ten ekran.</p>
    </div>
  `;
}
