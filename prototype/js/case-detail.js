/* Szczegóły reklamacji — zakładki, zmiana statusu, decyzja, historia */

const WARRANTY_FLOW = ['Nowa', 'Przyjeta', 'Weryfikacja', 'GotowaDoWysylki', 'OczekiwanieNaKuriera', 'WyslanaDoProducenta', 'OczekiwanieNaDecyzjeProducenta', 'RealizacjaDecyzji', 'GotowaDoOdbioru', 'Zamknieta'];
const STATUTORY_FLOW = ['Nowa', 'Przyjeta', 'Weryfikacja', 'WeryfikacjaWewnetrzna', 'OczekiwanieNaDecyzjeKierownika', 'RealizacjaDecyzji', 'GotowaDoOdbioru', 'Zamknieta'];

// Poprawka UX - Iteracja 1, punkt 3: w prototypie "Zmień status" pozwala
// przeskoczyć do DOWOLNEGO statusu (nie tylko kolejnego w procesie), żeby
// szybko testować różne scenariusze bez przechodzenia całego workflow.
// Docelowa walidacja dozwolonych przejść (WARRANTY_FLOW/STATUTORY_FLOW
// powyżej) będzie egzekwowana dopiero w case-status.rules.ts po stronie
// backendu. Lista i kolejność statusów pochodzi teraz z jednego miejsca
// (SMARTRMA_DATA.ALL_STATUSES w data.js), współdzielonego z paskiem
// filtrów na Dashboardzie.
const ALL_STATUSES = SMARTRMA_DATA.ALL_STATUSES;

const NEXT_ACTION_BY_STATUS = {
  Nowa: 'Zweryfikuj kompletność zgłoszenia i przyjmij produkt od klienta.',
  Przyjeta: 'Sprawdź stan produktu i udokumentuj zdjęciami.',
  Weryfikacja: 'Zweryfikuj kompletność dokumentacji przed dalszym procesowaniem.',
  WeryfikacjaWewnetrzna: 'Przygotuj wewnętrzną ocenę sprawy (rękojmia).',
  GotowaDoWysylki: 'Przekaż produkt do wysyłki / kuriera.',
  OczekiwanieNaKuriera: 'Oczekiwanie na odbiór produktu przez kuriera.',
  WyslanaDoProducenta: 'Monitoruj odpowiedź producenta.',
  OczekiwanieNaDecyzjeProducenta: 'Oczekiwanie na decyzję producenta — sprawdź termin SLA.',
  OczekiwanieNaDecyzjeKierownika: 'Kierownik: podejmij decyzję w sprawie.',
  RealizacjaDecyzji: 'Zrealizuj podjętą decyzję (naprawa / wymiana / zwrot).',
  GotowaDoOdbioru: 'Powiadom klienta, że produkt jest gotowy do odbioru.',
  Zamknieta: null, Anulowana: null, Zarchiwizowana: null,
};

const HISTORY_ACTION_LABEL = {
  CaseCreated: 'Utworzono sprawę',
  StatusChanged: 'Zmieniono status',
  DocumentAdded: 'Dodano dokument',
  DocumentMarkedInvalid: 'Oznaczono dokument jako błędny',
  ManufacturerAssigned: 'Przypisano producenta',
  OwnerChanged: 'Zmieniono właściciela sprawy',
  DecisionSet: 'Ustawiono decyzję',
  NextActionUpdated: 'Zaktualizowano Next Action',
  ReplacementProductIssued: 'Wydano produkt zastępczy',
  ReplacementProductReturned: 'Zwrócono produkt zastępczy',
  CaseClosed: 'Zamknięto sprawę',
  CaseCancelled: 'Anulowano sprawę',
  CaseArchived: 'Zarchiwizowano sprawę',
  PortalEnabled: 'Włączono portal klienta',
  PortalDisabled: 'Wyłączono portal klienta',
  InfoRequested: 'Poproszono klienta o uzupełnienie danych',
};

let currentCaseId = null;

document.addEventListener('DOMContentLoaded', () => {
  initShell('cases', { showSearch: false });
  currentCaseId = new URLSearchParams(window.location.search).get('id');
  wireStaticModals();
  render();
});

// getFlow/getNextStatus nie są już wywoływane w UI (patrz ALL_STATUSES
// powyżej) - zostają jako czytelne odniesienie do docelowej, dwuścieżkowej
// logiki procesu, którą backend będzie egzekwował w case-status.rules.ts.
function getFlow(complaintType) {
  return complaintType === 'StatutoryWarranty' ? STATUTORY_FLOW : WARRANTY_FLOW;
}

