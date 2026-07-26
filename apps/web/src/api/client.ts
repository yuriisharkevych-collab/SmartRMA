import axios, { AxiosError } from 'axios';
import { getStoredTokens, setStoredTokens, clearStoredTokens } from './token-storage';
import type { AuthTokens } from '@/types/auth';

/**
 * Klient API — jeden `axios.create()`, żaden komponent nie woła `fetch`
 * bezpośrednio. Kształt błędu (`error.code`/`message`/`field`/`meta`)
 * zgodny z `ERROR_CODES.md` (backend: `HttpExceptionFilter`).
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
  const tokens = getStoredTokens();
  if (tokens?.accessToken) {
    config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  return config;
});

let refreshPromise: Promise<AuthTokens> | null = null;

/** Odświeżenie tokenu — jedna wspólna obietnica, żeby równoległe 401 nie odpaliły wielu żądań `/auth/refresh` naraz. */
async function refreshTokens(): Promise<AuthTokens> {
  const tokens = getStoredTokens();
  if (!tokens?.refreshToken) throw new Error('Brak refresh tokenu.');

  const response = await axios.post<AuthTokens>(
    `${import.meta.env.VITE_API_BASE_URL}/auth/refresh`,
    { refreshToken: tokens.refreshToken },
  );
  setStoredTokens(response.data);
  return response.data;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (typeof error.config & { _retry?: boolean }) | undefined;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        refreshPromise ??= refreshTokens();
        const tokens = await refreshPromise;
        refreshPromise = null;
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
        return apiClient(originalRequest);
      } catch {
        refreshPromise = null;
        clearStoredTokens();
        window.location.assign('/login');
      }
    }

    return Promise.reject(error);
  },
);

export interface ApiError {
  error: { code: string; message: string; field?: string; meta?: Record<string, unknown> };
}

export function isApiError(error: unknown): error is AxiosError<ApiError> {
  return axios.isAxiosError(error) && typeof (error.response?.data as ApiError | undefined)?.error === 'object';
}
