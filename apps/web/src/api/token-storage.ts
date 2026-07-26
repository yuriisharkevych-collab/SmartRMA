import type { AuthTokens } from '@/types/auth';

/**
 * `localStorage` — świadomie ten sam kompromis co Portal Klienta w
 * prototypie (DECISIONS.md: wystarczające do demonstracji, produkcyjnie do
 * rewizji — np. `httpOnly` cookie dla refresh tokenu, żeby nie był
 * czytelny z JS/podatny na XSS). Nie rozstrzygane w tym scaffoldzie.
 */
const STORAGE_KEY = 'smartrma.auth.tokens';

export function getStoredTokens(): AuthTokens | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthTokens;
  } catch {
    return null;
  }
}

export function setStoredTokens(tokens: AuthTokens): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function clearStoredTokens(): void {
  localStorage.removeItem(STORAGE_KEY);
}
