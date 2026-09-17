import axios, { AxiosError } from 'axios';
import { clearPlatformAdminSession, getPlatformAdminSession } from './platform-admin-token-storage';

/**
 * Klient API Platform Admina — odrębny od `apiClient` (pracownik) i `portalClient`
 * (Portal Klienta): brak refresh-tokenu (pojedynczy, krótkotrwały access token —
 * `PlatformAuthService.login`, 30 min domyślnie), przy 401 czyści sesję i wraca na
 * `/platform-admin/login`, nie `/login` (inny, całkowicie rozłączny mechanizm
 * uwierzytelniania — patrz `PlatformAuthGuard`/`platform-admin-token-storage.ts`).
 */
export const platformAdminClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

platformAdminClient.interceptors.request.use((config) => {
  const session = getPlatformAdminSession();
  if (session?.accessToken) {
    config.headers.Authorization = `Bearer ${session.accessToken}`;
  }
  return config;
});

platformAdminClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      clearPlatformAdminSession();
      if (!window.location.pathname.startsWith('/platform-admin/login')) {
        window.location.assign('/platform-admin/login');
      }
    }
    return Promise.reject(error);
  },
);

export interface PlatformAdminApiError {
  error: { code: string; message: string; field?: string; meta?: Record<string, unknown> };
}

export function isPlatformAdminApiError(
  error: unknown,
): error is AxiosError<PlatformAdminApiError> {
  return (
    axios.isAxiosError(error) &&
    typeof (error.response?.data as PlatformAdminApiError | undefined)?.error === 'object'
  );
}
