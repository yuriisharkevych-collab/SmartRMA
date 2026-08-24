import { Injectable } from '@nestjs/common';
import { EmailSettings, EmailProvider, SmtpEncryption } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { EncryptionService } from '../../crypto/encryption.service';
import {
  AiSettingsUpdate,
  CompanySettingsRepository,
  CompanySettingsUpdate,
  EmailSettingsUpdate,
} from './company-settings.repository';
import { PasswordPolicy, validatePasswordPolicy } from './password-policy.util';

/** Wartości domyślne, gdy firma jeszcze nie ma wiersza `CompanySettings` (leniwe tworzenie przy pierwszym zapisie) — muszą być identyczne z `@default(...)` w schema.prisma. */
const DEFAULT_SETTINGS = {
  caseNumberPrefix: 'RMA',
  caseNumberPadding: 5,
  caseNumberResetYearly: true,
  passwordMinLength: 8,
  passwordRequireUppercase: true,
  passwordRequireNumber: true,
  passwordRequireSymbol: false,
  sessionTimeoutMinutes: 10080,
  maxLoginAttempts: 5,
  lockoutDurationMinutes: 15,
  twoFactorEnabled: false,
  pinLoginEnabled: false,
  pinLength: 6,
  maxPinAttempts: 3,
  pinLockoutDurationMinutes: 30,
  defaultStatusStaleDays: null as number | null,
  defaultCaseAgeStaleDays: null as number | null,
};

const DEFAULT_AI_SETTINGS = {
  monitorCompleteness: false,
  trackDeadlines: false,
  draftCustomerReplies: false,
  draftManufacturerMessages: false,
  analyzeHistory: false,
  generateDailyPlan: false,
  analyzePhotos: false,
  findSimilarCases: false,
};

const DEFAULT_EMAIL_SETTINGS = {
  provider: EmailProvider.Smtp as EmailProvider,
  senderName: null as string | null,
  senderEmail: null as string | null,
  smtpHost: null as string | null,
  smtpPort: null as number | null,
  smtpUsername: null as string | null,
  smtpEncryption: SmtpEncryption.Tls as SmtpEncryption,
  hasSmtpPassword: false,
  hasResendApiKey: false,
};

export type CompanySettingsView = typeof DEFAULT_SETTINGS;
export type AiSettingsView = typeof DEFAULT_AI_SETTINGS;
/** Widok bezpieczny dla API — NIGDY nie zawiera odszyfrowanych sekretów, tylko flagi `has*` (czy coś jest zapisane). Sekret przychodzi z powrotem wyłącznie w momencie faktycznej wysyłki (`getEmailSettingsForSending`, konsument: `MailService`). */
export type EmailSettingsView = typeof DEFAULT_EMAIL_SETTINGS;

/** Wejście `updateEmailSettings` — `smtpPassword`/`resendApiKey` to PLAINTEXT, zapisywane WYŁĄCZNIE gdy niepuste (patrz metoda) — pominięcie/pusty string zostawia istniejący szyfrogram nietknięty. */
export interface UpdateEmailSettingsInput {
  provider?: EmailProvider;
  senderName?: string;
  senderEmail?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpPassword?: string;
  smtpEncryption?: SmtpEncryption;
  resendApiKey?: string;
}

/**
 * Jedyny konsument `CompanySettingsRepository` — moduł bez zależności od
 * innych modułów funkcjonalnych (Cases/Users/Auth importują TEN moduł, nie
 * odwrotnie), żeby uniknąć cykli. Brakujący wiersz w bazie NIGDY nie jest
 * błędem — `getX()` zwraca wtedy `DEFAULT_*` bez dotykania bazy zapisem
 * (odczyt ustawień nie powinien mieć efektu ubocznego); dopiero `upsertX()`
 * materializuje wiersz.
 */
@Injectable()
export class CompanySettingsService {
  constructor(
    private readonly repository: CompanySettingsRepository,
    private readonly encryption: EncryptionService,
  ) {}

  async getSettings(companyId: string): Promise<CompanySettingsView> {
    const row = await this.repository.findCompanySettings(companyId);
    if (!row) return DEFAULT_SETTINGS;
    const { id: _id, companyId: _companyId, updatedAt: _updatedAt, ...rest } = row;
    return { ...DEFAULT_SETTINGS, ...rest };
  }

  async getAiSettings(companyId: string): Promise<AiSettingsView> {
    const row = await this.repository.findAiSettings(companyId);
    if (!row) return DEFAULT_AI_SETTINGS;
    const { id: _id, companyId: _companyId, updatedAt: _updatedAt, ...rest } = row;
    return { ...DEFAULT_AI_SETTINGS, ...rest };
  }

