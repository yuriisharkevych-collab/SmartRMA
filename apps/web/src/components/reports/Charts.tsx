import type { MonthlyCount, NamedCount } from '@/api/reports.api';

/**
 * Wykresy budowane z SVG/CSS, bez biblioteki wykresów.
 *
 * Uzasadnienie: potrzebne są trzy typy (słupkowy, liniowy, udziałowy) na
 * płaskich danych po kilkanaście punktów. Recharts/Chart.js dokładają
 * ~150–500 kB do bundla i własny model tematyzacji, którego i tak trzeba by
 * dociągać do `design-system.css`. Tutaj wykresy używają wprost tych samych
 * zmiennych CSS co reszta aplikacji.
 */

const PALETTE = [
  'var(--primary)',
  'var(--blue)',
  'var(--amber)',
  'var(--green)',
  'var(--red)',
  'var(--gray)',
];

/** Wykres słupkowy poziomy — czytelny przy długich etykietach (nazwy statusów, produktów), w przeciwieństwie do pionowego. */
export function BarChart({
  data,
  emptyLabel = 'Brak danych w tym zakresie.',
}: {
  data: NamedCount[];
  emptyLabel?: string;
}) {
  if (data.length === 0) return <p className="text-sm text-muted">{emptyLabel}</p>;
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="chart-bars">
      {data.map((d, i) => (
        <div className="chart-bar-row" key={d.key}>
          <span className="chart-bar-label" title={d.label}>
            {d.label}
          </span>
          <div className="chart-bar-track">
            <div
              className="chart-bar-fill"
              style={{
                width: `${(d.count / max) * 100}%`,
                background: PALETTE[i % PALETTE.length],
              }}
            />
          </div>
          <span className="chart-bar-value">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

/** Wykres liniowy — reklamacje w czasie. SVG z `viewBox`, więc skaluje się do szerokości karty bez przeliczeń w JS. */
export function LineChart({ data }: { data: MonthlyCount[] }) {
  if (data.length === 0) return <p className="text-sm text-muted">Brak danych w tym zakresie.</p>;
  if (data.length === 1) {
    return (
      <p className="text-sm text-secondary">
        {data[0].month}: <strong>{data[0].count}</strong> — trend wymaga co najmniej dwóch miesięcy.
      </p>
    );
  }

  const W = 600;
  const H = 160;
  const PAD = 24;
  const max = Math.max(...data.map((d) => d.count), 1);
  const stepX = (W - PAD * 2) / (data.length - 1);
  const points = data.map((d, i) => ({
    x: PAD + i * stepX,
    y: H - PAD - (d.count / max) * (H - PAD * 2),
    ...d,
  }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const area = `${path} L ${points[points.length - 1].x} ${H - PAD} L ${points[0].x} ${H - PAD} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto' }}
      role="img"
      aria-label="Reklamacje w czasie"
    >
      <path d={area} fill="var(--primary-soft)" />
      <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" />
      {points.map((p) => (
        <g key={p.month}>
          <circle cx={p.x} cy={p.y} r={3.5} fill="var(--primary)" />
          <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize={10} fill="var(--text-secondary)">
            {p.count}
          </text>
          <text x={p.x} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
            {p.month.slice(5)}/{p.month.slice(2, 4)}
          </text>
        </g>
      ))}
    </svg>
  );
}

/**
 * Udział procentowy jako pasek składany, nie „donut".
 * Przy 2–6 kategoriach pasek jest łatwiejszy do odczytania (wartości leżą
 * obok siebie w legendzie) i nie wymaga liczenia łuków SVG.
 */
export function ShareChart({ data }: { data: NamedCount[] }) {
  if (data.length === 0) return <p className="text-sm text-muted">Brak danych w tym zakresie.</p>;
  const total = data.reduce((sum, d) => sum + d.count, 0) || 1;

  return (
    <div>
      <div className="chart-share-track">
        {data.map((d, i) => (
          <div
            key={d.key}
            className="chart-share-segment"
            style={{
              width: `${(d.count / total) * 100}%`,
              background: PALETTE[i % PALETTE.length],
            }}
            title={`${d.label}: ${d.count}`}
          />
        ))}
      </div>
      <div className="chart-legend">
        {data.map((d, i) => (
          <span className="chart-legend-item" key={d.key}>
            <span
              className="chart-legend-dot"
              style={{ background: PALETTE[i % PALETTE.length] }}
            />
            {d.label} — <strong>{d.count}</strong> ({Math.round((d.count / total) * 100)}%)
          </span>
        ))}
      </div>
    </div>
  );
}
