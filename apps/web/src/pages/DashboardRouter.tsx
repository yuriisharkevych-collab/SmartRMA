import { useQuery } from '@tanstack/react-query';
import { companiesApi } from '@/api/companies.api';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { DashboardPage } from './DashboardPage';
import { DistributorDashboardPage } from './DistributorDashboardPage';

/**
 * Etap 2 (Dashboard Producenta/Dystrybutora) — rozstrzyga WCZEŚNIEJ zbudowany
 * `DashboardPage.tsx` (Sklep, np. DAWIDAM) kontra nowy `DistributorDashboardPage.tsx`
 * (Producent/Dystrybutor) na podstawie `Company.type`. Osobny mały komponent,
 * nie warunek wewnątrz `router.tsx` — żeby zapytanie o firmę (i krótki stan
 * ładowania) żyło w jednym, oczywistym miejscu.
 */
export function DashboardRouter() {
  const { data: company, isLoading } = useQuery({
    queryKey: ['company-me'],
    queryFn: companiesApi.me,
  });

  if (isLoading) return <LoadingIndicator />;
  return company?.type === 'ManufacturerDistributor' ? (
    <DistributorDashboardPage />
  ) : (
    <DashboardPage />
  );
}
