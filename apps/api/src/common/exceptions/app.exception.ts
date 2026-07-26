import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Wyjątek niosący kod z katalogu `docs/architecture/ERROR_CODES.md`
 * (np. "CASE-004", "PORTAL-003") zamiast gołego komunikatu tekstowego —
 * frontend/API klienci reagują na `code`, nie na treść (patrz ERROR_CODES.md,
 * akapit wstępny). Rzucaj `AppException`, nie generyczny `HttpException`,
 * dla każdego błędu opisanego w katalogu.
 */
export interface AppExceptionOptions {
  /** Pole formularza, którego dotyczy błąd — opcjonalne (ERROR_CODES.md: "field"). */
  field?: string;
  /** Dodatkowy kontekst błędu — opcjonalne (ERROR_CODES.md: "meta"). */
  meta?: Record<string, unknown>;
}

export class AppException extends HttpException {
  public readonly code: string;
  public readonly field?: string;
  public readonly meta?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    httpStatus: HttpStatus,
    options: AppExceptionOptions = {},
  ) {
    super(message, httpStatus);
    this.code = code;
    this.field = options.field;
    this.meta = options.meta;
  }
}
