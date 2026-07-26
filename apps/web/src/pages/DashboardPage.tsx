import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/api/dashboard.api';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';

/** Odpowiednik `dashboard.html` — kafelki statystyk, linkujące do `/cases?filter=...` (wzorzec z prototypu). */
export function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard-summary'], queryFn: dashboardApi.getSummary });

  if (isLoading || !data) return <LoadingIndicator />;

  const tiles = [
    { label: 'Aktywne sprawy', value: data.totalActive },
    { label: 'Przeterminowane', value: data.overdue },
    { label: 'Dziś', value: data.dueToday },
    { label: 'Oczekiwanie na klienta', value: data.awaitingCustomer },
    { label: 'Gotowe do odbioru', value: data.readyForPickup },
    { label: 'Moje sprawy', value: data.myCases },
  ];

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-semibold">{tile.value}</div>
            <div className="text-sm text-gray-500">{tile.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
