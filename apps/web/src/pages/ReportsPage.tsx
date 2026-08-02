import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { reportsApi, type ReportOverview } from '@/api/reports.api';
import { BarChart, LineChart, ShareChart } from '@/components/reports/Charts';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { useToast } from '@/hooks/useToast';

type PresetKey = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: 'today', label: 'Dziś' },
  { key: 'week', label: 'Tydzień' },
  { key: 'month', label: 'Miesiąc' },
  { key: 'quarter', label: 'Kwartał' },
  { key: 'year', label: 'Rok' },
  { key: 'custom', label: 'Własny zakres' },
];

/**
 * Presety rozwijane po stronie frontendu na konkretne daty — backend zna
 * wyłącznie `from`/`to`, więc preset i zakres własny idą tą samą ścieżką i
 * nie ma dwóch interpretacji tego, gdzie kończy się „miesiąc".
 */
function resolvePreset(preset: PresetKey): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'today':
      return { from: startOfDay, to };
    case 'week': {
      // Tydzień od poniedziałku (norma w PL), nie od niedzieli.
      const dayOfWeek = (now.getDay() + 6) % 7;
      return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek), to };
    }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to };
    case 'quarter':
      return { from: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1), to };
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1), to };
    default:
      return { from: new Date(now.getFullYear(), now.getMonth() - 11, 1), to };
  }
}

function fmtDays(value: number | null): string {
  return value === null ? '—' : `${value} dni`;
}

