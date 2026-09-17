import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { platformAdminApi } from '@/api/platform-admin.api';
import { clearPlatformAdminSession } from '@/api/platform-admin-token-storage';
import { formatDateTime } from '@/lib/case-labels';

const ORG_TYPE_LABEL: Record<string, string> = {
  Shop: 'Sklep',
  ManufacturerDistributor: 'Producent/Dystrybutor',
};

/**
 * `/platform-admin` — jedyny ekran panelu Platform Admina, celowo minimalny
 * (wprost z zadania: "Nie dawaj automatycznie Platform Adminowi pełnego
 * dostępu do danych wszystkich tenantów"): profil + przegląd firm z
 * WYŁĄCZNIE polami `PlatformCompanySummaryEntity` (bez użytkowników, spraw,
 * katalogu, ustawień e-mail żadnej firmy — backend ich tu w ogóle nie zwraca).
 */
export function PlatformAdminPanelPage() {
  const navigate = useNavigate();

  const meQuery = useQuery({
    queryKey: ['platform-admin', 'me'],
    queryFn: platformAdminApi.me,
    retry: false,
  });

  const companiesQuery = useQuery({
    queryKey: ['platform-admin', 'companies'],
    queryFn: platformAdminApi.companies,
    retry: false,
  });

  function handleLogout() {
    clearPlatformAdminSession();
    navigate('/platform-admin/login', { replace: true });
  }

  const companies = companiesQuery.data ?? [];

  return (
    <div className="public-page">
      <header className="public-header">
        <div className="brand">
          <div className="sidebar-brand-mark">R</div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            Smart<span style={{ color: 'var(--primary)' }}>RMA</span>
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Administrator platformy</span>
        </div>
        <button type="button" className="btn btn-secondary" onClick={handleLogout}>
          Wyloguj
        </button>
      </header>

      <main className="public-main" style={{ maxWidth: 960 }}>
        <div className="page-header">
          <div>
            <h1>Panel platformy</h1>
            <p className="page-subtitle">
              {meQuery.data
                ? `Zalogowano jako ${meQuery.data.email}${meQuery.data.lastLoginAt ? ` — poprzednie logowanie ${formatDateTime(meQuery.data.lastLoginAt)}` : ''}.`
                : 'Wczytywanie profilu…'}
            </p>
          </div>
        </div>

        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h3>Firmy w systemie ({companies.length})</h3>
          </div>

          {companiesQuery.isLoading && <p className="text-sm text-muted">Wczytywanie…</p>}

          {companiesQuery.isError && (
            <p className="field-error" style={{ display: 'block' }}>
              Nie udało się pobrać listy firm.
            </p>
          )}

          {!companiesQuery.isLoading && companies.length === 0 && (
            <div className="empty-state">
              <h4>Brak firm</h4>
              <p>
                Żadna firma nie została jeszcze zarejestrowana — baza jest w stanie Fresh Install.
              </p>
            </div>
          )}

          {companies.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nazwa</th>
                    <th>Typ</th>
                    <th>Status</th>
                    <th className="col-hide-mobile">Założona</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c) => (
                    <tr key={c.id}>
                      <td className="cell-primary">{c.name}</td>
                      <td className="cell-secondary">
                        {ORG_TYPE_LABEL[c.type] ?? c.type}
                        {c.orgKind ? ` — ${c.orgKind}` : ''}
                      </td>
                      <td>
                        <span className={`badge ${c.active ? 'badge-green' : 'badge-gray'}`}>
                          {c.active ? 'Aktywna' : 'Nieaktywna'}
                        </span>
                      </td>
                      <td className="cell-secondary col-hide-mobile">
                        {formatDateTime(c.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
