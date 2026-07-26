import type { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface PermissionGateProps {
  permissions: string[];
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Odpowiednik `data-write-action`/`data-min-role` z prototypu (`app.js`,
 * `applyRoleGates()`) jako właściwy komponent React — ukrywanie w UI, NIE
 * mechanizm bezpieczeństwa (ten żyje w API, `PermissionsGuard`).
 */
export function PermissionGate({ permissions, children, fallback = null }: PermissionGateProps) {
  const { hasPermission } = useAuth();
  return hasPermission(...permissions) ? <>{children}</> : <>{fallback}</>;
}
