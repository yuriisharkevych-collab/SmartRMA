import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../common/exceptions/app.exception';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { PermissionCode } from '../constants/permissions.const';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

/**
 * Egzekwuje `@RequirePermissions(...)`. Sprawdza `Permission.code`, nigdy
 * nazwę roli wprost — zgodnie z RBAC.md §4 ("pozwala zmieniać uprawnienia
 * ról bez zmiany kodu"). Wymaga, żeby `JwtAuthGuard` uruchomił się wcześniej
 * i ustawił `request.user.permissions` (suma uprawnień wszystkich ról
 * użytkownika, RBAC.md §1.1).
 *
 * Endpointy bez `@RequirePermissions(...)` przechodzą (autoryzowany
 * użytkownik, brak dodatkowego wymogu) — jeśli endpoint naprawdę nie
 * wymaga żadnego uprawnienia, to świadoma decyzja, nie przeoczenie.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionCode[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userPermissions = new Set(request.user?.permissions ?? []);
    const hasAny = required.some((permission) => userPermissions.has(permission));

    if (!hasAny) {
      throw new AppException(
        ERROR_CODES.RBAC_001.code,
        ERROR_CODES.RBAC_001.message,
        ERROR_CODES.RBAC_001.status,
        { meta: { requiredAnyOf: required } },
      );
    }

    return true;
  }
}
