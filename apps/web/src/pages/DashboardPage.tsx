import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { casesApi, type CaseSummary } from '@/api/cases.api';
import { dashboardApi, type DashboardSource } from '@/api/dashboard.api';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { PermissionGate } from '@/components/common/PermissionGate';
import { ClockIcon, PlusIcon } from '@/components/common/icons';
import { useAuth } from '@/hooks/useAuth';
import { useCaseStatuses } from '@/hooks/useCaseStatuses';
import { daysUntil, isDueToday, isOpenCase, isOverdue } from '@/lib/case-filters';

/**
 * Odpowiednik `dashboard.html` + `js/dashboard.js`.
 *
 * Kafelki są linkami do `/cases?filter=…` — dokładnie jak w prototypie, gdzie
 * każdy `.stat-card` był `<a href="cases.html?filter=…">`. Backend liczy 5
 * wskaźników (prototyp miał 4), więc doszły filtry `ready`/`mine` — patrz
 * `CASE_FILTERS` w `lib/case-filters.ts`. Kafelek "Oczekiwanie na klienta"
 * (Status Workflow Refactor) został usunięty — status, na którym się opierał,
 * nie ma już odpowiednika w nowym katalogu statusów.
 *
 * Sekcje "Sprawy wymagające uwagi" i "Zadania na dziś" liczone są po stronie
 * klienta z `GET /cases`, tak jak prototyp liczył je z `SMARTRMA_DATA.cases`
 * — `/dashboard/summary` zwraca wyłącznie zagregowane liczby, nie listy.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const caseStatuses = useCaseStatuses();

  // Producent/Dystrybutor + Partnerzy B2B (Faza 6) — przełącznik Wszystkie/B2B/B2C.
  // `all` zachowuje dokładnie dotychczasowe zachowanie (zero zmiany dla firm bez
  // ani jednego przekazania B2B).
  const [source, setSource] = useState<DashboardSource>('all');

  // Odświeżanie co 30s — dashboard bywa otwarty na stałe (np. na ekranie w sklepie),
  // a bez tego nowe/zmienione sprawy pojawiały się dopiero po ręcznym przeładowaniu strony.
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['dashboard-summary', source],
    queryFn: () => dashboardApi.getSummary(source),
    refetchInterval: 30_000,
  });
  const { data: cases } = useQuery({
    queryKey: ['cases'],
    queryFn: casesApi.list,
    refetchInterval: 30_000,
  });

  const casesForSource = (cases ?? []).filter((c) =>
    source === 'all'
      ? true
      : source === 'b2b'
        ? c.originType === 'PartnerB2B'
        : c.originType === 'DirectCustomer',
  );
  const openCases = casesForSource.filter((c) => isOpenCase(c, caseStatuses.finalStatusCodes));
  const overdueCases = casesForSource.filter((c) => isOverdue(c, caseStatuses.finalStatusCodes));
  const dueTodayCases = casesForSource.filter((c) => isDueToday(c, caseStatuses.finalStatusCodes));

  const tiles = summary
    ? [
        {
          filter: 'open',
          label: 'Sprawy otwarte',
          value: summary.totalActive,
          accent: 'accent-primary',
          trend: 'Łącznie w toku procesu reklamacyjnego',
        },
        {
          filter: 'overdue',
          label: 'Przeterminowane',
          value: summary.overdue,
          accent: 'accent-red',
          trend: 'Next Action po terminie',
        },
        {
          filter: 'today',
          label: 'Zadania na dziś',
          value: summary.dueToday,
          accent: 'accent-amber',
          trend: 'Termin Next Action mija dzisiaj',
        },
        {
          filter: 'ready',
          label: 'Gotowe do odbioru',
          value: summary.readyForPickup,
          accent: '',
          trend: 'Czekają na odbiór przez klienta',
        },
        {
          filter: 'mine',
          label: 'Moje sprawy',
          value: summary.myCases,
          accent: '',
          trend: 'Przypisane do Ciebie jako opiekuna',
        },
        {
          filter: 'unread',
          label: 'Nieodczytane wiadomości',
          value: summary.unreadMessages,
          accent: 'accent-red',
          trend: 'Klient napisał — wymaga odpowiedzi',
        },
        {
          filter: 'attention',
          label: 'Sprawy wymagające reakcji',
          value: summary.casesNeedingAttention,
          accent: summary.casesNeedingAttention > 0 ? 'accent-amber' : '',
          trend: 'Brak zmiany statusu lub zbyt długo od zgłoszenia',
        },
      ]
    : [];

  // Prototyp: otwarte sprawy z ustawionym terminem, rosnąco wg terminu, maks. 6.
  const attention = openCases
    .filter((c) => c.nextActionDueDate)
    .sort(
      (a, b) => new Date(a.nextActionDueDate!).getTime() - new Date(b.nextActionDueDate!).getTime(),
    )
    .slice(0, 6);

  const todayItems = [...dueTodayCases, ...overdueCases].slice(0, 6);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Witaj{user?.firstName ? `, ${user.firstName}` : ''}</h1>
          <p className="page-subtitle">
            {summary
              ? `Masz ${summary.totalActive} otwartych spraw, w tym ${summary.overdue} przeterminowanych.`
              : 'Oto co wymaga Twojej uwagi.'}
          </p>
        </div>
        <PermissionGate permissions={['cases.create']}>
          <Link to="/cases/new" className="btn btn-primary">
            <PlusIcon />
            Nowa reklamacja
          </Link>
        </PermissionGate>
      </div>

      {/* Producent/Dystrybutor + Partnerzy B2B (Faza 6) — przełącznik Wszystkie/B2B/B2C. Liczby w nawiasach to CAŁKOWITA liczba spraw danego pochodzenia (niezależna od przełącznika), patrz `DashboardSummary.directCustomerTotal/partnerB2BTotal`. */}
      {summary && (
        <div className="tabs mb-16" role="tablist" aria-label="Źródło spraw">
          {(
            [
              {
                key: 'all',
                label: 'Wszystkie',
                count: summary.directCustomerTotal + summary.partnerB2BTotal,
              },
              { key: 'b2c', label: 'B2C', count: summary.directCustomerTotal },
              { key: 'b2b', label: 'B2B', count: summary.partnerB2BTotal },
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
      )}

      {loadingSummary && <LoadingIndicator />}

      {summary && (
        <div className="stat-grid">
          {tiles.map((tile) => (
            <Link
              key={tile.filter}
              to={`/cases?filter=${tile.filter}`}
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

      <div className="detail-grid" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
        <div className="card">
          <div className="card-header">
            <h3>Sprawy wymagające Twojej uwagi</h3>
            <Link to="/cases" className="btn btn-ghost btn-sm">
              Zobacz wszystkie
            </Link>
          </div>
          {attention.length === 0 ? (
            <EmptyState
              title="Brak spraw wymagających uwagi"
              description="Wszystkie sprawy są aktualne."
            />
          ) : (
            attention.map((c) => (
              <AttentionRow key={c.id} caseRecord={c} onClick={() => navigate(`/cases/${c.id}`)} />
            ))
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Zadania na dziś</h3>
          </div>
          {todayItems.length === 0 ? (
            <EmptyState title="Brak pilnych zadań" description="Miłego dnia pracy." />
          ) : (
            todayItems.map((c) => (
              <div
                key={c.id}
                onClick={() => navigate(`/cases/${c.id}`)}
                style={{
                  cursor: 'pointer',
                  padding: '13px 20px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {c.caseNumber}
                </span>
                <span style={{ fontSize: 12.5, flex: 1 }}>{truncate(c.nextAction ?? '—', 54)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** Wiersz z prototypowego `attentionRow()` — numer sprawy + odznaka statusu + Next Action + odznaka terminu. */
function AttentionRow({ caseRecord, onClick }: { caseRecord: CaseSummary; onClick: () => void }) {
  const caseStatuses = useCaseStatuses();
  const d = daysUntil(caseRecord.nextActionDueDate);
  const dueLabel =
    d === null
      ? '—'
      : d < 0
        ? `${Math.abs(d)} dni po terminie`
        : d === 0
          ? 'dzisiaj'
          : `za ${d} dni`;
  const dueTone =
    d === null ? 'badge-gray' : d < 0 ? 'badge-red' : d === 0 ? 'badge-amber' : 'badge-gray';

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
          <span className={`badge badge-${caseStatuses.statusTone(caseRecord.status)}`}>
            {caseStatuses.statusLabel(caseRecord.status)}
          </span>
        </div>
        <div className="mt-4" style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
          {caseRecord.nextAction ?? '—'}
        </div>
      </div>
      <span className={`badge ${dueTone}`}>{dueLabel}</span>
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
