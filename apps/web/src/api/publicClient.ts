import axios, { AxiosError } from 'axios';

/**
 * Klient API Publicznego Formularza Reklamacyjnego — BEZ jakiegokolwiek tokenu
 * (klient nie ma jeszcze żadnej tożsamości w systemie, dopiero ją tworzy). Po
 * udanym wysłaniu formularza frontend przełącza się na `portalClient` (sesja
 * Portalu zwrócona przez `POST /intake/complaints`), ten klient służy WYŁĄCZNIE
 * krokom sprzed utworzenia sprawy.
 */
export const publicClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

export interface PublicApiError {
  error: { code: string; message: string; field?: string; meta?: Record<string, unknown> };
}

export function isPublicApiError(error: unknown): error is AxiosError<PublicApiError> {
  return (
    axios.isAxiosError(error) &&
    typeof (error.response?.data as PublicApiError | undefined)?.error === 'object'
  );
}