function getNextStatus(c) {
  const flow = getFlow(c.complaintType);
  const idx = flow.indexOf(c.status);
  if (idx === -1 || idx === flow.length - 1) return null;
  return flow[idx + 1];
}

function isTerminal(status) {
  return ['Zamknieta', 'Anulowana', 'Zarchiwizowana'].includes(status);
}

function render() {
  const c = SMARTRMA_DATA.findCase(currentCaseId);
  const root = document.getElementById('content-root');

  if (!c) {
    root.innerHTML = `
      <div class="empty-state" style="margin-top:60px;">
        <div class="icon-wrap">${ICONS.cases}</div>
        <h4>Nie znaleziono sprawy</h4>
        <p>Sprawa o podanym identyfikatorze nie istnieje. Jeśli korzystałeś z przycisku „Resetuj dane demo”, mogła zostać usunięta razem z pozostałymi zmianami testowymi.</p>
        <a href="cases.html" class="btn btn-secondary mt-16">Wróć do listy reklamacji</a>
      </div>`;
    return;
  }

  const customer = SMARTRMA_DATA.findCustomer(c.customerId);
  const manufacturer = SMARTRMA_DATA.findManufacturer(c.product.manufacturerId);
  const owner = SMARTRMA_DATA.findUser(c.ownerId);
  const canDecide = ['OczekiwanieNaDecyzjeProducenta', 'OczekiwanieNaDecyzjeKierownika'].includes(c.status) && !c.decision;
  const decisionMinRole = c.complaintType === 'StatutoryWarranty' ? 'Kierownik,Administrator' : 'Pracownik,Kierownik,Administrator';

  root.innerHTML = `
    <div class="breadcrumb">
      <a href="cases.html">Reklamacje</a> <span>/</span> <span class="mono">${c.caseNumber}</span>
    </div>

    <div class="detail-header">
      <div>
        <div class="detail-title-row">
          <span class="detail-case-number mono">${c.caseNumber}</span>
          ${statusBadge(c.status)}
          ${complaintTypeTag(c.complaintType)}
          ${c.isException ? '<span class="badge badge-red">Nietypowa</span>' : ''}
        </div>
        <p class="page-subtitle mt-4">${c.product.model} · ${customer.firstName} ${customer.lastName} · utworzono ${SMARTRMA_DATA.formatDate(c.createdAt)}</p>
      </div>
      <div class="detail-actions">
        <button class="btn btn-secondary btn-sm" id="btn-print">Drukuj potwierdzenie</button>
        <button class="btn btn-secondary btn-sm" id="btn-email">Wyślij e-mail</button>
        <button class="btn btn-secondary btn-sm" id="btn-info-request" data-write-action>Poproś o uzupełnienie danych</button>
        ${canDecide ? `<button class="btn btn-secondary btn-sm" id="btn-decision" data-min-role="${decisionMinRole}" data-write-action>Ustaw decyzję</button>` : ''}
        <button class="btn btn-primary btn-sm" id="btn-status" data-write-action>Zmień status</button>
        ${!isTerminal(c.status) ? `<button class="btn btn-danger btn-sm" id="btn-cancel" data-write-action>Anuluj sprawę</button>` : ''}
      </div>
    </div>

    <div class="detail-grid">
      <div>
        <div class="tabs">
          <div class="tab active" data-tab="general">Ogólne</div>
          <div class="tab" data-tab="documents">Dokumenty</div>
          <div class="tab" data-tab="tasks">Zadania</div>
          <div class="tab" data-tab="history">Historia</div>
          <div class="tab" data-tab="comments">Komentarze</div>
        </div>

        <div class="tab-panel active" id="tab-general">
          <div class="card card-pad mt-16" style="margin-bottom:16px;">
            <h3 class="mt-4" style="margin-bottom:12px;">Klient</h3>
            <div class="kv-list">
              <div class="kv-row"><span class="kv-label">Imię i nazwisko</span><span class="kv-value">${customer.firstName} ${customer.lastName}</span></div>
              <div class="kv-row"><span class="kv-label">Telefon</span><span class="kv-value">${customer.phone}</span></div>
              <div class="kv-row"><span class="kv-label">E-mail</span><span class="kv-value">${customer.email || '—'}</span></div>
              <div class="kv-row"><span class="kv-label">Adres</span><span class="kv-value">${customer.address || '—'}</span></div>
            </div>
          </div>

          <div class="card card-pad" style="margin-bottom:16px;">
            <h3 style="margin-bottom:12px;">Produkt</h3>
            <div class="kv-list">
              <div class="kv-row"><span class="kv-label">Producent</span><span class="kv-value">${manufacturer ? manufacturer.name : '—'}</span></div>
              <div class="kv-row"><span class="kv-label">Model</span><span class="kv-value">${c.product.model}</span></div>
              <div class="kv-row"><span class="kv-label">Numer seryjny</span><span class="kv-value mono">${c.product.serialNumber || '—'}</span></div>
              <div class="kv-row"><span class="kv-label">Numer ramy</span><span class="kv-value mono">${c.product.frameNumber || '—'}</span></div>
              <div class="kv-row"><span class="kv-label">Data zakupu</span><span class="kv-value">${SMARTRMA_DATA.formatDate(c.product.purchaseDate)}</span></div>
              <div class="kv-row"><span class="kv-label">Dowód zakupu</span><span class="kv-value">${c.product.purchaseProofNumber || '—'}</span></div>
            </div>
          </div>

          <div class="card card-pad">
            <h3 style="margin-bottom:12px;">Zgłoszenie</h3>
            <div class="kv-list">
              <div class="kv-row"><span class="kv-label">Źródło zgłoszenia</span><span class="kv-value">${c.source || '—'}</span></div>
              <div class="kv-row"><span class="kv-label">Opis zgłoszenia</span><span class="kv-value">${c.description}</span></div>
              ${c.customerStatement ? `<div class="kv-row"><span class="kv-label">Treść zgłoszenia klienta</span><span class="kv-value">„${c.customerStatement}”</span></div>` : ''}
              <div class="kv-row"><span class="kv-label">Oczekiwane rozwiązanie</span><span class="kv-value">${c.requestedResolution}</span></div>
              <div class="kv-row"><span class="kv-label">Decyzja</span><span class="kv-value">${c.decision ? SMARTRMA_DATA.DECISION_META[c.decision] : '— nie podjęto —'}</span></div>
            </div>
          </div>
        </div>

        <div class="tab-panel" id="tab-documents">
          <div class="card card-pad">
            <div id="staff-documents-mount"></div>
            <p class="text-sm text-muted mt-16">Upload nowych dokumentów zostanie wdrożony w kolejnym etapie — poniżej podgląd dokumentów dostępnych już dla klienta w Portalu Klienta (współdzielony komponent).</p>
          </div>
        </div>

        <div class="tab-panel" id="tab-tasks">
          <div class="card">
            <div class="empty-state">
              <div class="icon-wrap">${ICONS.clock}</div>
              <h4>Moduł zadań poza zakresem prototypu</h4>
              <p>Automatyczne zadania wynikające ze zmiany statusu (BR-052) zostaną wdrożone w kolejnym etapie.</p>
            </div>
          </div>
        </div>

        <div class="tab-panel" id="tab-history">
          <div class="card card-pad">
            <div class="timeline">
              ${[...c.history].reverse().map((h) => historyItem(h)).join('')}
            </div>
          </div>
        </div>

        <div class="tab-panel" id="tab-comments">
          <div class="card">
            <div class="empty-state">
              <div class="icon-wrap">${ICONS.users}</div>
              <h4>Komentarze poza zakresem prototypu</h4>
              <p>Wewnętrzne notatki pracowników (niewidoczne dla klienta) zostaną wdrożone w kolejnym etapie.</p>
            </div>
          </div>
        </div>
      </div>

      <div>
        ${c.nextAction ? `
          <div class="next-action-panel" style="margin-bottom:16px;">
            <div class="eyebrow">Next Action</div>
            <p>${c.nextAction}</p>
            ${c.nextActionDueDate ? `<div class="due">Termin: ${SMARTRMA_DATA.formatDate(c.nextActionDueDate)}</div>` : ''}
          </div>
        ` : ''}

        <div class="card card-pad">
          <div class="kv-list">
            <div class="kv-row"><span class="kv-label">Właściciel sprawy</span><span class="kv-value">${owner ? owner.firstName + ' ' + owner.lastName : '—'}</span></div>
            <div class="kv-row"><span class="kv-label">Priorytet</span><span class="kv-value">${priorityBadge(c.priority)}</span></div>
            <div class="kv-row"><span class="kv-label">Wymaga akceptacji Kierownika</span><span class="kv-value">${c.requiresManagerApproval ? 'Tak' : 'Nie'}</span></div>
            <div class="kv-row"><span class="kv-label">Utworzono</span><span class="kv-value">${SMARTRMA_DATA.formatDateTime(c.createdAt)}</span></div>
            ${c.closedAt ? `<div class="kv-row"><span class="kv-label">Zamknięto</span><span class="kv-value">${SMARTRMA_DATA.formatDateTime(c.closedAt)}</span></div>` : ''}
          </div>
        </div>

        <div class="card card-pad mt-16">
          <h3 style="font-size:13.5px; margin-bottom:12px;">Portal klienta</h3>
          <div class="portal-toggle-row">
            <span class="text-sm">Dostęp klienta do statusu online</span>
            <label class="switch" data-write-action>
              <input type="checkbox" id="portal-toggle" ${c.clientPortalEnabled ? 'checked' : ''} />
              <span class="slider"></span>
            </label>
          </div>
          ${c.clientPortalEnabled ? `
            <div class="access-code-display">
              ${c.clientAccessCode || '—'}
              <button type="button" class="btn btn-ghost btn-sm" id="regen-code-btn" title="Wygeneruj nowy kod" style="margin-left:auto; padding:4px 8px;" data-write-action>Nowy kod</button>
            </div>
            <p class="text-sm text-muted mt-8">
              ${c.clientLastLogin ? `Ostatnie logowanie klienta: ${SMARTRMA_DATA.formatDateTime(c.clientLastLogin)}` : 'Klient jeszcze się nie zalogował.'}
            </p>
            <button type="button" class="btn btn-secondary btn-sm w-full mt-8" id="gen-link-btn" style="justify-content:center;" data-write-action>
              Wygeneruj bezpieczny link (jednorazowy)
            </button>
            <div id="secure-link-display" class="hidden mt-8">
              <div class="field">
                <label for="secure-link-input">Link do wysłania klientowi (e-mail / SMS)</label>
                <input type="text" id="secure-link-input" readonly class="mono" style="font-size:11px;" />
              </div>
              <button type="button" class="btn btn-ghost btn-sm" id="copy-link-btn">Kopiuj link</button>
              <p class="text-sm text-muted mt-4">Link jednorazowy — przestaje działać po pierwszym użyciu przez klienta.</p>
            </div>
          ` : `
            <p class="text-sm text-muted mt-8">Włącz, aby wygenerować kod dostępu i umożliwić klientowi sprawdzenie statusu online (kod jest też na potwierdzeniu przyjęcia, w kodzie QR).</p>
          `}
        </div>
      </div>
    </div>
  `;

  wireTabs();
  wireActions(c);
}

