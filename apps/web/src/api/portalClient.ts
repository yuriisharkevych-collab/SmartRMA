import axios, { AxiosError } from 'axios';
import { clearPortalSession, getPortalSession } from './portal-token-storage';

/**
 * Klient API Portalu Klienta — odrębny od `apiClient` (pracownik): brak refresh-tokenu
 * (sesja Portalu to pojedynczy, krótkotrwały token, patrz `PortalService.issueSession`),
 * przy 401 czyści sesję i wraca na `/portal/login` (nie `/login` — inna aplikacja z
 * perspektywy klienta).
 */
export const portalClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

portalClient.interceptors.request.use((config) => {
  const session = getPortalSession();
  if (session?.accessToken) {
    config.headers.Authorization = `Bearer ${session.accessToken}`;
  }
  return config;
});

portalClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      clearPortalSession();
      if (!window.location.pathname.startsWith('/portal/login')) {
        window.location.assign('/portal/login');
      }
    }
    return Promise.reject(error);
  },
);

export interface PortalApiError {
  error: { code: string; message: string; field?: string; meta?: Record<string, unknown> };
}

export function isPortalApiError(error: unknown): error is AxiosError<PortalApiError> {
  return (
    axios.isAxiosError(error) &&
    typeof (error.response?.data as PortalApiError | undefined)?.error === 'object'
  );
}
