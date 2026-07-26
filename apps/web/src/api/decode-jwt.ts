import type { AuthenticatedUser } from '@/types/auth';

interface JwtAccessPayload {
  sub: string;
  email: string;
  companyId: string;
  shopId: string | null;
  roles: string[];
  permissions: string[];
}

/** Dekodowanie WYŁĄCZNIE do odczytu (UI) — podpis nie jest tu weryfikowany, to robi backend przy każdym żądaniu (RBAC.md §4). */
export function decodeAccessToken(accessToken: string): AuthenticatedUser {
  const payloadBase64 = accessToken.split('.')[1];
  const payload = JSON.parse(atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'))) as JwtAccessPayload;

  return {
    userId: payload.sub,
    companyId: payload.companyId,
    shopId: payload.shopId,
    email: payload.email,
    roles: payload.roles,
    permissions: payload.permissions,
  };
}
