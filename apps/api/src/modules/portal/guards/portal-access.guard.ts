import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AppException } from '../../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../../common/exceptions/error-codes.const';
import { PortalJwtPayload } from '../interfaces/portal-jwt-payload.interface';

export interface PortalRequest extends Request {
  portalCaseId: string;
}

/**
 * Odpowiednik `JwtAuthGuard` dla Portalu Klienta, ale CELOWO osobny —
 * RBAC.md §1.2: inny profil zagrożeń, inny sekret (`jwt.portal`, nie
 * `jwt.access`), payload niesie `caseId`, nie `userId`. Weryfikuje token
 * ręcznie przez `JwtService.verifyAsync` zamiast rejestrować drugą
 * strategię Passport — nie ma powodu, żeby dwa NIEZALEŻNE mechanizmy
 * dostępu (pracownik/klient) dzieliły tę samą infrastrukturę.
 *
 * `PermissionsGuard` (globalny `APP_GUARD`) nie blokuje tych endpointów —
 * są oznaczone `@Public()`, więc `JwtAuthGuard` je pomija, a
 * `PermissionsGuard` przepuszcza brak `@RequirePermissions` bez warunku
 * (uprawnienia z RBAC.md §2 świadomie nie dotyczą klienta, §3a).
 */
@Injectable()
export class PortalAccessGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PortalRequest>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;

    if (!token) {
      throw new AppException(ERROR_CODES.PORTAL_006.code, ERROR_CODES.PORTAL_006.message, ERROR_CODES.PORTAL_006.status);
    }

    let payload: PortalJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<PortalJwtPayload>(token, {
        secret: this.config.get<string>('portal.secret'),
      });
    } catch {
      throw new AppException(ERROR_CODES.PORTAL_006.code, ERROR_CODES.PORTAL_006.message, ERROR_CODES.PORTAL_006.status);
    }

    if (payload.type !== 'portal' || !payload.caseId) {
      throw new AppException(ERROR_CODES.PORTAL_006.code, ERROR_CODES.PORTAL_006.message, ERROR_CODES.PORTAL_006.status);
    }

    request.portalCaseId = payload.caseId;
    return true;
  }
}
