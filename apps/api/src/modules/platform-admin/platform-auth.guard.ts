import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { PlatformAuthenticatedRequest } from './interfaces/platform-authenticated-request.interface';
import { PlatformJwtPayload } from './interfaces/platform-jwt-payload.interface';

/**
 * Weryfikuje token administratora platformy WYŁĄCZNIE względem
 * `platformAuth.jwtSecret` — token pracowniczy (`jwt.accessSecret`) czy
 * Portalu Klienta (`portal.secret`) NIGDY nie przejdzie tej weryfikacji,
 * nawet przypadkiem, bo klucze są rozłączne (patrz doc-comment
 * `PlatformAuthConfig` w `configuration.ts`). Endpointy Platform Admin są
 * oznaczone `@Public()` WZGLĘDEM `JwtAuthGuard` (pracowniczy, globalny) —
 * TEN guard jest ich jedyną, dedykowaną bramką, dołączaną jawnie przez
 * `@UseGuards(PlatformAuthGuard)` na kontrolerze.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformAuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    const jwtSecret = this.config.get<string | null>('platformAuth.jwtSecret');

    if (!token || !jwtSecret) {
      throw new AppException(
        ERROR_CODES.AUTH_003.code,
        ERROR_CODES.AUTH_003.message,
        ERROR_CODES.AUTH_003.status,
      );
    }

    try {
      const payload = await this.jwtService.verifyAsync<PlatformJwtPayload>(token, {
        secret: jwtSecret,
      });
      if (payload.type !== 'platform-admin') throw new Error('Nieprawidłowy typ tokenu.');
      request.platformAdmin = { platformAdminId: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new AppException(
        ERROR_CODES.AUTH_003.code,
        ERROR_CODES.AUTH_003.message,
        ERROR_CODES.AUTH_003.status,
      );
    }
  }
}