function historyItem(h) {
  const user = SMARTRMA_DATA.findUser(h.userId);
  const label = HISTORY_ACTION_LABEL[h.action] || h.action;
  const detail = h.previousValue && h.newValue
    ? `${(SMARTRMA_DATA.STATUS_META[h.previousValue]?.label) || h.previousValue} → ${(SMARTRMA_DATA.STATUS_META[h.newValue]?.label) || h.newValue}`
    : (h.newValue ? (SMARTRMA_DATA.STATUS_META[h.newValue]?.label || h.newValue) : '');
  return `
    <div class="timeline-item">
      <div class="timeline-dot-col">
        <div class="timeline-dot" style="background:transparent; font-size:13px; width:auto; height:auto;">${SMARTRMA_DATA.getHistoryIcon(h)}</div>
        <div class="timeline-line"></div>
      </div>
      <div class="timeline-content">
        <div class="timeline-action">${label}${detail ? ` — ${detail}` : ''}</div>
        <div class="timeline-meta">${user ? user.firstName + ' ' + user.lastName : 'System'} · ${SMARTRMA_DATA.formatDateTime(h.createdAt)}</div>
      </div>
    </div>
  `;
}

function wireTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

// Przyciski wewnątrz #content-root są tworzone od nowa przy każdym render()
// (nowe węzły DOM), więc addEventListener tutaj jest bezpieczny - nie
// nawarstwia się przy kolejnych renderach.
function wireActions(c) {
  applyRoleGates();

  const docsMount = document.getElementById('staff-documents-mount');
  if (docsMount) {
    const docs = c.documents || [];
    docsMount.innerHTML = docs.length
      ? docs.map((doc) => {
          const isConfirmation = doc.fileName.startsWith('Potwierdzenie przyjęcia');
          return renderDocumentCard(doc, isConfirmation ? { downloadHref: `case-print.html?id=${c.id}` } : {});
        }).join('')
      : `<div class="empty-state"><h4>Brak dokumentów</h4><p>Dokumenty pojawią się tutaj po dodaniu.</p></div>`;
    wireMockDocumentDownloads(docsMount);
  }

  document.getElementById('btn-print')?.addEventListener('click', () => {
    window.open(`case-print.html?id=${c.id}`, '_blank');
  });
  document.getElementById('btn-email')?.addEventListener('click', () => {
    showToast('Wysyłka e-mail będzie dostępna po wdrożeniu modułu powiadomień.');
  });

  document.getElementById('btn-info-request')?.addEventListener('click', () => {
    document.getElementById('modal-info-request-text').value = '';
    openModal('modal-info-request');
  });

  document.getElementById('btn-cancel')?.addEventListener('click', () => {
    if (!confirm(`Czy na pewno anulować sprawę ${c.caseNumber}?`)) return;
    c.history.push({ action: 'CaseCancelled', previousValue: c.status, newValue: 'Anulowana', userId: getCurrentUser().id, createdAt: new Date().toISOString() });
    c.status = 'Anulowana';
    c.nextAction = null;
    c.cancelledAt = new Date().toISOString();
    SMARTRMA_DATA.persist();
    showToast('Sprawa anulowana.');
    render();
  });

  document.getElementById('btn-status')?.addEventListener('click', () => {
    const select = document.getElementById('modal-status-select');
    select.innerHTML = ALL_STATUSES.map((s) =>
      `<option value="${s}" ${s === c.status ? 'selected' : ''}>${SMARTRMA_DATA.STATUS_META[s].label}</option>`
    ).join('');
    document.getElementById('modal-status-next-action').value = c.nextAction || NEXT_ACTION_BY_STATUS[c.status] || '';
    openModal('modal-status');
  });

  document.getElementById('btn-decision')?.addEventListener('click', () => openModal('modal-decision'));

  document.getElementById('portal-toggle')?.addEventListener('change', (e) => {
    c.clientPortalEnabled = e.target.checked;
    if (c.clientPortalEnabled && !c.clientAccessCode) {
      c.clientAccessCode = generateAccessCode();
    }
    c.history.push({
      action: c.clientPortalEnabled ? 'PortalEnabled' : 'PortalDisabled',
      userId: getCurrentUser().id,
      createdAt: new Date().toISOString(),
      visibleForCustomer: false,
    });
    SMARTRMA_DATA.persist();
    showToast(c.clientPortalEnabled ? 'Portal klienta włączony. Wygenerowano kod dostępu.' : 'Portal klienta wyłączony.');
    render();
  });

  document.getElementById('regen-code-btn')?.addEventListener('click', () => {
    if (!confirm('Wygenerować nowy kod dostępu? Poprzedni kod przestanie działać.')) return;
    c.clientAccessCode = generateAccessCode();
    SMARTRMA_DATA.persist();
    showToast('Wygenerowano nowy kod dostępu.');
    render();
  });

  document.getElementById('gen-link-btn')?.addEventListener('click', () => {
    c.clientAccessToken = generateSecureToken();
    c.clientAccessTokenUsed = false;
    SMARTRMA_DATA.persist();

    const link = `${window.location.origin}${window.location.pathname.replace('case-detail.html', '')}client-login.html?case=${encodeURIComponent(c.caseNumber)}&token=${c.clientAccessToken}`;
    const input = document.getElementById('secure-link-input');
    input.value = link;
    document.getElementById('secure-link-display').classList.remove('hidden');
    showToast('Wygenerowano jednorazowy link. Skopiuj i wyślij klientowi.');
  });

  document.getElementById('copy-link-btn')?.addEventListener('click', () => {
    const input = document.getElementById('secure-link-input');
    input.select();
    navigator.clipboard?.writeText(input.value).then(
      () => showToast('Link skopiowany do schowka.'),
      () => showToast('Nie udało się skopiować - zaznacz i skopiuj ręcznie (Ctrl+C).'),
    );
  });
}

