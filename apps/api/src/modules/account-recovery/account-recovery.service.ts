import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { generateAccountToken, hashAccountToken } from '../../common/utils/account-token.util';
import { IMailService, MAIL_SERVICE } from '../../mail/mail.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../auth/services/password.service';
import { RefreshTokenStoreService } from '../auth/services/refresh-token-store.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { renderTemplate } from '../notifications/notifications.service';
import { NotificationsRepository } from '../notifications/notifications.repository';
import { UsersRepository } from '../users/users.repository';

/** Link ważny 24h — dłużej niż token resetu hasła (poniżej): potwierdzenie e-maila nie odblokowuje NICZEGO wrażliwego samo w sobie (konto i tak wymaga hasła do zalogowania), więc dłuższe okno jest bezpieczne i wygodniejsze dla kogoś, kto nie sprawdza poczty od razu. */
const EMAIL_VERIFICATION_TTL_HOURS = 24;

/** Link ważny 60 minut — token resetu hasła jest równoważny hasłu (kto go ma, może przejąć konto), więc krótsze okno niż weryfikacja e-maila — ten sam kompromis co `Partnership.inviteTokenHash` (dni) vs typowe 1h resetu hasła w branży. */
const PASSWORD_RESET_TTL_MINUTES = 60;

/**
 * Fundament „Fresh Install" — potwierdzenie e-maila + samoobsługowy reset
 * hasła. Oba e-maile omijają `NotificationsService.createNotificationFromTemplate`/
 * `Notification`/`NotificationDispatcherService` (patrz doc-comment
 * `NotificationsRepository.findGlobalTemplate`): są wysyłane SYNCHRONICZNIE,
 * przez `IMailService.sendPlatformEmail` (konfiguracja ENV, nie
 * `EmailSettings` per-tenant — nowa/niezweryfikowana firma nie ma jeszcze
 * własnej), z tym samym kontraktem "nigdy nie rzuca" — awaria wysyłki jest
 * logowana, ale NIE przerywa operacji wyzwalającej (rejestracja/żądanie
 * resetu kończy się sukcesem niezależnie od tego, czy e-mail faktycznie
 * doszedł — dokładnie ta sama zasada co NOTIFICATION-002).
 *
 * `resendVerification`/`forgotPassword` mają CELOWO neutralny efekt
 * uboczny: gdy konto nie istnieje / już zweryfikowane / nieaktywne, metoda
 * po prostu nic nie robi i wraca — kontroler nie ma więc czego rozróżnić w
 * odpowiedzi (przeciw enumeracji kont, wprost wymagane w zadaniu).
 */
@Injectable()
export class AccountRecoveryService {
  private readonly logger = new Logger(AccountRecoveryService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly notificationsRepository: NotificationsRepository,
    @Inject(MAIL_SERVICE) private readonly mailService: IMailService,
    private readonly passwordService: PasswordService,
    private readonly companySettingsService: CompanySettingsService,
    private readonly refreshTokenStore: RefreshTokenStoreService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Wołane WYŁĄCZNIE z `CompaniesService.signup()` — token jest generowany
   * TAM (razem z resztą danych zakładanej firmy, w jednej transakcji z
   * utworzeniem `User`), ta metoda tylko wysyła gotowy link. `companyName`
   * przekazane wprost (nie doczytywane z bazy) — w chwili wywołania firma
   * jest już znana wołającemu, bez potrzeby dodatkowego zapytania.
   */
  async sendVerificationEmail(params: {
    email: string;
    firstName: string;
    companyName: string;
    token: string;
  }): Promise<void> {
    await this.dispatchAccountEmail('account.emailVerification', params.email, {
      firstName: params.firstName,
      companyName: params.companyName,
      verificationUrl: this.buildLink('verify-email', params.token),
      expiresInHours: String(EMAIL_VERIFICATION_TTL_HOURS),
    });
  }

  /** `POST /auth/verify-email` — AUTH-008 (link nieprawidłowy/wygasły/już użyty) obejmuje WSZYSTKIE te trzy przypadki tym samym komunikatem, bez rozróżniania — nie ma co ujawniać atakującemu, który z nich zaszedł. */
  async verifyEmail(token: string): Promise<void> {
    const user = await this.usersRepository.findByEmailVerificationTokenHash(
      hashAccountToken(token),
    );
    if (
      !user ||
      !user.emailVerificationTokenExpiresAt ||
      user.emailVerificationTokenExpiresAt < new Date()
    ) {
      throw new AppException(
        ERROR_CODES.AUTH_008.code,
        ERROR_CODES.AUTH_008.message,
        ERROR_CODES.AUTH_008.status,
      );
    }
    await this.usersRepository.markEmailVerified(user.id);
  }

  /** `POST /auth/verify-email/resend` — rate-limited na poziomie kontrolera (`@Throttle`, ten sam wzorzec co `POST /companies/signup`). */
  async resendVerification(email: string): Promise<void> {
    const user = await this.usersRepository.findPasswordAccountByEmail(email);
    if (!user || user.emailVerifiedAt) return;

    const token = generateAccountToken();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);
    await this.usersRepository.setEmailVerificationToken(
      user.id,
      hashAccountToken(token),
      expiresAt,
    );

    const companyName = await this.getCompanyName(user.companyId);
    // `email` (parametr), nie `user.email` — logicznie ten sam string (znaleziony
    // przez dokładne dopasowanie `WHERE email = ...`), ale typowany jako `string`,
    // nie `string | null` (kolumna nullable od zadania "Pracownicy bez e-maila").
    await this.dispatchAccountEmail('account.emailVerificationResend', email, {
      firstName: user.firstName,
      companyName,
      verificationUrl: this.buildLink('verify-email', token),
      expiresInHours: String(EMAIL_VERIFICATION_TTL_HOURS),
    });
  }

