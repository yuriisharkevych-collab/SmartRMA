/**
 * 5 ról systemowych z `RBAC.md` §1 (`isSystem=true`, `companyId=null`,
 * seedowane, niekasowalne). Kod (`code`) jest stabilnym identyfikatorem
 * używanym w kodzie — etykieta wyświetlana (`name`) żyje wyłącznie w danych
 * `Role`, nie tutaj (RBAC.md: "to pole tekstowe, nie identyfikator").
 *
 * Klient NIE jest jedną z tych ról — dostęp Portalu Klienta to odrębny
 * mechanizm (RBAC.md §1.2), obsługiwany przez `PortalAccessGuard`
 * w module Auth, nie przez `PermissionsGuard`/`Role`.
 */
export const SYSTEM_ROLE_CODES = {
  ADMINISTRATOR: 'Administrator',
  KIEROWNIK: 'Kierownik',
  PRACOWNIK: 'Pracownik',
  SERWIS: 'Serwis',
  ODCZYT: 'Odczyt',
} as const;

export type SystemRoleCode = (typeof SYSTEM_ROLE_CODES)[keyof typeof SYSTEM_ROLE_CODES];
