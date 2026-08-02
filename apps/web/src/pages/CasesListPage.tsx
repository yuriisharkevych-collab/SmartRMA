import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { casesApi } from '@/api/cases.api';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { PermissionGate } from '@/components/common/PermissionGate';
import { PlusIcon, SearchIcon } from '@/components/common/icons';
import { useAuth } from '@/hooks/useAuth';
import { useCaseLookups } from '@/hooks/useCaseLookups';
import {
  CASE_FILTERS,
  COMPLAINT_TYPE_LABELS,
  findFilter,
  formatDate,
  statusLabel,
  statusTone,
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
  const lookups = useCaseLookups();

  const activeFilterKey = searchParams.get('filter') ?? 'open';
  const activeFilter = findFilter(activeFilterKey);

  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [ownerId, setOwnerId] = useState('');
  const [manufacturerId, setManufacturerId] = useState('');

  function selectFilter(key: string) {
    const next = new URLSearchParams(searchParams);
    next.set('filter', key);
    setSearchParams(next, { replace: true });
  }

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return (cases ?? [])
      .filter((c) => activeFilter.match(c, user?.userId))
      .filter((c) => (ownerId ? c.ownerId === ownerId : true))
      .filter((c) =>
        manufacturerId ? c.items.some((i) => i.manufacturerId === manufacturerId) : true,
      )
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
    search,
    lookups.customerById,
    lookups.productById,
  ]);

  const filtersActive = Boolean(ownerId || manufacturerId || search);

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
          <div className="flex gap-10 items-center" style={{ flexWrap: 'wrap' }}>
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

            {filtersActive && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setOwnerId('');
                  setManufacturerId('');
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
                  <th>Klient</th>
                  <th>Produkt</th>
                  <th>Producent</th>
                  <th>Typ</th>
                  <th>Status</th>
                  <th>Właściciel</th>
                  <th>Utworzono</th>
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
                      <td className="mono cell-primary">{c.caseNumber}</td>
                      <td>
                        <div className="cell-primary">
                          {customer ? `${customer.firstName} ${customer.lastName}` : '—'}
                        </div>
                        <div className="cell-secondary">{customer?.phone ?? ''}</div>
                      </td>
                      <td>
                        <div className="cell-primary">{product?.name ?? '—'}</div>
                        <div className="cell-secondary">
                          {firstItem?.serialNumber || 'brak nr seryjnego'}
                        </div>
                      </td>
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
                        <span className={`badge badge-${statusTone(c.status)}`}>
                          {statusLabel(c.status)}
                        </span>
                      </td>
                      <td>{owner ? `${owner.firstName} ${owner.lastName}` : '—'}</td>
                      <td className="cell-secondary">{formatDate(c.createdAt)}</td>
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