function fmtMoney(value: string): string {
  return `${Number(value).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}

function pctLabel(part: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

/**
 * Raporty zarządcze. Każda sekcja odpowiada na konkretne pytanie właściciela
 * lub kierownika serwisu — dlatego nie ma tu wykresu dla samego wykresu:
 * dane liczbowe (tabele) dominują, a wykres pojawia się tylko tam, gdzie
 * kształt danych faktycznie coś mówi (udział, trend, ranking).
 */
export function ReportsPage() {
  const { showToast } = useToast();
  const [preset, setPreset] = useState<PresetKey>('year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const range = useMemo(() => {
    if (preset === 'custom' && customFrom && customTo) {
      return { from: new Date(customFrom), to: new Date(`${customTo}T23:59:59`) };
    }
    return resolvePreset(preset);
  }, [preset, customFrom, customTo]);

  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports-overview', fromIso, toIso],
    queryFn: () => reportsApi.overview(fromIso, toIso),
  });

  async function handleExportCsv() {
    setExporting(true);
    try {
      await reportsApi.exportCsv(fromIso, toIso);
      showToast('Raport pobrany — plik otworzy się w Excelu.');
    } catch {
      showToast('Nie udało się pobrać raportu.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Raporty</h1>
          <p className="page-subtitle">
            {data
              ? `${new Date(data.from).toLocaleDateString('pl-PL')} – ${new Date(data.to).toLocaleDateString('pl-PL')}`
              : 'Wskaźniki zarządcze dla wybranego zakresu.'}
          </p>
        </div>
        <div className="detail-actions report-controls">
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExportCsv}
            disabled={exporting || !data}
          >
            {exporting ? 'Pobieranie…' : 'Eksport Excel (CSV)'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => window.print()}
            disabled={!data}
          >
            Eksport PDF (drukuj)
          </button>
        </div>
      </div>

      <div className="card report-controls" style={{ marginBottom: 16 }}>
        <div className="table-toolbar">
          <div className="filter-tabs">
            {PRESETS.map((p) => (
              <div
                key={p.key}
                className={`filter-tab ${preset === p.key ? 'active' : ''}`}
                onClick={() => setPreset(p.key)}
                role="button"
                tabIndex={0}
              >
                {p.label}
              </div>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex gap-8 items-center">
              <input
                type="date"
                className="toolbar-select"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                aria-label="Data od"
              />
              <span className="text-sm text-muted">–</span>
              <input
                type="date"
                className="toolbar-select"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-label="Data do"
              />
            </div>
          )}
        </div>
      </div>

      {isLoading && <LoadingIndicator />}
      {isError && (
        <div className="empty-state">
          <h4>Nie udało się pobrać raportów</h4>
          <p>Sprawdź uprawnienie „reports.view" albo spróbuj ponownie.</p>
        </div>
      )}

      {data && <ReportBody data={data} />}
    </div>
  );
}

function ReportBody({ data }: { data: ReportOverview }) {
  const noData = data.totalCases === 0;

  return (
    <>
      <div className="kpi-grid">
        <Kpi label="Reklamacje" value={data.totalCases} hint="w wybranym zakresie" />
        <Kpi
          label="Zamknięte"
          value={data.closedCases}
          hint={`${pctLabel(data.closedCases, data.totalCases)} wszystkich`}
        />
        <Kpi label="Otwarte" value={data.openCases} hint="w toku procesu" />
        <Kpi
          label="Przeterminowane"
          value={data.overdueCases}
          hint="Next Action po terminie"
          accent={data.overdueCases > 0 ? 'var(--red)' : undefined}
        />
        <Kpi
          label="Średni czas obsługi"
          value={fmtDays(data.avgResolutionDays)}
          hint="od zgłoszenia do zamknięcia"
        />
        <Kpi
          label="Naruszenia SLA"
          value={data.sla.breaches}
          hint={`z ${data.sla.measured} zmierzonych odpowiedzi`}
          accent={data.sla.breaches > 0 ? 'var(--red)' : undefined}
        />
      </div>

      {noData && (
        <div className="empty-state">
          <h4>Brak reklamacji w tym zakresie</h4>
          <p>Zmień zakres dat, aby zobaczyć dane.</p>
        </div>
      )}

      {!noData && (
        <>
          <div className="report-grid">
            <Card title="Gwarancja / rękojmia" question="Ile spraw rozstrzyga producent, a ile my?">
              <ShareChart data={data.byComplaintType} />
            </Card>
            <Card
              title="Źródło zgłoszenia"
              question="Którym kanałem klienci faktycznie zgłaszają reklamacje?"
            >
              <BarChart data={data.bySource} />
            </Card>
          </div>

          <div className="report-grid">
            <Card title="Reklamacje w czasie" question="Czy liczba reklamacji rośnie?">
              <LineChart data={data.byMonth} />
            </Card>
            <Card title="Statusy" question="Gdzie stoją sprawy w procesie?">
              <BarChart data={data.byStatus.slice(0, 8)} />
            </Card>
          </div>

          <Card
            title="Producenci"
            question="Który producent uznaje reklamacje, a który zwleka i odrzuca?"
            full
          >
            {data.manufacturers.length === 0 ? (
              <p className="text-sm text-muted">Brak pozycji z przypisanym producentem.</p>
            ) : (
              <Table
                head={[
                  'Producent',
                  'Sprawy',
                  'Uznane',
                  'Odrzucone',
                  '% uznanych',
                  'Śr. odpowiedź',
                  'Śr. zamknięcie',
                  'Próg SLA',
                  'Naruszenia',
                ]}
                rows={data.manufacturers.map((m) => [
                  m.name,
                  m.caseCount,
                  m.accepted,
                  m.rejected,
                  m.acceptanceRate === null ? '—' : `${m.acceptanceRate}%`,
                  fmtDays(m.avgResponseDays),
                  fmtDays(m.avgResolutionDays),
                  m.slaResponseDays === null ? '—' : `${m.slaResponseDays} dni`,
                  m.slaBreaches > 0 ? (
                    <span className="badge badge-red">{m.slaBreaches}</span>
                  ) : (
                    '0'
                  ),
                ])}
              />
            )}
          </Card>

          <div className="report-grid">
            <Card title="Pracownicy" question="Kto jest przeciążony i komu zalegają sprawy?">
              {data.employees.length === 0 ? (
                <p className="text-sm text-muted">Brak spraw z przypisanym opiekunem.</p>
              ) : (
                <Table
                  head={[
                    'Pracownik',
                    'Prowadzi',
                    'Zamknięte',
                    'Otwarte',
                    'Po terminie',
                    'Śr. czas',
                  ]}
                  rows={data.employees.map((e) => [
                    e.name,
                    e.total,
                    e.closed,
                    e.open,
                    e.overdue > 0 ? <span className="badge badge-red">{e.overdue}</span> : '0',
                    fmtDays(e.avgResolutionDays),
                  ])}
                />
              )}
            </Card>

            <Card
              title="Sklepy"
              question="Który oddział generuje najwięcej reklamacji i jak je domyka?"
            >
              {data.shops.length === 0 ? (
                <p className="text-sm text-muted">Żadna sprawa nie ma przypisanego sklepu.</p>
              ) : (
                <Table
                  head={['Sklep', 'Reklamacje', 'Zamknięte', '% zamkniętych', 'Śr. czas']}
                  rows={data.shops.map((s) => [
                    s.name,
                    s.total,
                    s.closed,
                    s.closeRate === null ? '—' : `${s.closeRate}%`,
                    fmtDays(s.avgResolutionDays),
                  ])}
                />
              )}
            </Card>
          </div>

          <div className="report-grid">
            <Card
              title="Najczęściej reklamowane produkty"
              question="Który towar psuje się najczęściej — może warto go wycofać?"
            >
              <BarChart
                data={data.topProducts.map((p) => ({ key: p.id, label: p.name, count: p.count }))}
              />
            </Card>
            <Card
              title="Najczęściej reklamowane marki"
              question="Która marka ciągnie statystyki w dół?"
            >
              <BarChart
                data={data.topBrands.map((b) => ({ key: b.id, label: b.name, count: b.count }))}
                emptyLabel="Produkty nie mają przypisanych marek."
              />
            </Card>
          </div>

          <Card title="Finanse" question="Ile realnie kosztują nas reklamacje?" full>
            <div className="kpi-grid" style={{ marginBottom: 12 }}>
              <Kpi
                label="Wartość reklamowanego towaru"
                value={fmtMoney(data.finance.productValue)}
                hint={`${data.finance.pricedItems} z ${data.finance.totalItems} pozycji z ceną`}
              />
              <Kpi
                label="Koszty transportu"
                value={fmtMoney(data.finance.logisticsCost)}
                hint="z rejestru logistyki"
              />
              <Kpi label="Wymiany" value={data.finance.replacements} hint="produkt lub część" />
              <Kpi label="Naprawy" value={data.finance.repairs} />
              <Kpi label="Zwroty środków" value={data.finance.refunds} />
            </div>
            <div
              className="card card-pad"
              style={{ background: 'var(--surface-sunken)', borderStyle: 'dashed' }}
            >
              <strong className="text-sm">Pokrycie danych</strong>
              <ul className="text-sm text-secondary" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {data.finance.coverageNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          </Card>
        </>
      )}
    </>
  );
}

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

/** `question` jest częścią interfejsu celowo — sama nazwa raportu nie mówi, po co się na niego patrzy. */
function Card({
  title,
  question,
  children,
  full,
}: {
  title: string;
  question: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className="card card-pad" style={full ? { marginBottom: 16 } : undefined}>
      <h3 style={{ fontSize: 14.5 }}>{title}</h3>
      <p className="text-sm text-muted" style={{ marginBottom: 14 }}>
        {question}
      </p>
      {children}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ cursor: 'default' }}>
              {r.map((cell, j) => (
                <td key={j} className={j === 0 ? 'cell-primary' : 'cell-secondary'}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
