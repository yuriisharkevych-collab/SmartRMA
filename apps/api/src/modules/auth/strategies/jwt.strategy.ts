import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { JwtAccessPayload } from '../interfaces/jwt-payload.interface';

/**
 * Weryfikuje access token i mapuje jego zawartość na `request.user`
 * (`AuthenticatedUser`) — stąd korzystają `PermissionsGuard` i `@CurrentUser()`.
 * Nie odpytuje bazy przy każdym żądaniu — uprawnienia/role są już w tokenie
 * (wyliczone raz przy logowaniu przez `AuthorizationService`). Konsekwencja:
 * zmiana ról użytkownika staje się skuteczna dopiero po odświeżeniu tokenu
 * (świadomy kompromis wydajność/aktualność, do rewizji jeśli okaże się
 * problemem operacyjnym — np. krótszy `JWT_ACCESS_EXPIRES_IN`).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }

  validate(payload: JwtAccessPayload): AuthenticatedUser {
    return {
      userId: payload.sub,
      companyId: payload.companyId,
      shopId: payload.shopId,
      email: payload.email,
      login: payload.login,
      firstName: payload.firstName,
      lastName: payload.lastName,
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }
}
