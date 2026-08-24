import type { AuthenticatedUser } from '@/types/auth';

interface JwtAccessPayload {
  sub: string;
  email: string;
  firstName?: string;
  lastName?: string;
  companyId: string;
  shopId: string | null;
  roles: string[];
  permissions: string[];
}

/**
 * Dekodowanie WYŁĄCZNIE do odczytu (UI) — podpis nie jest tu weryfikowany, to robi backend przy każdym żądaniu (RBAC.md §4).
 * `firstName`/`lastName` opcjonalne w typie źródłowym — token wydany PRZED dodaniem tych pól (sesja
 * zalogowana wcześniej, jeszcze w localStorage) ich nie niesie; puste stringi zamiast `undefined`
 * w renderowanym UI, dopóki `POST /auth/refresh` nie wyda nowego tokenu.
 */
export function decodeAccessToken(accessToken: string): AuthenticatedUser {
  const payloadBase64 = accessToken.split('.')[1];
  const payload = JSON.parse(
    atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/')),
  ) as JwtAccessPayload;

  return {
    userId: payload.sub,
    companyId: payload.companyId,
    shopId: payload.shopId,
    email: payload.email,
    firstName: payload.firstName ?? '',
    lastName: payload.lastName ?? '',
    roles: payload.roles,
    permissions: payload.permissions,
  };
}