// BACKEND TODO (Code Review pkt 1 i 11): token bezpiecznego linku musi być
// generowany kryptograficznie bezpiecznie po stronie serwera (np.
// crypto.randomBytes), zapisywany jako hash (analogicznie do
// clientAccessCodeHash) i mieć czas wygaśnięcia. Poniższa implementacja
// (Math.random) służy WYŁĄCZNIE do demonstracji przepływu UX w prototypie
// i nie nadaje się do produkcji.
function generateSecureToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = '';
  for (let i = 0; i < 12; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

// Format zgodny z danymi demo w data.js (np. "RM4-8821") - w produkcji ten
// kod byłby generowany i hashowany po stronie backendu (patrz
// CLIENT_PORTAL_DATABASE.md: clientAccessCodeHash), a jawna wartość
// pokazana pracownikowi tylko raz, w momencie wygenerowania.
function generateAccessCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const l1 = letters[Math.floor(Math.random() * letters.length)];
  const l2 = letters[Math.floor(Math.random() * letters.length)];
  const digit = Math.floor(Math.random() * 10);
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `${l1}${l2}${digit}-${suffix}`;
}

// Przyciski WEWNĄTRZ modali (modal-status-save, modal-decision-save) żyją
// w statycznym HTML poza #content-root - nie są odtwarzane przy render(),
// więc podpinamy je RAZ tutaj. Wcześniejsza wersja robiła to w wireActions()
// (uruchamianym po każdym render()), co nawarstwiało listenery i po kilku
// zmianach statusu zapisywało wpis historii wielokrotnie za jedno kliknięcie.
function wireStaticModals() {
  document.getElementById('modal-status-select').addEventListener('change', (e) => {
    document.getElementById('modal-status-next-action').value = NEXT_ACTION_BY_STATUS[e.target.value] || '';
  });

  document.getElementById('modal-status-save').addEventListener('click', () => {
    const c = SMARTRMA_DATA.findCase(currentCaseId);
    if (!c) return;
    const next = document.getElementById('modal-status-select').value;
    const nextAction = document.getElementById('modal-status-next-action').value.trim();
    c.history.push({ action: 'StatusChanged', previousValue: c.status, newValue: next, userId: getCurrentUser().id, createdAt: new Date().toISOString() });
    c.status = next;
    c.nextAction = nextAction || null;
    if (next === 'Zamknieta') c.closedAt = new Date().toISOString();
    SMARTRMA_DATA.persist();
    closeModal('modal-status');
    showToast(`Status zmieniony na „${SMARTRMA_DATA.STATUS_META[next].label}”.`);
    render();
  });

  document.getElementById('modal-decision-save').addEventListener('click', () => {
    const c = SMARTRMA_DATA.findCase(currentCaseId);
    if (!c) return;
    const decision = document.getElementById('modal-decision-select').value;
    c.decision = decision;
    c.decisionAt = new Date().toISOString();
    if (decision === 'ZwrotSrodkow' || decision === 'Odrzucenie') {
      c.requiresManagerApproval = true;
    }
    c.history.push({ action: 'DecisionSet', newValue: decision, userId: getCurrentUser().id, createdAt: new Date().toISOString() });
    SMARTRMA_DATA.persist();
    closeModal('modal-decision');
    showToast('Decyzja zapisana.');
    render();
  });

  // Zadanie: "pracownik sklepu powinien mieć możliwość wysłania klientowi
  // prośby o uzupełnienie brakujących danych bez konieczności zakładania
  // nowej reklamacji" - wpis do CaseHistory (visibleForCustomer: true,
  // widoczny w Portalu Klienta) + mock e-mail, bez tworzenia nowej sprawy.
  document.querySelectorAll('.info-request-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const textarea = document.getElementById('modal-info-request-text');
      const prefix = textarea.value.trim() ? textarea.value.trim() + ', ' : 'Prosimy o przesłanie: ';
      textarea.value = prefix + chip.dataset.text;
    });
  });

  document.getElementById('modal-info-request-send').addEventListener('click', () => {
    const c = SMARTRMA_DATA.findCase(currentCaseId);
    if (!c) return;
    const message = document.getElementById('modal-info-request-text').value.trim();
    if (!message) {
      showToast('Opisz, czego potrzebujesz od klienta.');
      return;
    }
    c.history.push({
      action: 'InfoRequested', newValue: message, userId: getCurrentUser().id,
      createdAt: new Date().toISOString(), visibleForCustomer: true,
    });
    c.nextAction = 'Oczekiwanie na uzupełnienie danych przez klienta.';
    SMARTRMA_DATA.persist();
    // BACKEND TODO: realna wysyłka e-mail do klienta z treścią prośby.
    console.info(`[MOCK EMAIL] Prośba o uzupełnienie danych (sprawa ${c.caseNumber}) wysłana do klienta: „${message}”.`);
    closeModal('modal-info-request');
    showToast('Prośba wysłana do klienta.');
    render();
  });
}
