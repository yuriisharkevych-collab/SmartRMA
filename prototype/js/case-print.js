/* Potwierdzenie przyjęcia reklamacji — 2 egzemplarze do wydruku/PDF.
   UX Review Iteracja 2, punkty 4 i 5:
   - PDF: generowany przez natywny druk przeglądarki (window.print() +
     "Zapisz jako PDF") zamiast biblioteki JS do PDF - zero dodatkowych
     zależności, w pełni zgodne z wymaganiem "tylko HTML/CSS/JS".
   - Kod QR: na etapie prototypu to zaprojektowane miejsce (placeholder),
     zgodnie z notatką w UX_REVIEW_ITERATION_2.md - realna generacja kodu
     QR (link do portalu klienta) to zakres przyszłego etapu (patrz
     docs/DECISIONS.md, "Portal klienta"). */

document.addEventListener('DOMContentLoaded', () => {
  const id = new URLSearchParams(window.location.search).get('id');
  const c = SMARTRMA_DATA.findCase(id);
  const wrap = document.getElementById('print-wrap');

  if (!c) {
    wrap.innerHTML = `
      <div class="print-copy">
        <p>Nie znaleziono sprawy o podanym identyfikatorze.</p>
        <a href="cases.html" class="btn btn-secondary mt-16">Wróć do listy reklamacji</a>
      </div>
    `;
    return;
  }

  document.getElementById('back-link').href = `case-detail.html?id=${c.id}`;
  document.title = `Potwierdzenie ${c.caseNumber} — SmartRMA AI`;

  wrap.innerHTML = [
    printCopy(c, 'Egzemplarz dla klienta'),
    printCopy(c, 'Egzemplarz dla sklepu'),
  ].join('');
  wireQrLinks(c.caseNumber);

  document.getElementById('btn-print-now').addEventListener('click', () => window.print());
});

function printCopy(c, copyLabel) {
  const customer = SMARTRMA_DATA.findCustomer(c.customerId);
  const manufacturer = SMARTRMA_DATA.findManufacturer(c.product.manufacturerId);
  const typeLabel = SMARTRMA_DATA.COMPLAINT_TYPE_META[c.complaintType]?.label || c.complaintType;

  return `
    <div class="print-copy">
      <div class="print-header">
        <div class="print-brand">
          <div class="sidebar-brand-mark">R</div>
          <div>
            <div class="sidebar-brand-text" style="font-size:14px;">Smart<span>RMA</span> AI</div>
            <div class="print-title">Potwierdzenie przyjęcia reklamacji</div>
          </div>
        </div>
        <span class="print-copy-label">${copyLabel}</span>
      </div>

      <div class="print-section">
        <div class="print-grid">
          <div class="print-field"><span class="l">Numer sprawy</span><span class="v mono">${c.caseNumber}</span></div>
          <div class="print-field"><span class="l">Data przyjęcia</span><span class="v">${SMARTRMA_DATA.formatDate(c.createdAt)}</span></div>
          <div class="print-field"><span class="l">Rodzaj reklamacji</span><span class="v">${typeLabel}</span></div>
          <div class="print-field"><span class="l">Źródło zgłoszenia</span><span class="v">${c.source || '—'}</span></div>
        </div>
      </div>

      <div class="print-section">
        <h4>Dane klienta</h4>
        <div class="print-grid">
          <div class="print-field"><span class="l">Imię i nazwisko</span><span class="v">${customer.firstName} ${customer.lastName}</span></div>
          <div class="print-field"><span class="l">Telefon</span><span class="v">${customer.phone}</span></div>
          <div class="print-field"><span class="l">E-mail</span><span class="v">${customer.email || '—'}</span></div>
          <div class="print-field"><span class="l">Adres</span><span class="v">${customer.address || '—'}</span></div>
        </div>
      </div>

      <div class="print-section">
        <h4>Dane produktu</h4>
        <div class="print-grid">
          <div class="print-field"><span class="l">Producent</span><span class="v">${manufacturer ? manufacturer.name : '—'}</span></div>
          <div class="print-field"><span class="l">Model</span><span class="v">${c.product.model}</span></div>
          <div class="print-field"><span class="l">Numer seryjny</span><span class="v mono">${c.product.serialNumber || '—'}</span></div>
          <div class="print-field"><span class="l">Numer ramy</span><span class="v mono">${c.product.frameNumber || '—'}</span></div>
          <div class="print-field"><span class="l">Data zakupu</span><span class="v">${SMARTRMA_DATA.formatDate(c.product.purchaseDate)}</span></div>
          <div class="print-field"><span class="l">Dowód zakupu</span><span class="v">${c.product.purchaseProofNumber || '—'}</span></div>
        </div>
      </div>

      <div class="print-section">
        <h4>Opis usterki</h4>
        <p style="font-size:13px;">${c.description}</p>
      </div>

      <div class="print-section">
        <h4>Oczekiwany sposób rozwiązania</h4>
        <p style="font-size:13px;">${c.requestedResolution}</p>
      </div>

      <div class="print-footer-row">
        <div class="signatures">
          <div class="signature-block">
            <div class="signature-line">Podpis klienta</div>
          </div>
          <div class="signature-block">
            <div class="signature-line">Podpis pracownika przyjmującego</div>
          </div>
        </div>
        <div class="qr-placeholder" id="qr-link-${copyLabel === 'Egzemplarz dla klienta' ? 'client' : 'store'}">
          <span>QR</span>
          <span>status online</span>
        </div>
      </div>
    </div>
  `;
}

function wireQrLinks(caseNumber) {
  // Placeholder jest klikalny na ekranie (prowadzi do logowania klienta
  // z wypełnionym numerem sprawy) - w druku to tylko wizualne miejsce na
  // prawdziwy kod QR, który w produkcji zakoduje ten sam link.
  document.querySelectorAll('.qr-placeholder').forEach((el) => {
    el.style.cursor = 'pointer';
    el.title = 'W prototypie: przejdź do logowania klienta';
    el.addEventListener('click', () => {
      window.open(`client-login.html?case=${encodeURIComponent(caseNumber)}`, '_blank');
    });
  });
}
