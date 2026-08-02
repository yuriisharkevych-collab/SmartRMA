import { ReportOverviewEntity } from './entities/report-overview.entity';

/** `;` — separator, którego Excel w polskiej lokalizacji oczekuje domyślnie (przecinek trafiłby w całości do jednej kolumny). */
const SEP = ';';

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // Liczby zmiennoprzecinkowe: przecinek dziesiętny, żeby Excel PL potraktował je jako liczby, nie tekst.
  const normalized = typeof value === 'number' ? text.replace('.', ',') : text;
  return /[";\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
}

function row(...values: unknown[]): string {
  return values.map(cell).join(SEP);
}

function section(title: string, header: string[], rows: unknown[][]): string[] {
  return ['', title, row(...header), ...rows.map((r) => row(...r))];
}

/**
 * Jeden plik z wszystkimi raportami, rozdzielonymi nagłówkami sekcji —
 * właściciel dostaje komplet w jednym arkuszu zamiast ośmiu osobnych plików
 * do ręcznego sklejania.
 */
export function buildOverviewCsv(o: ReportOverviewEntity): string {
  const lines: string[] = [
    'SmartRMA — raport zarządczy',
    row('Zakres od', o.from.toISOString().slice(0, 10)),
    row('Zakres do', o.to.toISOString().slice(0, 10)),
    '',
    'PODSUMOWANIE',
    row('Wszystkie reklamacje', o.totalCases),
    row('Zamknięte', o.closedCases),
    row('Otwarte', o.openCases),
    row('Przeterminowane', o.overdueCases),
    row('Średni czas obsługi (dni)', o.avgResolutionDays ?? '—'),
  ];

  lines.push(
    ...section(
      'REKLAMACJE WG TYPU',
      ['Typ', 'Liczba'],
      o.byComplaintType.map((r) => [r.label, r.count]),
    ),
  );
  lines.push(
    ...section(
      'REKLAMACJE WG STATUSU',
      ['Status', 'Liczba'],
      o.byStatus.map((r) => [r.label, r.count]),
    ),
  );
  lines.push(
    ...section(
      'REKLAMACJE WG ŹRÓDŁA',
      ['Źródło', 'Liczba'],
      o.bySource.map((r) => [r.label, r.count]),
    ),
  );
  lines.push(
    ...section(
      'REKLAMACJE WG MIESIĄCA',
      ['Miesiąc', 'Liczba'],
      o.byMonth.map((r) => [r.month, r.count]),
    ),
  );

  lines.push(
    ...section(
      'PRODUCENCI',
      [
        'Producent',
        'Sprawy',
        'Uznane',
        'Odrzucone',
        '% uznanych',
        'Śr. odpowiedź (dni)',
        'Śr. zamknięcie (dni)',
        'Próg SLA (dni)',
        'Naruszenia SLA',
      ],
      o.manufacturers.map((m) => [
        m.name,
        m.caseCount,
        m.accepted,
        m.rejected,
        m.acceptanceRate ?? '—',
        m.avgResponseDays ?? '—',
        m.avgResolutionDays ?? '—',
        m.slaResponseDays ?? '—',
        m.slaBreaches,
      ]),
    ),
  );

  lines.push(
    ...section(
      'PRACOWNICY',
      [
        'Pracownik',
        'Prowadzone',
        'Zamknięte',
        'Otwarte',
        'Przeterminowane',
        'Śr. czas obsługi (dni)',
      ],
      o.employees.map((e) => [
        e.name,
        e.total,
        e.closed,
        e.open,
        e.overdue,
        e.avgResolutionDays ?? '—',
      ]),
    ),
  );

  lines.push(
    ...section(
      'SKLEPY',
      ['Sklep', 'Reklamacje', 'Zamknięte', '% zamkniętych', 'Śr. czas obsługi (dni)'],
      o.shops.map((s) => [
        s.name,
        s.total,
        s.closed,
        s.closeRate ?? '—',
        s.avgResolutionDays ?? '—',
      ]),
    ),
  );

  lines.push(
    ...section(
      'NAJCZĘŚCIEJ REKLAMOWANE PRODUKTY',
      ['Produkt', 'Liczba'],
      o.topProducts.map((p) => [p.name, p.count]),
    ),
  );
  lines.push(
    ...section(
      'NAJCZĘŚCIEJ REKLAMOWANE MARKI',
      ['Marka', 'Liczba'],
      o.topBrands.map((b) => [b.name, b.count]),
    ),
  );

  lines.push(
    ...section(
      'SLA',
      ['Wskaźnik', 'Wartość'],
      [
        ['Naruszenia SLA', o.sla.breaches],
        ['Sprawy z policzonym czasem odpowiedzi', o.sla.measured],
        ['Średni czas odpowiedzi (dni)', o.sla.avgResponseDays ?? '—'],
        ['Średni czas zamknięcia (dni)', o.sla.avgResolutionDays ?? '—'],
      ],
    ),
  );

  lines.push(
    ...section(
      'FINANSE',
      ['Wskaźnik', 'Wartość'],
      [
        ['Wartość reklamowanych produktów (zł)', o.finance.productValue.replace('.', ',')],
        ['Pozycje z ceną', `${o.finance.pricedItems} z ${o.finance.totalItems}`],
        ['Koszty transportu (zł)', o.finance.logisticsCost.replace('.', ',')],
        ['Wymiany', o.finance.replacements],
        ['Naprawy', o.finance.repairs],
        ['Zwroty środków', o.finance.refunds],
      ],
    ),
  );

  lines.push('', 'UWAGI O POKRYCIU DANYCH', ...o.finance.coverageNotes.map((n) => row(n)));

  return lines.join('\r\n');
}
