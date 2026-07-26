import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Log strukturalny czasu odpowiedzi per żądanie. Uzupełnia (nie zastępuje)
 * `nestjs-pino` — to middleware loguje żądanie/odpowiedź na poziomie HTTP,
 * ten interceptor dodaje czas wykonania w warstwie handlera, przydatny przy
 * debugowaniu konkretnych endpointów.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('RequestTiming');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url } = request;
    const started = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.logger.debug(`${method} ${url} +${Date.now() - started}ms`);
      }),
    );
  }
}
