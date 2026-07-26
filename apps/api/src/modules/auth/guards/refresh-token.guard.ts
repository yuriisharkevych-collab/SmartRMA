import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppException } from '../../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../../common/exceptions/error-codes.const';

/**
 * Chroni `/auth/refresh` i `/auth/logout` — obie operują na Refresh Tokenie,
 * nie Access Tokenie (stąd osobny guard od `JwtAuthGuard`, punkt 7 zadania).
 * `handleRequest` nadpisany identycznie jak w `JwtAuthGuard`: domyślne
 * zachowanie Passport rzuca goły `UnauthorizedException` bez kodu z
 * ERROR_CODES.md — tu zawsze `AUTH-003`, zgodnie z katalogiem (Wygasły/
 * nieprawidłowy token JWT), niezależnie od przyczyny (brak, zły podpis,
 * wygasły, spoza Redis allowlist — `JwtRefreshStrategy` ich nie rozróżnia
 * na zewnątrz, BR-078-podobna zasada nieujawniania szczegółu awarii).
 */
@Injectable()
export class RefreshTokenGuard extends AuthGuard('jwt-refresh') {
  handleRequest<TUser = unknown>(err: unknown, user: TUser | false): TUser {
    if (err || !user) {
      throw new AppException(ERROR_CODES.AUTH_003.code, ERROR_CODES.AUTH_003.message, ERROR_CODES.AUTH_003.status);
    }
    return user;
  }
}
