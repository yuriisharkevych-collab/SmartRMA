/* Portal Klienta — główny ekran po zalogowaniu.

   Architektura (Code Review, Finalizacja modułu):
   - pkt 1: cała wiedza o CaseStatus żyje w PUBLIC_STATUS_MAPPER
     (public-status-mapper.js) - ten plik NIGDY nie porównuje c.status
     z literałem statusu wewnętrznego, tylko woła
     PUBLIC_STATUS_MAPPER.describe(c.status).
   - pkt 2: cały tekst widoczny dla klienta pochodzi z t()/CLIENT_LABELS
     (client-labels.js) - zero tekstu wpisanego wprost w tym pliku.
   - pkt 8 (przygotowanie do React): każda funkcja render*Panel poniżej
     odpowiada 1:1 przyszłemu komponentowi React (np. statusPanel(c) ->
     <StatusPanel case={c} />) - przyjmuje dane, zwraca widok, nie ma
     efektów ubocznych poza czytaniem z SMARTRMA_DATA. Jedyne miejsca ze
     stanem (activeTab, currentCase) odpowiadałyby w React useState().

   Portal jest WYŁĄCZNIE do odczytu: jedyny zapis do danych sprawy w całym
   module to `clientLastLogin`/`clientAccessTokenUsed` w client-login.js -
   efekt uboczny sesji, nie edycja treści reklamacji. */

let currentCase = null;
let activeTab = 'status';

const TABS = [
  { key: 'status', labelKey: 'nav_status', icon: 'circle' },
  { key: 'history', labelKey: 'nav_history', icon: 'clock' },
  { key: 'documents', labelKey: 'nav_documents', icon: 'file' },
  { key: 'contact', labelKey: 'nav_contact', icon: 'mail' },
];

const TAB_ICONS = {
  circle: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>',
  clock: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  file: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3v5a1 1 0 0 0 1 1h5"/><path d="M6 3h8l6 6v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/></svg>',
  mail: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
};

document.addEventListener('DOMContentLoaded', () => {
  const id = new URLSearchParams(window.location.search).get('id');
  const session = getSession();

  if (!id || !session || session.caseId !== id) {
    window.location.href = 'client-login.html';
    return;
  }

  const c = SMARTRMA_DATA.findCase(id);
  if (!c || !c.clientPortalEnabled) {
    window.location.href = 'client-login.html';
    return;
  }

  currentCase = c;
  document.getElementById('header-case-number').textContent = c.caseNumber;
  document.getElementById('logout-btn').textContent = t('action_logout');
  document.getElementById('logout-btn').addEventListener('click', logout);

  render();
});

function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem('smartrma_client_session'));
  } catch (e) {
    return null;
  }
}

function logout() {
  sessionStorage.removeItem('smartrma_client_session');
  window.location.href = 'client-login.html';
}

function render() {
  renderTabs(document.getElementById('public-main'), true);
  renderTabs(document.getElementById('mobile-tab-bar'), false);
  renderActivePanel();
}

// Odpowiednik <TabBar activeTab={activeTab} onChange={switchTab} /> w React.
function renderTabs(container, withPanelMount) {
  const tabsHtml = TABS.map((tab) => `
    <button type="button" class="public-tab ${tab.key === activeTab ? 'active' : ''}"
      role="tab" aria-selected="${tab.key === activeTab}" aria-controls="panel-mount" id="tab-btn-${tab.key}"
      data-tab="${tab.key}">
      ${TAB_ICONS[tab.icon]}
      <span>${t(tab.labelKey)}</span>
    </button>
  `).join('');

  if (withPanelMount) {
    container.innerHTML = `
      <div class="public-tabs" role="tablist" aria-label="Sekcje reklamacji" id="desktop-tabs">${tabsHtml}</div>
      <div id="panel-mount" role="tabpanel" aria-labelledby="tab-btn-${activeTab}" tabindex="0"></div>
    `;
    wireTabButtons(container.querySelector('#desktop-tabs'));
  } else {
    container.setAttribute('role', 'tablist');
    container.setAttribute('aria-label', 'Sekcje reklamacji (skrót)');
    container.innerHTML = tabsHtml;
    wireTabButtons(container);
  }
}

function wireTabButtons(scope) {
  scope.querySelectorAll('.public-tab').forEach((node) => {
    node.addEventListener('click', () => switchTab(node.dataset.tab));
  });
}

