export interface PortalSession {
  accessToken: string;
  expiresIn: number;
  caseNumber: string;
}

/** Klucz ODRĘBNY od `smartrma.auth.tokens` (sesja pracownika) — dwie sesje nie mogą się mieszać (RBAC.md §1.2: Portal to mechanizm bez tożsamości klienta). */
const STORAGE_KEY = 'smartrma.portal.session';

export function getPortalSession(): PortalSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PortalSession;
  } catch {
    return null;
  }
}

export function setPortalSession(session: PortalSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearPortalSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
