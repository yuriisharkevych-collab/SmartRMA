export interface PlatformAdminSession {
  accessToken: string;
  expiresIn: number;
}

/** Klucz ODRĘBNY od `smartrma.auth.tokens` (pracownik) i `smartrma.portal.session` (Portal Klienta) — Platform Admin jest trzecim, całkowicie rozłącznym mechanizmem uwierzytelniania (osobny sekret JWT po stronie backendu, `PlatformAuthGuard`), więc sesje nie mogą się mieszać. */
const STORAGE_KEY = 'smartrma.platform-admin.session';

export function getPlatformAdminSession(): PlatformAdminSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlatformAdminSession;
  } catch {
    return null;
  }
}

export function setPlatformAdminSession(session: PlatformAdminSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearPlatformAdminSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
