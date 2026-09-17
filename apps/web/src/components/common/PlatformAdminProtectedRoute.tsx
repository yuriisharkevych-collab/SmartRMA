import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getPlatformAdminSession } from '@/api/platform-admin-token-storage';

/** Mirror `ProtectedRoute.tsx` (pracownik), ale dla sesji Platform Admina — osobny magazyn tokenu (`platform-admin-token-storage.ts`), osobny ekran logowania. */
export function PlatformAdminProtectedRoute() {
  const location = useLocation();
  const session = getPlatformAdminSession();

  if (!session?.accessToken) {
    return <Navigate to="/platform-admin/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