  async getEmailSettings(companyId: string): Promise<EmailSettingsView> {
    const row = await this.repository.findEmailSettings(companyId);
    if (!row) return DEFAULT_EMAIL_SETTINGS;
    return {
      provider: row.provider,
      senderName: row.senderName,
      senderEmail: row.senderEmail,
      smtpHost: row.smtpHost,
      smtpPort: row.smtpPort,
      smtpUsername: row.smtpUsername,
      smtpEncryption: row.smtpEncryption,
      hasSmtpPassword: Boolean(row.smtpPasswordEncrypted),
      hasResendApiKey: Boolean(row.resendApiKeyEncrypted),
    };
  }

  /** Konsument: WYŁĄCZNIE `MailService` (patrz `mail/mail.service.ts`) — jedyne miejsce, gdzie odszyfrowane sekrety opuszczają tę usługę. Nigdy nie wołać z kontrolera. */
  async getEmailSettingsForSending(companyId: string): Promise<EmailSettings | null> {
    return this.repository.findEmailSettings(companyId);
  }

  /** `smtpPassword`/`resendApiKey` zapisywane WYŁĄCZNIE gdy niepuste — pominięcie pola przy PATCH (np. zmiana samej nazwy nadawcy) nie kasuje istniejącego zaszyfrowanego sekretu. */
  async updateEmailSettings(
    companyId: string,
    data: UpdateEmailSettingsInput,
  ): Promise<EmailSettingsView> {
    const { smtpPassword, resendApiKey, ...rest } = data;
    const update: EmailSettingsUpdate = { ...rest };
    if (smtpPassword) update.smtpPasswordEncrypted = this.encryption.encrypt(smtpPassword);
    if (resendApiKey) update.resendApiKeyEncrypted = this.encryption.encrypt(resendApiKey);

    const row = await this.repository.upsertEmailSettings(companyId, update);
    return {
      provider: row.provider,
      senderName: row.senderName,
      senderEmail: row.senderEmail,
      smtpHost: row.smtpHost,
      smtpPort: row.smtpPort,
      smtpUsername: row.smtpUsername,
      smtpEncryption: row.smtpEncryption,
      hasSmtpPassword: Boolean(row.smtpPasswordEncrypted),
      hasResendApiKey: Boolean(row.resendApiKeyEncrypted),
    };
  }

  async updateSettings(
    companyId: string,
    data: CompanySettingsUpdate,
  ): Promise<CompanySettingsView> {
    const row = await this.repository.upsertCompanySettings(companyId, data);
    const { id: _id, companyId: _companyId, updatedAt: _updatedAt, ...rest } = row;
    return { ...DEFAULT_SETTINGS, ...rest };
  }

  async updateAiSettings(companyId: string, data: AiSettingsUpdate): Promise<AiSettingsView> {
    const row = await this.repository.upsertAiSettings(companyId, data);
    const { id: _id, companyId: _companyId, updatedAt: _updatedAt, ...rest } = row;
    return { ...DEFAULT_AI_SETTINGS, ...rest };
  }

  /** AUTH-004 — wołane przez `UsersService` przy tworzeniu konta/resecie hasła na hasło podane jawnie (nie dotyczy haseł tymczasowych generowanych przez `crypto.randomInt`, te z definicji spełniają każdą rozsądną politykę). */
  async assertPasswordMeetsPolicy(companyId: string, plainPassword: string): Promise<void> {
    const settings = await this.getSettings(companyId);
    const policy: PasswordPolicy = {
      passwordMinLength: settings.passwordMinLength,
      passwordRequireUppercase: settings.passwordRequireUppercase,
      passwordRequireNumber: settings.passwordRequireNumber,
      passwordRequireSymbol: settings.passwordRequireSymbol,
    };
    const violations = validatePasswordPolicy(plainPassword, policy);
    if (violations.length > 0) {
      throw new AppException(
        ERROR_CODES.AUTH_004.code,
        `Hasło musi zawierać: ${violations.join(', ')}.`,
        ERROR_CODES.AUTH_004.status,
      );
    }
  }

  /**
   * USER-007/USER-008 — wołane przez `UsersService` przy tworzeniu/resecie
   * konta `loginMethod=Pin`. Prostsze niż `assertPasswordMeetsPolicy` (sam
   * PIN, bez wielkich liter/symboli) — dokładna długość z `pinLength`, same
   * cyfry. `pinLoginEnabled=false` blokuje CAŁKOWICIE (USER-008) — firma
   * musi świadomie włączyć ten słabszy mechanizm w Ustawienia › Bezpieczeństwo.
   */
  async assertPinMeetsPolicy(companyId: string, pin: string): Promise<void> {
    const settings = await this.getSettings(companyId);
    if (!settings.pinLoginEnabled) {
      throw new AppException(
        ERROR_CODES.USER_008.code,
        ERROR_CODES.USER_008.message,
        ERROR_CODES.USER_008.status,
      );
    }
    if (!/^\d+$/.test(pin) || pin.length !== settings.pinLength) {
      throw new AppException(
        ERROR_CODES.USER_007.code,
        `PIN musi mieć dokładnie ${settings.pinLength} cyfr.`,
        ERROR_CODES.USER_007.status,
      );
    }
  }
}
