import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { casesApi, type CaseSummary } from '@/api/cases.api';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { PermissionGate } from '@/components/common/PermissionGate';
import { ClockIcon, PlusIcon } from '@/components/common/icons';
import { useAuth } from '@/hooks/useAuth';
import { useCaseLookups } from '@/hooks/useCaseLookups';
import { useCaseStatuses } from '@/hooks/useCaseStatuses';
import { formatDate, isB2B, isOpenCase, isOverdue } from '@/lib/case-filters';

type Source = 'all' | 'b2b' | 'b2c';

/**
 * Etap 2 (Dashboard Producenta/Dystrybutora) — świadomie OSOBNY komponent od
 * `DashboardPage.tsx` (Sklep), nie gałąź warunkowa w jednym pliku: zestaw
 * kafelków jest fundamentalnie inny (Nowe/Wymagające reakcji/Oczekujące na
 * partnera/klienta/producenta/Po terminie/Zakończone, nie Gotowe do odbioru/
 * Moje sprawy), więc dzielenie jednego komponentu wymagałoby gęstej sieci
 * warunków. Oba komponenty renderują się pod TĄ SAMĄ ścieżką `/` — wybór
 * między nimi robi `DashboardRouter.tsx` na podstawie `Company.type`.
 *
 * KLUCZOWA ZASADA (wymóg właściciela): żadna liczba na kafelku nie jest
 * liczona osobnym zapytaniem SQL — wszystkie liczone TU, w pamięci, z
 * DOKŁADNIE tej samej tablicy spraw (`GET /cases`) i DOKŁADNIE tych samych
 * predykatów (`isB2B`/`isOverdue`/status===kod), których używa
 * `CasesListPage.tsx` do filtrowania listy pod `?filter=`. Kafelek "B2B: 12"
 * i kliknięcie w niego NIE MOGĄ się rozjechać, bo to dosłownie ta sama
 * funkcja wywołana na tych samych danych w obu miejscach — nie dwie
 * niezależne implementacje, które mogłyby przez pomyłkę przestać się zgadzać.
 */
