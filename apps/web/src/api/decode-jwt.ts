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
 * `atob()` dekoduje base64 na "byte string" (jeden znak = jeden bajt) — dla
 * ASCII to wystarcza, ale JWT niesie UTF-8 (imię/nazwisko z polskimi znakami:
 * ą/ć/ę/ł/ń/ó/ś/ź/ż). Bez tego kroku `JSON.parse(atob(...))` dawał na żywo
 * "WÅÃ³kniarz" zamiast "Włókniarz" (odkryte przy pierwszym signupie z realnym
 * polskim nazwiskiem, Etap 6) — każdy bajt wielobajtowej sekwencji UTF-8
 * trafiał jako osobny (błędny) code unit. `TextDecoder('utf-8')` odczytuje te
 * same bajty poprawnie jako UTF-8.
 */
function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
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
    decodeBase64Utf8(payloadBase64.replace(/-/g, '+').replace(/_/g, '/')),
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
