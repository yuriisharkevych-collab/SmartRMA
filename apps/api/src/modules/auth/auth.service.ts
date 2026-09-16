import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { isEmail } from 'class-validator';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { AuthorizationService } from '../../rbac/authorization.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { UserWithRoles } from '../users/mappers/user.mapper';
import { UsersRepository } from '../users/users.repository';
import { AuthTokensEntity } from './entities/auth-tokens.entity';
import { JwtAccessPayload, JwtRefreshPayload } from './interfaces/jwt-payload.interface';
import { PasswordService } from './services/password.service';
import { PinLoginAttemptStoreService } from './services/pin-login-attempt-store.service';
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
    private readonly pinLoginAttemptStore: PinLoginAttemptStoreService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly companySettingsService: CompanySettingsService,
  ) {}

  /**
   * AUTH-001/AUTH-002/AUTH-005/AUTH-006 — wołane przez `LocalStrategy`.
   * `secret` niesie hasło ALBO PIN — `LoginDto`/kontrakt `/auth/login` się
   * nie zmienia (nadal pole `password`), rozstrzygnięcie który to przypadek
   * zależy WYŁĄCZNIE od tego, jaki `loginMethod` mają konta pod danym
   * e-mailem (patrz komentarz przy `User.loginMethod` w schema.prisma —
   * właściciel: wiele stanowisk w firmie dzieli jeden e-mail firmowy, PIN
   * odróżnia pracownika).
   */
  async validateCredentials(
    email: string,
    secret: string,
    context?: LoginContext,
  ): Promise<UserWithRoles> {
    // `LoginDto.email` niesie `@IsEmail({message:'VALIDATION-002'})`, ale `LocalAuthGuard`
    // (Passport) wykonuje się PRZED `ValidationPipe` w cyklu życia żądania Nest — ten
    // dekorator nigdy by się nie uruchomił dla tego endpointu bez powtórzenia sprawdzenia
    // tutaj. Sam format e-maila (bez odpytania bazy) nie ujawnia, czy konto istnieje.
    if (!isEmail(email)) {
      throw new AppException(
        ERROR_CODES.VALIDATION_002.code,
        ERROR_CODES.VALIDATION_002.message,
        ERROR_CODES.VALIDATION_002.status,
        { field: 'email' },
      );
    }

    const passwordAccount = await this.usersRepository.findPasswordAccountByEmail(email);
    if (passwordAccount) {
      return this.validatePasswordLogin(passwordAccount, secret, context);
    }

    const pinCandidates = await this.usersRepository.findPinAccountsByEmail(email);
    if (pinCandidates.length === 0) {
      throw new AppException(
        ERROR_CODES.AUTH_001.code,
        ERROR_CODES.AUTH_001.message,
        ERROR_CODES.AUTH_001.status,
      );
    }
    return this.validatePinLogin(email, pinCandidates, secret);
  }

  /**
   * Ścieżka logowania hasłem — DOKŁADNIE dotychczasowa logika (blokada
   * per-konto przez `LoginEvent`, AUTH-002 nieaktywne, bcrypt), tylko
   * wydzielona do osobnej metody. Nieudane próby zapisujemy do `LoginEvent`
   * TYLKO wtedy, gdy e-mail wskazuje istniejące konto Password — dla
   * nieistniejącego nie ma `userId`, a `LoginEvent.userId` jest wymagane.
   * Komunikat błędu pozostaje ten sam (AUTH-001) niezależnie od przyczyny,
   * żeby nie zdradzać, które adresy istnieją.
   */
  private async validatePasswordLogin(
    user: UserWithRoles,
    password: string,
    context?: LoginContext,
  ): Promise<UserWithRoles> {
    const { maxLoginAttempts, lockoutDurationMinutes } =
      await this.companySettingsService.getSettings(user.companyId);
    const lockoutWindowStart = new Date(Date.now() - lockoutDurationMinutes * 60_000);
    const recentFailures = await this.usersRepository.countRecentFailedLoginEvents(
      user.id,
      lockoutWindowStart,
    );
    if (recentFailures >= maxLoginAttempts) {
      await this.recordLoginAttempt(user.id, context, false);
      throw new AppException(
        ERROR_CODES.AUTH_005.code,
        ERROR_CODES.AUTH_005.message,
        ERROR_CODES.AUTH_005.status,
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
    // `passwordHash` jest nullable w schemacie (kolumna dzielona z kontami
    // Pin), ale ZAWSZE ustawiony dla loginMethod=Password — pilnowane
    // aplikacyjnie w UsersService.create/resetPassword, nie przez typ.
    const passwordMatches = await this.passwordService.compare(password, user.passwordHash!);
    if (!passwordMatches) {
      await this.recordLoginAttempt(user.id, context, false);
      throw new AppException(
        ERROR_CODES.AUTH_001.code,
        ERROR_CODES.AUTH_001.message,
        ERROR_CODES.AUTH_001.status,
      );
    }

    // Fundament „Fresh Install" — PO potwierdzeniu hasła (nie przed), żeby AUTH-007
    // nie zdradzał komuś bez hasła, że dany e-mail istnieje, a tylko czeka na
    // potwierdzenie. `emailVerifiedAt=null` obejmuje WYŁĄCZNIE konta z self-service
    // `POST /companies/signup` (`CompaniesRepository.createFirstAdmin`) — każde inne
    // źródło konta (`UsersRepository.create`, `PartnershipsRepository.createAdminUser`,
    // skrypty bootstrapujące) ustawia tę kolumnę od razu, patrz komentarze tam.
    if (!user.emailVerifiedAt) {
      await this.recordLoginAttempt(user.id, context, false);
      throw new AppException(
        ERROR_CODES.AUTH_007.code,
        ERROR_CODES.AUTH_007.message,
        ERROR_CODES.AUTH_007.status,
      );
    }

    return user;
  }

  /**
   * Ścieżka logowania PIN-em — `candidates` to WSZYSTKIE aktywne konta
   * `loginMethod=Pin` dzielące dany e-mail. Blokada (AUTH-006) liczona per
   * e-mail w Redis (`PinLoginAttemptStoreService`), PRZED próbą
   * dopasowania — dopóki żaden PIN się nie zgodzi, nie wiadomo, które
   * konto ktoś atakuje, więc nie da się (i nie trzeba) zapisywać
   * `LoginEvent` dla nieudanych prób PIN — dokładnie ta sama zasada co
   * "e-mail nie istnieje" w `validateCredentials`.
   */
  private async validatePinLogin(
    email: string,
    candidates: UserWithRoles[],
    pin: string,
  ): Promise<UserWithRoles> {
    const { maxPinAttempts, pinLockoutDurationMinutes } =
      await this.companySettingsService.getSettings(candidates[0].companyId);
    const failedCount = await this.pinLoginAttemptStore.getFailedCount(email);
    if (failedCount >= maxPinAttempts) {
      throw new AppException(
        ERROR_CODES.AUTH_006.code,
        ERROR_CODES.AUTH_006.message,
        ERROR_CODES.AUTH_006.status,
      );
    }

    for (const candidate of candidates) {
      // pinHash ZAWSZE ustawiony dla loginMethod=Pin, aktywny — pilnowane
      // aplikacyjnie w UsersService.create/resetPin.
      const matches = await this.passwordService.compare(pin, candidate.pinHash!);
      if (matches) {
        await this.pinLoginAttemptStore.resetFailedCount(email);
        return candidate;
      }
    }

    await this.pinLoginAttemptStore.recordFailedAttempt(email, pinLockoutDurationMinutes * 60);
    throw new AppException(
      ERROR_CODES.AUTH_001.code,
      ERROR_CODES.AUTH_001.message,
      ERROR_CODES.AUTH_001.status,
    );
  }

  /** POST /auth/login — wydaje NOWĄ parę tokenów i NOWY `jti` (nadpisuje ewentualną poprzednią sesję w Redis). Czas życia refresh tokena (realna "długość sesji") pochodzi z Ustawień firmy, nie ze statycznego `JWT_REFRESH_EXPIRES_IN`. */
  async login(user: UserWithRoles, context?: LoginContext): Promise<AuthTokensEntity> {
    await this.usersRepository.touchLastLogin(user.id);
    await this.recordLoginAttempt(user.id, context, true);
    const permissions = await this.authorizationService.getEffectivePermissions(user.id);
    const roles = user.roles.map((assignment) => assignment.role.code);
    const { sessionTimeoutMinutes } = await this.companySettingsService.getSettings(user.companyId);

    const accessPayload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      companyId: user.companyId,
      shopId: user.shopId,
      roles,
      permissions,
      type: 'access',
    };
    return this.issueTokenPair(user.id, accessPayload, sessionTimeoutMinutes * 60);
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

  /** `refreshExpiresInSecondsOverride` — długość sesji skonfigurowana per firma (Ustawienia › Bezpieczeństwo); brak (np. `refresh()`, gdzie sesja już trwa i tylko wydajemy nową parę w jej ramach) = statyczny `JWT_REFRESH_EXPIRES_IN`. */
  private async issueTokenPair(
    userId: string,
    accessPayload: JwtAccessPayload,
    refreshExpiresInSecondsOverride?: number,
  ): Promise<AuthTokensEntity> {
    const accessExpiresIn = this.config.get<string>('jwt.accessExpiresIn')!;
    const refreshExpiresInSeconds =
      refreshExpiresInSecondsOverride ??
      this.parseExpiresInSeconds(this.config.get<string>('jwt.refreshExpiresIn')!);
    const jti = randomUUID();
    const refreshPayload: JwtRefreshPayload = { sub: userId, jti, type: 'refresh' };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: accessExpiresIn,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: refreshExpiresInSeconds,
      }),
    ]);

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