export function DistributorDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const caseStatuses = useCaseStatuses();
  const lookups = useCaseLookups();

  const [source, setSource] = useState<Source>('all');

  const { data: cases, isLoading } = useQuery({
    queryKey: ['cases'],
    queryFn: casesApi.list,
    refetchInterval: 30_000,
  });

  const all = cases ?? [];
  const b2bTotal = all.filter((c) => isB2B(c)).length;
  const b2cTotal = all.length - b2bTotal;

  const scoped = useMemo(() => {
    if (source === 'b2b') return all.filter((c) => isB2B(c));
    if (source === 'b2c') return all.filter((c) => !isB2B(c));
    return all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, source]);

  const finalCodes = caseStatuses.finalStatusCodes;

  const buckets = [
    {
      filter: 'new',
      label: 'Nowe',
      value: scoped.filter((c) => c.status === 'Nowa').length,
      accent: '',
      trend: 'Jeszcze nieprzyjęte przez pracownika',
    },
    {
      filter: 'attention',
      label: 'Wymagające reakcji',
      value: scoped.filter((c) => c.needsAttention).length,
      accent: 'accent-amber',
      trend: 'Brak zmiany statusu lub zbyt długo od zgłoszenia',
    },
    {
      filter: 'waitingForPartner',
      label: 'Oczekujące na partnera',
      value: scoped.filter((c) => c.status === 'OczekiwanieNaPartnera').length,
      accent: '',
      trend: 'Czekamy na firmę, która zgłosiła sprawę',
    },
    {
      filter: 'waitingForCustomer',
      label: 'Oczekujące na klienta',
      value: scoped.filter((c) => c.waitingForCustomer).length,
      accent: '',
      trend: 'Poprosiliśmy klienta o uzupełnienie danych',
    },
    {
      filter: 'waitingForManufacturer',
      label: 'Oczekujące na producenta',
      value: scoped.filter((c) => c.status === 'PrzekazanaDoProducenta').length,
      accent: '',
      trend: 'Przekazane do producenta / dystrybutora',
    },
    {
      filter: 'overdue',
      label: 'Po terminie',
      value: scoped.filter((c) => isOverdue(c, finalCodes)).length,
      accent: 'accent-red',
      trend: 'Next Action po terminie',
    },
    {
      filter: 'closed',
      label: 'Zakończone',
      value: scoped.filter((c) => finalCodes.has(c.status)).length,
      accent: '',
      trend: 'Łącznie zamkniętych spraw',
    },
  ];

  const recent = [...scoped]
    .filter((c) => isOpenCase(c, finalCodes))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  function tileHref(filter: string): string {
    return source === 'all'
      ? `/cases?filter=${filter}`
      : `/cases?filter=${filter}&origin=${source}`;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Witaj{user?.firstName ? `, ${user.firstName}` : ''}</h1>
          <p className="page-subtitle">
            {cases
              ? `${all.length} reklamacji łącznie — ${b2bTotal} B2B, ${b2cTotal} B2C.`
              : 'Co się dzieje z Twoimi reklamacjami.'}
          </p>
        </div>
        <PermissionGate permissions={['cases.create']}>
          <Link to="/cases/new" className="btn btn-primary">
            <PlusIcon />
            Nowa reklamacja
          </Link>
        </PermissionGate>
      </div>

      <div className="tabs mb-16" role="tablist" aria-label="Źródło spraw">
        {(
          [
            { key: 'all', label: 'Wszystkie', count: all.length },
            { key: 'b2b', label: 'B2B', count: b2bTotal },
            { key: 'b2c', label: 'B2C', count: b2cTotal },
          ] as const
        ).map((tab) => (
          <div
            key={tab.key}
            className={`tab ${source === tab.key ? 'active' : ''}`}
            onClick={() => setSource(tab.key)}
            role="tab"
            aria-selected={source === tab.key}
            tabIndex={0}
          >
            {tab.label} ({tab.count})
          </div>
        ))}
      </div>

      {isLoading && <LoadingIndicator />}

      {cases && (
        <div className="stat-grid">
          {buckets.map((tile) => (
            <Link
              key={tile.filter}
              to={tileHref(tile.filter)}
              className={`stat-card ${tile.accent}`}
              style={{ display: 'block', cursor: 'pointer' }}
            >
              <div className="stat-card-label">{tile.label}</div>
              <div className="stat-card-value">{tile.value}</div>
              <div className="stat-card-trend">{tile.trend}</div>
            </Link>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3>Ostatnie zgłoszenia {source !== 'all' ? `(${source.toUpperCase()})` : ''}</h3>
          <Link
            to={source === 'all' ? '/cases?filter=open' : `/cases?filter=open&origin=${source}`}
            className="btn btn-ghost btn-sm"
          >
            Zobacz wszystkie
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState title="Brak otwartych spraw" description="Wszystko obsłużone." />
        ) : (
          recent.map((c) => (
            <RecentRow
              key={c.id}
              caseRecord={c}
              productName={lookups.productById.get(c.items[0]?.productId ?? '')?.name}
              customer={lookups.customerById.get(c.customerId)}
              statusLabel={caseStatuses.statusLabel(c.status)}
              statusTone={caseStatuses.statusTone(c.status)}
              onClick={() => navigate(`/cases/${c.id}`)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function RecentRow({
  caseRecord,
  productName,
  customer,
  statusLabel,
  statusTone,
  onClick,
}: {
  caseRecord: CaseSummary;
  productName: string | undefined;
  customer: { firstName: string; lastName: string } | undefined;
  statusLabel: string;
  statusTone: string;
  onClick: () => void;
}) {
  const reporter =
    caseRecord.reportedByPartnerCompanyName ??
    (customer ? `${customer.firstName} ${customer.lastName}` : '—');

  return (
    <div
      className="kv-row"
      onClick={onClick}
      style={{ cursor: 'pointer', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}
    >
      <div style={{ flex: 1 }}>
        <div className="flex items-center gap-8">
          <span className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>
            {caseRecord.caseNumber}
          </span>
          <span
            className="tag"
            style={
              isB2B(caseRecord)
                ? { borderColor: 'var(--primary)', color: 'var(--primary)' }
                : undefined
            }
          >
            {isB2B(caseRecord) ? 'B2B' : 'B2C'}
          </span>
          <span className={`badge badge-${statusTone}`}>{statusLabel}</span>
        </div>
        <div className="mt-4" style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
          {reporter} — {productName ?? '—'}
        </div>
      </div>
      <span className="cell-secondary">{formatDate(caseRecord.createdAt)}</span>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <div className="icon-wrap">
        <ClockIcon />
      </div>
      <h4>{title}</h4>
      <p>{description}</p>
    </div>
  );
}
