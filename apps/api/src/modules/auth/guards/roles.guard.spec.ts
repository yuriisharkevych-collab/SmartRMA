import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../../common/exceptions/app.exception';
import { RolesGuard } from './roles.guard';

function contextWithUser(roles: string[] | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: roles ? { roles } : undefined }) }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('przepuszcza, gdy endpoint nie ma @Roles(...)', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(contextWithUser(['Pracownik']))).toBe(true);
  });

  it('przepuszcza, gdy użytkownik ma jedną z wymaganych ról', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['Administrator', 'Kierownik']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(contextWithUser(['Kierownik']))).toBe(true);
  });

  it('rzuca AppException(RBAC-001), gdy użytkownik nie ma żadnej z wymaganych ról', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['Administrator']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(contextWithUser(['Pracownik']))).toThrow(AppException);
    try {
      guard.canActivate(contextWithUser(['Pracownik']));
    } catch (error) {
      expect((error as AppException).code).toBe('RBAC-001');
    }
  });

  it('rzuca AppException(RBAC-001), gdy brak zalogowanego użytkownika w ogóle', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['Administrator']) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(AppException);
  });
});
