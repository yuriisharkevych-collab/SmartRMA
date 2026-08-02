import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { AuthorizationService } from '../../rbac/authorization.service';
import { UserWithRoles } from '../users/mappers/user.mapper';
import { UsersRepository } from '../users/users.repository';
import { AuthTokensEntity } from './entities/auth-tokens.entity';
import { JwtAccessPayload, JwtRefreshPayload } from './interfaces/jwt-payload.interface';
import { PasswordService } from './services/password.service';
import { RefreshTokenStoreService } from './services/refresh-token-store.service';

/** Kontekst żądania dla `LoginEvent` — przekazywany z kontrolera/strategii, bo serwis nie zna `Request`. */
export interface LoginContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * AUTH-00x (ERROR_CODES.md). `LoginEvent` (DATABASE.md §9, BR-089) —
 * zapis udanych i NIEUDANYCH prób logowania podłączony przy module
 * Użytkownicy (wcześniej TODO): bez tego dziennika ekran „Historia"
 * użytkownika nie miałby czego pokazać, a próby dobrania się do konta
 * nie zostawiałyby śladu.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly passwordService: PasswordService,
    private readonly refreshTokenStore: RefreshTokenStoreService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * AUTH-001/AUTH-002 — wołane przez `LocalStrategy`.
   *
   * Nieudane próby zapisujemy do `LoginEvent` TYLKO wtedy, gdy e-mail
   * wskazuje istniejące konto — dla nieistniejącego nie ma `userId`, a
   * `LoginEvent.userId` jest wymagane. Komunikat błędu pozostaje ten sam
   * (AUTH-001) w obu przypadkach, żeby nie zdradzać, które adresy istnieją.
   */
  async validateCredentials(
    email: string,
    password: string,
    context?: LoginContext,
  ): Promise<UserWithRoles> {
    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      throw new AppException(
        ERROR_CODES.AUTH_001.code,
        ERROR_CODES.AUTH_001.message,
        ERROR_CODES.AUTH_001.status,
      );
    }
    if (!user.active) {
      await this.recordLoginAttempt(user.id, context, false);
      throw new AppException(
        ERROR_CODES.AUTH_002.code,
        ERROR_CODES.AUTH_002.message,
        ERROR_CODES.AUTH_002.status,
      );
    }
    const passwordMatches = await this.passwordService.compare(password, user.passwordHash);
    if (!passwordMatches) {
      await this.recordLoginAttempt(user.id, context, false);
      throw new AppException(
        ERROR_CODES.AUTH_001.code,
        ERROR_CODES.AUTH_001.message,
        ERROR_CODES.AUTH_001.status,
      );
    }
    return user;
  }

  /** POST /auth/login — wydaje NOWĄ parę tokenów i NOWY `jti` (nadpisuje ewentualną poprzednią sesję w Redis). */
  async login(user: UserWithRoles, context?: LoginContext): Promise<AuthTokensEntity> {
    await this.usersRepository.touchLastLogin(user.id);
    await this.recordLoginAttempt(user.id, context, true);
    const permissions = await this.authorizationService.getEffectivePermissions(user.id);
    const roles = user.roles.map((assignment) => assignment.role.code);

    const accessPayload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      companyId: user.companyId,
      shopId: user.shopId,
      roles,
      permissions,
      type: 'access',
    };
    return this.issueTokenPair(user.id, accessPayload);
  }

  /**
   * POST /auth/refresh — `userId` już zweryfikowany przez `RefreshTokenGuard`
   * (podpis + allowlist Redis, patrz `JwtRefreshStrategy`). Tutaj tylko
   * dociągamy AKTUALNE dane użytkownika (role/uprawnienia mogły się zmienić
   * od ostatniego logowania — `JwtStrategy` komentuje ten sam kompromis) i
   * wydajemy NOWĄ parę tokenów z NOWYM `jti`, co samo w sobie unieważnia
   * poprzedni refresh token (nadpisanie klucza w Redis — `RefreshTokenStoreService`).
   */
  async refresh(userId: string): Promise<AuthTokensEntity> {
    const user = await this.usersRepository.findById(userId);
    if (!user || !user.active) {
      throw new AppException(
        ERROR_CODES.AUTH_003.code,
        ERROR_CODES.AUTH_003.message,
        ERROR_CODES.AUTH_003.status,
      );
    }
    return this.login(user);
  }

  /** POST /auth/logout — usuwa wpis z Redis allowlist; prezentowany refresh token (już zweryfikowany przez guard) od tej chwili nie przejdzie `JwtRefreshStrategy.validate`. */
  async logout(userId: string): Promise<void> {
    await this.refreshTokenStore.revoke(userId);
  }

  /** Zapis dziennika nie może wywrócić logowania — błąd zapisu jest logowany po stronie Prismy, ale przepuszczony dalej jako cichy. */
  private async recordLoginAttempt(
    userId: string,
    context: LoginContext | undefined,
    success: boolean,
  ): Promise<void> {
    try {
      await this.usersRepository.recordLoginEvent({
        userId,
        ipAddress: context?.ipAddress ?? null,
        userAgent: context?.userAgent ?? null,
        success,
      });
    } catch {
      // celowo puste — dziennik logowań nie jest krytyczny dla samego uwierzytelnienia
    }
  }

  private async issueTokenPair(
    userId: string,
    accessPayload: JwtAccessPayload,
  ): Promise<AuthTokensEntity> {
    const accessExpiresIn = this.config.get<string>('jwt.accessExpiresIn')!;
    const refreshExpiresIn = this.config.get<string>('jwt.refreshExpiresIn')!;
    const jti = randomUUID();
    const refreshPayload: JwtRefreshPayload = { sub: userId, jti, type: 'refresh' };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: accessExpiresIn,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: refreshExpiresIn,
      }),
    ]);

    const refreshExpiresInSeconds = this.parseExpiresInSeconds(refreshExpiresIn);
    await this.refreshTokenStore.store(userId, jti, refreshExpiresInSeconds);

    return { accessToken, refreshToken, expiresIn: this.parseExpiresInSeconds(accessExpiresIn) };
  }

  private parseExpiresInSeconds(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value);
    if (!match) return 900;
    const amount = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return amount * multipliers[unit];
  }
}
