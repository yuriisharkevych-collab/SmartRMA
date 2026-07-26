/**
 * Kształt odpowiedzi błędu ustalony w `ERROR_CODES.md` (sekcja "Struktura
 * odpowiedzi błędu"). `field`/`meta` opcjonalne.
 */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    field?: string;
    meta?: Record<string, unknown>;
  };
}
