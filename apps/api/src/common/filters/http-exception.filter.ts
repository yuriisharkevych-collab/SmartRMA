import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppException } from '../exceptions/app.exception';
import { ERROR_CODES } from '../exceptions/error-codes.const';
import { ApiErrorResponse } from '../interfaces/api-error-response.interface';

/**
 * Jedyne miejsce, które serializuje błędy do kształtu z ERROR_CODES.md.
 * `AppException` -> kod z katalogu wprost. `HttpException` generyczny (np.
 * z `ValidationPipe`) -> "VALIDATION-001" jako sensowny domyślny kod.
 * Wszystko inne (błąd nieoczekiwany) -> 500, zalogowane pełnym stackiem,
 * NIGDY nie ujawnione klientowi (patrz EVENTS.md §9.3 "brak cichego
 * połykania błędów" — log tak, treść dla klienta nie).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.toErrorResponse(exception);
    const status = this.toStatus(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} ${body.error.code}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status} ${body.error.code}`);
    }

    response.status(status).json(body);
  }

  private toStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private toErrorResponse(exception: unknown): ApiErrorResponse {
    if (exception instanceof AppException) {
      return {
        error: {
          code: exception.code,
          message: exception.message,
          field: exception.field,
          meta: exception.meta,
        },
      };
    }

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);
      const isValidation = exception.getStatus() === HttpStatus.UNPROCESSABLE_ENTITY;
      // Multer (`FileInterceptor`, limit `fileSize`) rzuca `PayloadTooLargeException` z gołym,
      // angielskim `err.message` ("File too large") — nie przechodzi przez `exceptionFactory`
      // z `main.ts` (to ścieżka DTO/`ValidationPipe`, nie interceptora pliku), więc bez tej
      // gałęzi trafiało to wprost na ekran (UAT — Sekcja 8, za duży załącznik). `FILE-001` już
      // jest zarejestrowany w katalogu z właściwą polską treścią — tylko nigdy nie podłączony.
      const isPayloadTooLarge = exception.getStatus() === HttpStatus.PAYLOAD_TOO_LARGE;
      return {
        error: {
          code: isValidation
            ? 'VALIDATION-001'
            : isPayloadTooLarge
              ? ERROR_CODES.FILE_001.code
              : 'HTTP-ERROR',
          // `ValidationPipe` (class-validator) generuje domyślne komunikaty PO ANGIELSKU i w
          // technicznym rejestrze ("email must be an email") — żaden z ~50 DTO w projekcie nie
          // ma własnych `{ message: '...' }`, więc bez tego zdanie wprost z walidatora trafiało
          // klientowi (formularz publiczny, Portal, panel pracownika) na ekran. Jedno wspólne,
          // zrozumiałe zdanie zamiast tego — pole, którego dotyczy błąd, i tak jest podświetlone
          // w formularzu, więc nie tracimy informacji, tylko nie pokazujemy jej po angielsku.
          message: isValidation
            ? 'Nie udało się zapisać — sprawdź, czy wszystkie wymagane pola są poprawnie wypełnione.'
            : isPayloadTooLarge
              ? ERROR_CODES.FILE_001.message
              : Array.isArray(message)
                ? message.join('; ')
                : message,
        },
      };
    }

    return {
      error: {
        code: 'INTERNAL-ERROR',
        message: 'Wystąpił nieoczekiwany błąd serwera.',
      },
    };
  }
}
