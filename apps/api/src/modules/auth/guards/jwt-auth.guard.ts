import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { AppException } from '../../../common/exceptions/app.exception';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { ERROR_CODES } from '../../../common/exceptions/error-codes.const';

/**
 * Domyślny guard dla WSZYSTKICH endpointów pracowniczych (rejestrowany
 * jako `APP_GUARD` w `AppModule`) — pomija sprawdzanie, jeśli handler ma
 * `@Public()`. Portal Klienta (RBAC.md §1.2) i logowanie/health/version
 * używają `@Public()`; wszystko inne domyślnie wymaga ważnego JWT.
 *
 * `handleRequest` nadpisany (Zadanie 1) — domyślne zachowanie
 * `AuthGuard('jwt')` z Passportem rzuca goły `UnauthorizedException`, który
 * `HttpExceptionFilter` tłumaczyłby na nic nie mówiący `HTTP-ERROR`, nie
 * `AUTH-003` z `ERROR_CODES.md` ("Sesja wygasła — zaloguj się ponownie.",
 * "Wygasły/nieprawidłowy token JWT"). Item 12 zadania: "Nie zwracaj
 * własnych komunikatów" — to naprawia realną, wcześniej istniejącą
 * niezgodność z katalogiem, nie nowy wzorzec.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(err: unknown, user: TUser | false): TUser {
    if (err || !user) {
      throw new AppException(ERROR_CODES.AUTH_003.code, ERROR_CODES.AUTH_003.message, ERROR_CODES.AUTH_003.status);
    }
    return user;
  }
}