  /** `POST /auth/forgot-password` — rate-limited na poziomie kontrolera. Konto `loginMethod=Pin` nie ma czego zresetować tą drogą (brak e-maila jako danych logowania) — `findPasswordAccountByEmail` naturalnie je pomija. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersRepository.findPasswordAccountByEmail(email);
    if (!user || !user.active) return;

    const token = generateAccountToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
    await this.usersRepository.setPasswordResetToken(user.id, hashAccountToken(token), expiresAt);

    const companyName = await this.getCompanyName(user.companyId);
    // `email` (parametr), ten sam powód co w `resendVerification` wyżej.
    await this.dispatchAccountEmail('account.passwordReset', email, {
      firstName: user.firstName,
      companyName,
      resetUrl: this.buildLink('reset-password', token),
      expiresInMinutes: String(PASSWORD_RESET_TTL_MINUTES),
    });
  }

  /**
   * `POST /auth/reset-password` — AUTH-009 dla token nieprawidłowy/wygasły/już
   * użyty (jednorazowy: `updatePasswordAndClearResetToken` kasuje go w tym
   * samym zapisie co nowe hasło). Polityka hasła firmy egzekwowana TU
   * (dopiero tu `companyId` jest znane z tokenu) — ten sam mechanizm co
   * `UsersService.create`/`resetPassword`. Sesja unieważniana PO zmianie
   * hasła (`RefreshTokenStoreService.revoke`) — każdy refresh token wydany
   * przed resetem przestaje działać, zgodnie z zadaniem.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.usersRepository.findByPasswordResetTokenHash(hashAccountToken(token));
    if (
      !user ||
      !user.passwordResetTokenExpiresAt ||
      user.passwordResetTokenExpiresAt < new Date()
    ) {
      throw new AppException(
        ERROR_CODES.AUTH_009.code,
        ERROR_CODES.AUTH_009.message,
        ERROR_CODES.AUTH_009.status,
      );
    }

    await this.companySettingsService.assertPasswordMeetsPolicy(user.companyId, newPassword);
    const passwordHash = await this.passwordService.hash(newPassword);
    await this.usersRepository.updatePasswordAndClearResetToken(user.id, passwordHash);
    await this.refreshTokenStore.revoke(user.id);
  }

  private async getCompanyName(companyId: string): Promise<string> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    return company?.name ?? 'SmartRMA';
  }

  private buildLink(path: string, token: string): string {
    const publicUrl = this.config.get<string>('publicUrl.url')!;
    return `${publicUrl}/${path}?token=${encodeURIComponent(token)}`;
  }

  /** Wspólna ścieżka wysyłki dla wszystkich trzech szablonów `account.*` (patrz doc-comment klasy) — brak globalnego szablonu (seed nieuruchomiony) i awaria transportu kończą się TAK SAMO: ostrzeżenie w logu, operacja wyzwalająca (rejestracja/reset) i tak kończy się sukcesem. */
  private async dispatchAccountEmail(
    code: string,
    to: string,
    variables: Record<string, string>,
  ): Promise<void> {
    const template = await this.notificationsRepository.findGlobalTemplate(
      code,
      NotificationChannel.Email,
    );
    if (!template) {
      this.logger.warn(
        `NOTIFICATION-002 — brak globalnego szablonu '${code}' (seed.ts nie uruchomiony?) — e-mail konta pominięty.`,
      );
      return;
    }

    const subject = template.subject ? renderTemplate(template.subject, variables) : code;
    const html = renderTemplate(template.bodyTemplate, variables);
    const result = await this.mailService.sendPlatformEmail({ to, subject, html });
    if (!result.ok) {
      this.logger.warn(`Wysyłka e-maila konta ('${code}', to=${to}) nieudana: ${result.error}`);
    }
  }
}
