import { Reflector } from '@nestjs/core';
import { AppException } from '../../../common/exceptions/app.exception';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Testuje wyłącznie `handleRequest` (nadpisany w Zadaniu 1) — reszta
 * zachowania (`canActivate`/`@Public()`) pochodzi z `AuthGuard('jwt')` i
 * jest pokryta testem e2e (`test/auth.e2e-spec.ts`), nie tutaj.
 */
describe('JwtAuthGuard.handleRequest', () => {
  const guard = new JwtAuthGuard({} as Reflector);

  it('zwraca użytkownika, gdy Passport zweryfikował token poprawnie', () => {
    const user = { userId: 'u1' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('rzuca AppException(AUTH-003), gdy Passport nie znalazł użytkownika (brak/zły/wygasły token)', () => {
    expect(() => guard.handleRequest(null, false)).toThrow(AppException);
    try {
      guard.handleRequest(null, false);
    } catch (error) {
      expect((error as AppException).code).toBe('AUTH-003');
      expect((error as AppException).getStatus()).toBe(401);
    }
  });

  it('rzuca AppException(AUTH-003) — NIE oryginalny błąd Passport — gdy strategia zgłosiła błąd', () => {
    const passportError = new Error('jwt expired');
    expect(() => guard.handleRequest(passportError, false)).toThrow(AppException);
    try {
      guard.handleRequest(passportError, false);
    } catch (error) {
      expect(error).not.toBe(passportError);
    }
  });
});
