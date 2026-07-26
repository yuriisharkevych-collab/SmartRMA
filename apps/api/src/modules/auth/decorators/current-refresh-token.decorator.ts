import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { RefreshTokenContext } from '../interfaces/jwt-payload.interface';

/**
 * `@CurrentRefreshToken() ctx: RefreshTokenContext` — odpowiednik
 * `@CurrentUser()` dla tras za `RefreshTokenGuard`. Osobny od
 * `@CurrentUser()` celowo: ten drugi jest typowany na `AuthenticatedUser`
 * (kształt z `JwtStrategy`), a `request.user` za `RefreshTokenGuard` ma
 * inny, węższy kształt (`{ userId, jti }` z `JwtRefreshStrategy`) — użycie
 * `@CurrentUser()` tutaj byłoby technicznie działające (oba tylko czytają
 * `request.user`), ale nieuczciwie otypowane.
 */
export const CurrentRefreshToken = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RefreshTokenContext => {
    const request = ctx.switchToHttp().getRequest<Request & { user: RefreshTokenContext }>();
    return request.user;
  },
);
