import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { casesApi } from '@/api/cases.api';
import { companiesApi } from '@/api/companies.api';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { PermissionGate } from '@/components/common/PermissionGate';
import { PlusIcon, SearchIcon } from '@/components/common/icons';
import { useAuth } from '@/hooks/useAuth';
import { useCaseLookups } from '@/hooks/useCaseLookups';
import { useCaseStatuses } from '@/hooks/useCaseStatuses';
import {
  CASE_FILTERS,
  COMPLAINT_TYPE_LABELS,
  daysUntil,
  findFilter,
  formatDate,
  isB2B,
} from '@/lib/case-filters';

/**
 * Odpowiednik `cases.html` + `js/cases.js`.
 *
 * Filtrowanie w 100% po stronie klienta — tak samo jak prototyp, który
 * filtrował `SMARTRMA_DATA.cases` w pamięci. Dzięki temu wynik pojawia się
 * natychmiast po kliknięciu, bez okrążenia po sieci i bez dodatkowych okien.
 * `GET /cases` zwraca komplet spraw firmy; przy wolumenach MVP to wystarcza,
 * przy dziesiątkach tysięcy spraw filtr trzeba będzie przenieść do zapytania.
 *
 * Zakładki statusu i wyszukiwarka są 1:1 z prototypem (ten sam zestaw pól
 * przeszukiwanych co `matchesSearch()`). Dwa selecty — właściciel i producent
 * — to rozszerzenie ponad prototyp, dodane na wyraźną prośbę.
 *
 * Aktywny filtr żyje w URL (`?filter=…`), bo kafelki Dashboardu linkują tutaj
 * z gotowym filtrem — dokładnie jak `cases.html?filter=new` w prototypie.
 */