function switchTab(key) {
  activeTab = key;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderActivePanel() {
  const mount = document.getElementById('panel-mount');
  if (activeTab === 'status') mount.innerHTML = statusPanel(currentCase);
  else if (activeTab === 'history') mount.innerHTML = historyPanel(currentCase);
  else if (activeTab === 'documents') mount.innerHTML = documentsPanel(currentCase);
  else if (activeTab === 'contact') mount.innerHTML = contactPanel(currentCase);

  if (activeTab === 'documents') wireMockDocumentDownloads(mount);
  if (activeTab === 'contact') wireContactForm();
}

/* --------------------------------------------------------------------------
   <StatusPanel case={c} /> - stepper 5 etapów + procentowy postęp +
   szczegółowy opis. CAŁA logika "co status X oznacza" pochodzi z
   PUBLIC_STATUS_MAPPER.describe() - ta funkcja tylko renderuje wynik.
   ------------------------------------------------------------------------ */

function statusPanel(c) {
  const owner = SMARTRMA_DATA.findUser(c.ownerId);
  const view = PUBLIC_STATUS_MAPPER.describe(c.status);

  if (view.special) {
    return `
      <div class="public-card">
        <span class="badge badge-gray">${view.title}</span>
        <p class="mt-16" style="font-size:13.5px; color:var(--text-secondary);">
          ${view.detail} ${t('status_special_contact_hint')}
        </p>
      </div>
      ${ownerCard(owner)}
    `;
  }

  const stepperHtml = view.stages.map((stage) => {
    const dotContent = stage.state === 'done'
      ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="m5 12 5 5 9-9"/></svg>'
      : view.stages.indexOf(stage) + 1;
    const stateLabelKey = stage.state === 'done' ? 'aria_stage_done' : stage.state === 'current' ? 'aria_stage_current' : 'aria_stage_future';
    return `
      <div class="stage-step ${stage.state}" role="listitem" aria-label="${stage.label}, ${t(stateLabelKey)}">
        <div class="line"></div>
        <div class="dot" aria-hidden="true">${dotContent}</div>
        <div class="label">${stage.label}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="public-card">
      <h3 style="font-size:14.5px; margin-bottom:2px;">${t('status_panel_title')}</h3>
      <p class="text-sm text-muted">${t('nav_status')}: ${c.caseNumber} · ${SMARTRMA_DATA.formatDate(c.createdAt)}</p>

      <div class="stage-stepper mt-20" role="list" aria-label="Etapy procesu reklamacyjnego">${stepperHtml}</div>

      <div class="progress-track" role="progressbar" aria-valuenow="${view.progress}" aria-valuemin="0" aria-valuemax="100" aria-label="${t('status_progress_label')}">
        <div class="progress-fill" style="width:${view.progress}%;"></div>
      </div>
      <div class="progress-label">
        <span>${t('status_progress_label')}</span>
        <span>${view.progress}%</span>
      </div>

      <p class="stage-current-desc">${view.detail}</p>
    </div>

    <div class="public-card">
      <h3 style="font-size:13.5px; margin-bottom:12px;">${t('status_details_title')}</h3>
      <div class="kv-list">
        <div class="kv-row"><span class="kv-label">${t('status_field_product')}</span><span class="kv-value">${c.product.model}</span></div>
        <div class="kv-row"><span class="kv-label">${t('status_field_type')}</span><span class="kv-value">${t('complaint_type_' + c.complaintType)}</span></div>
        <div class="kv-row"><span class="kv-label">${t('status_field_resolution')}</span><span class="kv-value">${c.requestedResolution}</span></div>
        ${c.decision ? `<div class="kv-row"><span class="kv-label">${t('status_field_decision')}</span><span class="kv-value">${t('decision_' + c.decision)}</span></div>` : ''}
      </div>
    </div>

    ${ownerCard(owner)}
  `;
}

// <OwnerCard owner={owner} /> - reużywane w Status i Kontakt.
function ownerCard(owner) {
  if (!owner) return '';
  return `
    <div class="public-card">
      <h3 style="font-size:13.5px; margin-bottom:12px;">${t('contact_owner_title')}</h3>
      <div class="contact-person-card">
        <div class="avatar" aria-hidden="true">${SMARTRMA_DATA.initials(owner)}</div>
        <div>
          <div style="font-weight:600; font-size:13.5px;">${owner.firstName} ${owner.lastName}</div>
          <div class="text-sm text-muted">${t('contact_owner_role')}</div>
        </div>
      </div>
    </div>
  `;
}

/* --------------------------------------------------------------------------
   <HistoryPanel case={c} /> - tylko wpisy widoczne dla klienta, grupowane
   wg daty (Code Review, Finalizacja modułu, pkt 4: "Dzisiaj"/"Wczoraj"/
   data). Grupowanie liczy SMARTRMA_DATA.groupHistoryByDate() - ta funkcja
   tylko renderuje gotowe grupy.
   ------------------------------------------------------------------------ */

function historyPanel(c) {
  const visible = SMARTRMA_DATA.getCustomerVisibleHistory(c).slice().reverse();

  if (visible.length === 0) {
    return `
      <div class="public-card">
        <div class="empty-state">
          <h4>${t('history_empty_title')}</h4>
          <p>${t('history_empty_desc')}</p>
        </div>
      </div>
    `;
  }

  const groups = SMARTRMA_DATA.groupHistoryByDate(visible);

  return groups.map((group) => `
    <div class="public-card">
      <div class="date-group-label">${group.label}</div>
      <div class="timeline">
        ${group.entries.map((h) => `
          <div class="timeline-item">
            <div class="timeline-dot-col">
              <div class="timeline-dot" style="background:transparent; font-size:14px; width:auto; height:auto;" aria-hidden="true">${SMARTRMA_DATA.getHistoryIcon(h)}</div>
              <div class="timeline-line"></div>
            </div>
            <div class="timeline-content">
              <div class="timeline-action">${t('history_action_' + h.action)}</div>
              ${h.action === 'InfoRequested' && h.newValue ? `<div class="text-sm text-secondary mt-4">${h.newValue}</div>` : ''}
              <div class="timeline-meta">${SMARTRMA_DATA.formatDateTime(h.createdAt)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

/* --------------------------------------------------------------------------
   <DocumentsPanel case={c} /> - renderuje c.documents przez WSPÓLNY
   komponent renderDocumentCard (app.js), gotowy pod przyszły podgląd
   PDF/zdjęć/dokumentów producenta/protokołów/decyzji (Code Review,
   Finalizacja modułu, pkt 3 - patrz komentarz przy renderDocumentCard).
   ------------------------------------------------------------------------ */

function documentsPanel(c) {
  const docs = c.documents || [];

  if (docs.length === 0) {
    return `
      <div class="public-card">
        <div class="empty-state">
          <h4>${t('documents_empty_title')}</h4>
          <p>${t('documents_empty_desc')}</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="public-card">
      <h3 style="font-size:13.5px; margin-bottom:12px;">${t('documents_title')}</h3>
      ${docs.map((doc) => {
        const isConfirmation = doc.category === 'confirmation';
        return renderDocumentCard(doc, isConfirmation ? { downloadHref: `case-print.html?id=${c.id}` } : {});
      }).join('')}
    </div>
  `;
}

/* --------------------------------------------------------------------------
   <ContactPanel case={c} /> - dane opiekuna, dane sklepu, formularz.
   BACKEND TODO: POST /api/client/contact (CLIENT_PORTAL_API.md) - patrz
   wireContactForm().
   ------------------------------------------------------------------------ */

function contactPanel(c) {
  const owner = SMARTRMA_DATA.findUser(c.ownerId);
  const customer = SMARTRMA_DATA.findCustomer(c.customerId);

  return `
    ${ownerCard(owner)}

    <div class="public-card">
      <h3 style="font-size:13.5px; margin-bottom:12px;">${t('contact_shop_title')}</h3>
      <div class="kv-list">
        <div class="kv-row"><span class="kv-label">${t('contact_shop_phone_label')}</span><span class="kv-value">22 000 00 00</span></div>
        <div class="kv-row"><span class="kv-label">${t('contact_shop_email_label')}</span><span class="kv-value">reklamacje@sklep.example</span></div>
        <div class="kv-row"><span class="kv-label">${t('contact_shop_hours_label')}</span><span class="kv-value">${t('contact_shop_hours_value')}</span></div>
      </div>
    </div>

    <div class="public-card" id="contact-card">
      <h3 style="font-size:13.5px; margin-bottom:12px;">${t('contact_form_title')}</h3>
      <div id="contact-form-mount">
        ${contactFormHtml(customer, c)}
      </div>
      <div id="contact-success" class="hidden" role="status" aria-live="polite">
        <div class="flex items-center gap-10" style="color:var(--green);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
          <strong style="font-size:13.5px;">${t('contact_success_title')}</strong>
        </div>
        <p class="text-sm text-muted mt-8">${t('contact_success_desc')}</p>
        <button type="button" class="btn btn-ghost btn-sm mt-8" id="send-another-btn">${t('contact_send_another')}</button>
      </div>
    </div>
  `;
}

function contactFormHtml(customer, c) {
  return `
    <form id="contact-form" style="display:flex; flex-direction:column; gap:12px;">
      <div class="field">
        <label for="contact-name">${t('contact_field_name')}</label>
        <input type="text" id="contact-name" value="${customer.firstName} ${customer.lastName}" />
      </div>
      <div class="field">
        <label for="contact-message">${t('contact_field_message')}</label>
        <textarea id="contact-message" rows="3" placeholder="${t('contact_message_placeholder', { caseNumber: c.caseNumber })}" required aria-required="true"></textarea>
      </div>
      <button type="submit" class="btn btn-primary" style="align-self:flex-start;">${t('contact_submit')}</button>
    </form>
  `;
}

// BACKEND TODO: docelowo POST /api/client/contact. Interfejs poniżej jest
// już zgodny z tym kontraktem (imię + treść wiadomości + numer sprawy) -
// podłączenie prawdziwego wysyłania to zamiana zawartości tej funkcji na
// fetch(), bez zmian w HTML/UX.
function wireContactForm() {
  document.getElementById('contact-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = document.getElementById('contact-message').value.trim();
    if (!message) return;

    document.getElementById('contact-form-mount').classList.add('hidden');
    document.getElementById('contact-success').classList.remove('hidden');
    showToast(t('toast_message_sent'));

    document.getElementById('send-another-btn').addEventListener('click', () => {
      document.getElementById('contact-success').classList.add('hidden');
      document.getElementById('contact-form-mount').classList.remove('hidden');
      document.getElementById('contact-form-mount').innerHTML = contactFormHtml(
        SMARTRMA_DATA.findCustomer(currentCase.customerId), currentCase,
      );
      wireContactForm();
      document.getElementById('contact-message').focus();
    });
  });
}
