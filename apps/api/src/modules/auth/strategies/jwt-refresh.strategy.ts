import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtRefreshPayload, RefreshTokenContext } from '../interfaces/jwt-payload.interface';
import { RefreshTokenStoreService } from '../services/refresh-token-store.service';

/**
 * Odrębna strategia/sekret od `JwtStrategy` (access token) — inny `secretOrKey`
 * (`jwt.refreshSecret`), token oczekiwany w BODY (`refreshToken`), nie w
 * nagłówku `Authorization` (`RefreshTokenDto`, dzielony przez `/auth/refresh`
 * i `/auth/logout`). Po weryfikacji podpisu/wygaśnięcia dodatkowo sprawdza
 * Redis allowlist (`RefreshTokenStoreService`) — token podpisany poprawnie,
 * ale już zrotowany/wylogowany, MUSI zostać odrzucony (to jest właśnie
 * mechanizm rewokacji, nie tylko podpis).
 *
 * Rzuca gołego `UnauthorizedException` — `JwtAuthGuard`/`RefreshTokenGuard`
 * (`handleRequest`) tłumaczą to na `AppException(AUTH-003)`, zgodnie z
 * ERROR_CODES.md. Strategia sama nie zna kształtu odpowiedzi API.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    config: ConfigService,
    private readonly refreshTokenStore: RefreshTokenStoreService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.refreshSecret')!,
    });
  }

  async validate(payload: JwtRefreshPayload): Promise<RefreshTokenContext> {
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException();
    }
    const valid = await this.refreshTokenStore.isValid(payload.sub, payload.jti);
    if (!valid) {
      throw new UnauthorizedException();
    }
    return { userId: payload.sub, jti: payload.jti };
  }
}
