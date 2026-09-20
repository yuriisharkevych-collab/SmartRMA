import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { LandingPage } from '@/pages/public/LandingPage';

/**
 * Powłoka pracownika (AppLayout) — Portal Klienta ma odrębny mechanizm dostępu,
 * nie ten guard (RBAC.md §1.2). Wyjątek WYŁĄCZNIE dla `pathname === '/'`:
 * niezalogowany odwiedzający widzi publiczny landing zamiast przekierowania na
 * `/login` — każda INNA chroniona ścieżka (`/cases`, `/users`, ...) zachowuje
 * się dokładnie jak dotychczas, bo ten guard jest dla nich wspólny (jeden wpis
 * `<ProtectedRoute/>` w `router.tsx` otacza całe poddrzewo `AppLayout`).
 */
export function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    if (location.pathname === '/') return <LandingPage />;
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
