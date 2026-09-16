import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { PasswordService } from '../auth/services/password.service';
import { PlatformAdminRepository } from './platform-admin.repository';
import { PlatformAuthTokensEntity } from './entities/platform-auth-tokens.entity';
import { PlatformJwtPayload } from './interfaces/platform-jwt-payload.interface';

/**
 * Fundament „Fresh Install" — uwierzytelnienie `PlatformAdmin`, CAŁKOWICIE
 * niezależne od `AuthService` (pracownicy)/`PortalService` (Portal Klienta):
 * osobny sekret JWT (`platformAuth.jwtSecret`, patrz `configuration.ts`),
 * osobny model bez relacji do `Company`/`User`. Reużywa WYŁĄCZNIE
 * `PasswordService` (bcrypt — nie ma powodu wymyślać drugiego hashowania
 * haseł w tej samej aplikacji).
 *
 * Zakres celowo MINIMALNY (wprost z zadania: "kontrolowane, PÓŹNIEJSZE
 * założenie" — `PlatformAdmin` NIE jest zakładany w tej fazie): bez refresh
 * tokenu/allowlisty Redis/blokady po nieudanych próbach — jeden krótko żyjący
 * access token (`platformAuth.accessExpiresIn`, domyślnie 30 min). Do
 * rozszerzenia PO tym, jak w ogóle powstanie pierwszy `PlatformAdmin` i
 * realny operacyjny przypadek użycia to uzasadni.
 */
@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly platformAdminRepository: PlatformAdminRepository,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * PLATFORM-001 dla WSZYSTKIE przyczyny nieudanego logowania (e-mail nie
   * istnieje, hasło złe, funkcja nieskonfigurowana — `PLATFORM_JWT_SECRET`
   * puste) — ten sam komunikat niezależnie od przyczyny, dokładnie jak
   * `AuthService.validateCredentials`/AUTH-001 (nie zdradza, które adresy
   * istnieją). PLATFORM-002 WYŁĄCZNIE dla poprawnych danych na koncie
   * `active=false` — rozróżnienie jest bezpieczne dopiero PO potwierdzeniu
   * hasła, ten sam wzorzec co `AuthService.validatePasswordLogin`/AUTH-002.
   */
  async login(email: string, password: string): Promise<PlatformAuthTokensEntity> {
    const jwtSecret = this.config.get<string | null>('platformAuth.jwtSecret');
    const admin = jwtSecret ? await this.platformAdminRepository.findByEmail(email) : null;
    const passwordMatches = admin
      ? await this.passwordService.compare(password, admin.passwordHash)
      : false;

    if (!admin || !passwordMatches) {
      throw new AppException(
        ERROR_CODES.PLATFORM_001.code,
        ERROR_CODES.PLATFORM_001.message,
        ERROR_CODES.PLATFORM_001.status,
      );
    }
    if (!admin.active) {
      throw new AppException(
        ERROR_CODES.PLATFORM_002.code,
        ERROR_CODES.PLATFORM_002.message,
        ERROR_CODES.PLATFORM_002.status,
      );
    }

    await this.platformAdminRepository.touchLastLogin(admin.id);

    const expiresInSeconds = this.parseExpiresInSeconds(
      this.config.get<string>('platformAuth.accessExpiresIn')!,
    );
    const payload: PlatformJwtPayload = {
      sub: admin.id,
      email: admin.email,
      type: 'platform-admin',
    };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: jwtSecret!,
      expiresIn: expiresInSeconds,
    });

    return { accessToken, expiresIn: expiresInSeconds };
  }

  private parseExpiresInSeconds(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value);
    if (!match) return 1800;
    const amount = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return amount * multipliers[unit];
  }
}
