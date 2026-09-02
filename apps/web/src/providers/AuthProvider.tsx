import { createContext, useCallback, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '@/api/auth.api';
import { decodeAccessToken } from '@/api/decode-jwt';
import { clearStoredTokens, getStoredTokens, setStoredTokens } from '@/api/token-storage';
import type { AuthenticatedUser, AuthTokens } from '@/types/auth';

export interface AuthContextValue {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** Etap 5 — logowanie z już wydanych tokenów (np. `POST /partnerships/invite/:token/accept`), bez ponownego `POST /auth/login`. */
  loginWithTokens: (tokens: AuthTokens) => void;
  logout: () => void;
  hasPermission: (...permissions: string[]) => boolean;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function userFromStorage(): AuthenticatedUser | null {
  const tokens = getStoredTokens();
  if (!tokens) return null;
  try {
    return decodeAccessToken(tokens.accessToken);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(() => userFromStorage());

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await authApi.login(email, password);
    setStoredTokens(tokens);
    setUser(decodeAccessToken(tokens.accessToken));
  }, []);

  const loginWithTokens = useCallback((tokens: AuthTokens) => {
    setStoredTokens(tokens);
    setUser(decodeAccessToken(tokens.accessToken));
  }, []);

  const logout = useCallback(() => {
    clearStoredTokens();
    setUser(null);
  }, []);

  /** "Którekolwiek" — spójne z `PermissionsGuard` w apps/api i RBAC.md §4. */
  const hasPermission = useCallback(
    (...permissions: string[]) => {
      if (!user) return false;
      return permissions.some((permission) => user.permissions.includes(permission));
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      login,
      loginWithTokens,
      logout,
      hasPermission,
    }),
    [user, login, loginWithTokens, logout, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
