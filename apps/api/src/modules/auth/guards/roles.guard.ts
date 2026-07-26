import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../../common/exceptions/app.exception';
import { AuthenticatedRequest } from '../../../common/interfaces/authenticated-request.interface';
import { ERROR_CODES } from '../../../common/exceptions/error-codes.const';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Egzekwuje `@Roles(...)`. Struktura wzorowana WPROST na `rbac/guards/
 * permissions.guard.ts` (ten sam kształt: brak metadanych = przepuść, RBAC-001
 * przy braku dopasowania) — celowo, żeby dwa mechanizmy autoryzacji w
 * projekcie nie rozjeżdżały się stylistycznie. Wymaga wcześniejszego
 * `JwtAuthGuard` (czyta `request.user.roles`). Nie jest zarejestrowany jako
 * `APP_GUARD` — stosowany selektywnie przez `@UseGuards(RolesGuard)` tam,
 * gdzie faktycznie potrzebny (patrz `@Roles()` po uzasadnienie, dlaczego to
 * dodatek do `PermissionsGuard`, nie zamiennik).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userRoles = new Set(request.user?.roles ?? []);
    const hasAny = required.some((role) => userRoles.has(role));

    if (!hasAny) {
      throw new AppException(
        ERROR_CODES.RBAC_001.code,
        ERROR_CODES.RBAC_001.message,
        ERROR_CODES.RBAC_001.status,
        { meta: { requiredAnyOfRoles: required } },
      );
    }

    return true;
  }
}