export function CasesListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: cases, isLoading } = useQuery({ queryKey: ['cases'], queryFn: casesApi.list });
  const { data: company } = useQuery({ queryKey: ['company-me'], queryFn: companiesApi.me });
  const lookups = useCaseLookups();
  const caseStatuses = useCaseStatuses();
  // Etap 2 (Dashboard Producenta/Dystrybutora) — kolumny Marka/Termin i pełny opis "zgłaszającego"
  // (partner vs klient) są specyficzne dla tego typu organizacji; Sklep (DAWIDAM) widzi tabelę
  // dokładnie jak dotąd, zero zmiany w jego workflow.
  const isDistributorOrg = company?.type === 'ManufacturerDistributor';

  const activeFilterKey = searchParams.get('filter') ?? 'open';
  const activeFilter = findFilter(activeFilterKey);

  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [ownerId, setOwnerId] = useState('');
  const [manufacturerId, setManufacturerId] = useState('');
  // Producent/Dystrybutor + Partnerzy B2B (Faza 6) — filtr źródła (Wszystkie/B2B/B2C), ten sam
  // wzorzec co pozostałe filtry tej strony: w 100% po stronie klienta. Etap 2 — `isB2B()`
  // zamiast surowego `originType` (marka może zgłosić B2B bez ustawiania `originType`, patrz
  // komentarz przy `isB2B`). Odczytany raz z URL (`?origin=`) — kafelki nowego Dashboardu
  // Dystrybutora linkują tutaj z gotowym źródłem I bucketem naraz (`?filter=new&origin=b2b`),
  // inaczej liczba na kafelku (przefiltrowana PO ŹRÓDLE) nigdy nie zgadzałaby się z listą.
  const [origin, setOrigin] = useState<'' | 'b2b' | 'b2c'>(
    (searchParams.get('origin') as '' | 'b2b' | 'b2c' | null) ?? '',
  );

  function selectFilter(key: string) {
    const next = new URLSearchParams(searchParams);
    next.set('filter', key);
    setSearchParams(next, { replace: true });
  }

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return (cases ?? [])
      .filter((c) => activeFilter.match(c, user?.userId, caseStatuses.finalStatusCodes))
      .filter((c) => (ownerId ? c.ownerId === ownerId : true))
      .filter((c) =>
        manufacturerId ? c.items.some((i) => i.manufacturerId === manufacturerId) : true,
      )
      .filter((c) => (origin ? isB2B(c) === (origin === 'b2b') : true))
      .filter((c) => {
        if (!query) return true;
        const customer = lookups.customerById.get(c.customerId);
        const haystack = [
          c.caseNumber,
          customer?.firstName,
          customer?.lastName,
          customer?.phone,
          customer?.email,
          ...c.items.flatMap((i) => [
            lookups.productById.get(i.productId)?.name,
            i.serialNumber,
            i.frameNumber,
            lookups.manufacturerName(i.manufacturerId),
          ]),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cases,
    activeFilterKey,
    user?.userId,
    ownerId,
    manufacturerId,
    origin,
    search,
    lookups.customerById,
    lookups.productById,
  ]);

  const filtersActive = Boolean(ownerId || manufacturerId || origin || search);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Reklamacje</h1>
          <p className="page-subtitle">{`${rows.length} spraw w widoku „${activeFilter.label}”.`}</p>
        </div>
        <PermissionGate permissions={['cases.create']}>
          <Link to="/cases/new" className="btn btn-primary">
            <PlusIcon />
            Nowa reklamacja
          </Link>
        </PermissionGate>
      </div>

      <div className="card">
        <div className="table-toolbar">
          <div className="filter-tabs">
            {CASE_FILTERS.map((f) => (
              <div
                key={f.key}
                className={`filter-tab ${f.key === activeFilterKey ? 'active' : ''}`}
                onClick={() => selectFilter(f.key)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') selectFilter(f.key);
                }}
              >
                {f.label}
              </div>
            ))}
          </div>
          <div className="search-input">
            <SearchIcon width={15} height={15} />
            <input
              type="text"
              placeholder="Nr sprawy, klient, produkt, numer seryjny…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="table-toolbar" style={{ borderTop: 'none', paddingTop: 0 }}>
          <div className="toolbar-filters">
            <select
              className="toolbar-select"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              aria-label="Filtr: właściciel sprawy"
            >
              <option value="">Właściciel: wszyscy</option>
              {lookups.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </select>

            <select
              className="toolbar-select"
              value={manufacturerId}
              onChange={(e) => setManufacturerId(e.target.value)}
              aria-label="Filtr: producent"
            >
              <option value="">Producent: wszyscy</option>
              {lookups.manufacturers.map((m) => (
                <option key={m.id} value={m.id}>
                  {lookups.manufacturerName(m.id)}
                </option>
              ))}
            </select>

            <select
              className="toolbar-select"
              value={origin}
              onChange={(e) => setOrigin(e.target.value as typeof origin)}
              aria-label="Filtr: źródło sprawy"
            >
              <option value="">Źródło: wszystkie</option>
              <option value="b2c">B2C — klient detaliczny</option>
              <option value="b2b">B2B — partner</option>
            </select>

            {filtersActive && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setOwnerId('');
                  setManufacturerId('');
                  setOrigin('');
                  setSearch('');
                }}
              >
                Wyczyść filtry
              </button>
            )}
          </div>
        </div>

        {isLoading && <LoadingIndicator />}

        {!isLoading && rows.length === 0 && (
          <div className="empty-state">
            <div className="icon-wrap">
              <SearchIcon />
            </div>
            <h4>Brak wyników</h4>
            <p>Zmień filtr statusu lub wyszukiwane hasło.</p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nr sprawy</th>
                  <th>Zgłaszający</th>
                  <th>Produkt</th>
                  {isDistributorOrg && <th>Marka</th>}
                  <th>Producent</th>
                  <th>Typ</th>
                  <th>Źródło</th>
                  <th>Status</th>
                  <th>Właściciel</th>
                  <th>Utworzono</th>
                  {isDistributorOrg && <th>Termin/SLA</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const customer = lookups.customerById.get(c.customerId);
                  const owner = c.ownerId ? lookups.userById.get(c.ownerId) : undefined;
                  const firstItem = c.items[0];
                  const product = firstItem
                    ? lookups.productById.get(firstItem.productId)
                    : undefined;

                  return (
                    <tr key={c.id} onClick={() => navigate(`/cases/${c.id}`)}>
                      <td className="mono cell-primary">
                        <span className="flex items-center gap-8">
                          {c.caseNumber}
                          {c.unreadMessagesCount > 0 && (
                            <span
                              title={`Nieprzeczytana wiadomość od klienta (${c.unreadMessagesCount})`}
                              style={{
                                display: 'inline-block',
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: 'var(--red)',
                                flexShrink: 0,
                              }}
                            />
                          )}
                        </span>
                      </td>
                      <td>
                        {c.reportedByPartnerCompanyName ? (
                          <>
                            <div className="cell-primary">{c.reportedByPartnerCompanyName}</div>
                            <div className="cell-secondary">
                              w imieniu:{' '}
                              {customer ? `${customer.firstName} ${customer.lastName}` : '—'}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="cell-primary">
                              {customer ? `${customer.firstName} ${customer.lastName}` : '—'}
                            </div>
                            <div className="cell-secondary">{customer?.phone ?? ''}</div>
                          </>
                        )}
                      </td>
                      <td>
                        <div className="cell-primary">{product?.name ?? '—'}</div>
                        <div className="cell-secondary">
                          {firstItem?.serialNumber || 'brak nr seryjnego'}
                        </div>
                      </td>
                      {isDistributorOrg && <td>{lookups.brandName(firstItem?.productId)}</td>}
                      <td>{lookups.manufacturerName(firstItem?.manufacturerId)}</td>
                      <td>
                        <span className="tag">
                          {COMPLAINT_TYPE_LABELS[c.complaintType] ?? c.complaintType}
                        </span>
                        {c.submissionMode === 'BezposrednioDoProducenta' && (
                          <span
                            className="tag"
                            style={{
                              borderColor: 'var(--amber)',
                              color: 'var(--amber)',
                              marginLeft: 4,
                            }}
                          >
                            Monitorowana
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className="tag"
                          style={
                            isB2B(c)
                              ? { borderColor: 'var(--primary)', color: 'var(--primary)' }
                              : undefined
                          }
                        >
                          {isB2B(c) ? 'B2B' : 'B2C'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${caseStatuses.statusTone(c.status)}`}>
                          {caseStatuses.statusLabel(c.status)}
                        </span>
                      </td>
                      <td>{owner ? `${owner.firstName} ${owner.lastName}` : '—'}</td>
                      <td className="cell-secondary">{formatDate(c.createdAt)}</td>
                      {isDistributorOrg && <td>{renderSlaBadge(c.nextActionDueDate)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Etap 2 (Dashboard Producenta/Dystrybutora) — ten sam sposób liczenia dni co `isOverdue`/`isDueToday` w `lib/case-filters.ts`, żeby odznaka na liście NIGDY nie mówiła co innego niż filtr "Po terminie". */
function renderSlaBadge(nextActionDueDate: string | null): string | JSX.Element {
  const d = daysUntil(nextActionDueDate);
  if (d === null) return '—';
  if (d < 0) return <span className="badge badge-red">{Math.abs(d)} dni po terminie</span>;
  if (d === 0) return <span className="badge badge-amber">dzisiaj</span>;
  return <span className="badge badge-gray">za {d} dni</span>;
}
