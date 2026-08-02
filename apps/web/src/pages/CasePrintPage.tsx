import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { casesApi, type CaseSummary } from '@/api/cases.api';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { ArrowLeftIcon } from '@/components/common/icons';
import { useCaseLookups } from '@/hooks/useCaseLookups';
import { SOURCE_LABELS } from '@/lib/case-labels';
import { COMPLAINT_TYPE_LABELS, formatDate } from '@/lib/case-filters';

/**
 * Odpowiednik `case-print.html` + `js/case-print.js` — potwierdzenie
 * przyjęcia reklamacji w dwóch egzemplarzach (klient + sklep).
 *
 * PDF powstaje przez natywny druk przeglądarki (`window.print()` → „Zapisz
 * jako PDF"), tak jak w prototypie — zero dodatkowych zależności.
 *
 * Strona renderuje się BEZ powłoki aplikacji (sidebar/topbar) — trasa leży
 * poza `AppLayout`, dokładnie jak `case-print.html` był osobnym plikiem bez
 * `.app-shell`.
 */
export function CasePrintPage() {
  const { id } = useParams<{ id: string }>();
  const caseId = id!;
  const lookups = useCaseLookups();

  const {
    data: caseRecord,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => casesApi.getById(caseId),
    retry: false,
  });

  useEffect(() => {
    if (caseRecord) document.title = `Potwierdzenie ${caseRecord.caseNumber} — SmartRMA AI`;
  }, [caseRecord]);

  if (isLoading) return <LoadingIndicator />;

  if (isError || !caseRecord) {
    return (
      <div className="print-wrap">
        <div className="print-copy">
          <p>Nie znaleziono sprawy o podanym identyfikatorze.</p>
          <Link to="/cases" className="btn btn-secondary mt-16">
            Wróć do listy reklamacji
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="print-toolbar no-print">
        <Link to={`/cases/${caseId}`} className="btn btn-ghost btn-sm">
          <ArrowLeftIcon />
          Wróć do sprawy
        </Link>
        <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
          Drukuj / Zapisz jako PDF
        </button>
      </div>

      <div className="print-wrap">
        <PrintCopy caseRecord={caseRecord} lookups={lookups} copyLabel="Egzemplarz dla klienta" />
        <PrintCopy caseRecord={caseRecord} lookups={lookups} copyLabel="Egzemplarz dla sklepu" />
      </div>
    </>
  );
}

function PrintCopy({
  caseRecord: c,
  lookups,
  copyLabel,
}: {
  caseRecord: CaseSummary;
  lookups: ReturnType<typeof useCaseLookups>;
  copyLabel: string;
}) {
  const customer = lookups.customerById.get(c.customerId);
  const item = c.items[0];
  const product = item ? lookups.productById.get(item.productId) : undefined;

  return (
    <div className="print-copy">
      <div className="print-header">
        <div className="print-brand">
          <div className="sidebar-brand-mark">R</div>
          <div>
            <div className="sidebar-brand-text" style={{ fontSize: 14 }}>
              Smart<span>RMA</span> AI
            </div>
            <div className="print-title">Potwierdzenie przyjęcia reklamacji</div>
          </div>
        </div>
        <span className="print-copy-label">{copyLabel}</span>
      </div>

      <div className="print-section">
        <div className="print-grid">
          <PrintField label="Numer sprawy" value={c.caseNumber} mono />
          <PrintField label="Data przyjęcia" value={formatDate(c.createdAt)} />
          <PrintField
            label="Rodzaj reklamacji"
            value={COMPLAINT_TYPE_LABELS[c.complaintType] ?? c.complaintType}
          />
          <PrintField label="Źródło zgłoszenia" value={SOURCE_LABELS[c.source] ?? c.source} />
        </div>
      </div>

      <div className="print-section">
        <h4>Dane klienta</h4>
        <div className="print-grid">
          <PrintField
            label="Imię i nazwisko"
            value={customer ? `${customer.firstName} ${customer.lastName}` : '—'}
          />
          <PrintField label="Telefon" value={customer?.phone ?? '—'} />
          <PrintField label="E-mail" value={customer?.email ?? '—'} />
          <PrintField label="Adres" value={customer?.address ?? '—'} />
        </div>
      </div>

      <div className="print-section">
        <h4>Dane produktu</h4>
        <div className="print-grid">
          <PrintField label="Producent" value={lookups.manufacturerName(item?.manufacturerId)} />
          <PrintField label="Model" value={product?.name ?? '—'} />
          <PrintField label="Numer seryjny" value={item?.serialNumber ?? '—'} mono />
          <PrintField label="Numer ramy" value={item?.frameNumber ?? '—'} mono />
          <PrintField label="Data zakupu" value={formatDate(item?.purchaseDate ?? null)} />
          <PrintField label="Dowód zakupu" value={item?.purchaseProofNumber ?? '—'} />
        </div>
      </div>

      <div className="print-section">
        <h4>Opis usterki</h4>
        <p style={{ fontSize: 13 }}>{c.description ?? item?.description ?? '—'}</p>
      </div>

      <div className="print-section">
        <h4>Oczekiwany sposób rozwiązania</h4>
        <p style={{ fontSize: 13 }}>{c.requestedResolution ?? '—'}</p>
      </div>

      <div className="print-footer-row">
        <div className="signatures">
          <div className="signature-block">
            <div className="signature-line">Podpis klienta</div>
          </div>
          <div className="signature-block">
            <div className="signature-line">Podpis pracownika przyjmującego</div>
          </div>
        </div>
        <div className="qr-placeholder">
          <span>QR</span>
          <span>status online</span>
        </div>
      </div>
    </div>
  );
}

function PrintField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="print-field">
      <span className="l">{label}</span>
      <span className={`v ${mono ? 'mono' : ''}`}>{value}</span>
    </div>
  );
}
