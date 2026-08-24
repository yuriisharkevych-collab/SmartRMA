import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { IMailService, MAIL_SERVICE } from '../../mail/mail.interface';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { BackupConfig } from '../../config/configuration';
import { AuditRepository } from '../audit/audit.repository';
import { formatCaseNumber } from '../company-settings/case-numbering.util';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { UpdateAiDto } from './dto/update-ai.dto';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto';
import { UpdateNumberingDto } from './dto/update-numbering.dto';
import { UpdateRemindersDto } from './dto/update-reminders.dto';
import { UpdateSecurityDto } from './dto/update-security.dto';
import { SettingEntity } from './entities/setting.entity';
import {
  AiSettingsEntity,
  EmailSettingsEntity,
  SettingsOverviewEntity,
} from './entities/settings-overview.entity';
import { SettingMapper } from './mappers/setting.mapper';
import { SettingsRepository } from './settings.repository';
import { SystemStatsService } from './system-stats.service';

/**
 * Dwa różne "ustawienia" żyją w JEDNYM module celowo — `Setting` (klucz/
 * wartość) to ogólny mechanizm na pojedyncze reguły biznesowe (DATABASE.md
 * §30, np. `case.archival.retentionMonths`), a `getOverview`/`updateX`
 * poniżej to STRUKTURALNY ekran administracyjny (Ustawienia › Numeracja/
 * Bezpieczeństwo/AI/Statystyki) zbudowany nad `CompanySettings`/`AiSettings`
 * (osobne tabele, silnie typowane pola). Oba mechanizmy współistnieją pod
 * `/settings`, bez kolizji tras (`GET /settings` vs `GET /settings/overview`).
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly settingsRepository: SettingsRepository,
    private readonly companySettingsService: CompanySettingsService,
    private readonly systemStatsService: SystemStatsService,
    private readonly config: ConfigService,
    private readonly auditRepository: AuditRepository,
    @Inject(MAIL_SERVICE) private readonly mailService: IMailService,
  ) {}

  async findAllForCompany(companyId: string): Promise<SettingEntity[]> {
    return SettingMapper.toEntityList(
      await this.settingsRepository.findAllVisibleToCompany(companyId),
    );
  }

  async upsert(companyId: string, dto: UpsertSettingDto): Promise<SettingEntity> {
    const setting = await this.settingsRepository.upsertForCompany(companyId, {
      key: dto.key,
      value: dto.value as Parameters<SettingsRepository['upsertForCompany']>[1]['value'],
      type: dto.type,
      description: dto.description,
    });
    return SettingMapper.toEntity(setting);
  }

  async getOverview(companyId: string): Promise<SettingsOverviewEntity> {
    const [settings, ai, email, stats] = await Promise.all([
      this.companySettingsService.getSettings(companyId),
      this.companySettingsService.getAiSettings(companyId),
      this.companySettingsService.getEmailSettings(companyId),
      this.systemStatsService.getStats(companyId),
    ]);
    const backup = this.config.get<BackupConfig>('backup')!;

    return {
      numbering: {
        caseNumberPrefix: settings.caseNumberPrefix,
        caseNumberPadding: settings.caseNumberPadding,
        caseNumberResetYearly: settings.caseNumberResetYearly,
        exampleNextNumber: formatCaseNumber(
          settings,
          new Date().getFullYear(),
          stats.caseCount + 1,
        ),
      },
      security: {
        passwordMinLength: settings.passwordMinLength,
        passwordRequireUppercase: settings.passwordRequireUppercase,
        passwordRequireNumber: settings.passwordRequireNumber,
        passwordRequireSymbol: settings.passwordRequireSymbol,
        sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
        maxLoginAttempts: settings.maxLoginAttempts,
        lockoutDurationMinutes: settings.lockoutDurationMinutes,
        twoFactorEnabled: settings.twoFactorEnabled,
        pinLoginEnabled: settings.pinLoginEnabled,
        pinLength: settings.pinLength,
        maxPinAttempts: settings.maxPinAttempts,
        pinLockoutDurationMinutes: settings.pinLockoutDurationMinutes,
      },
      reminders: {
        defaultStatusStaleDays: settings.defaultStatusStaleDays,
        defaultCaseAgeStaleDays: settings.defaultCaseAgeStaleDays,
      },
      backup: { location: backup.location, lastBackupAt: null, configured: backup.configured },
      ai,
      email,
      stats,
    };
  }

  async updateNumbering(
    companyId: string,
    dto: UpdateNumberingDto,
  ): Promise<SettingsOverviewEntity> {
    await this.companySettingsService.updateSettings(companyId, dto);
    return this.getOverview(companyId);
  }

  async updateSecurity(companyId: string, dto: UpdateSecurityDto): Promise<SettingsOverviewEntity> {
    await this.companySettingsService.updateSettings(companyId, dto);
    return this.getOverview(companyId);
  }

  async updateReminders(
    companyId: string,
    dto: UpdateRemindersDto,
  ): Promise<SettingsOverviewEntity> {
    await this.companySettingsService.updateSettings(companyId, dto);
    return this.getOverview(companyId);
  }

  async updateAi(companyId: string, dto: UpdateAiDto): Promise<AiSettingsEntity> {
    return this.companySettingsService.updateAiSettings(companyId, dto);
  }

  /** Audyt (nie per wysłany e-mail — patrz `NotificationsService` — tylko ta akcja administracyjna, BR-088). */
  async updateEmail(
    companyId: string,
    userId: string,
    dto: UpdateEmailSettingsDto,
  ): Promise<EmailSettingsEntity> {
    const result = await this.companySettingsService.updateEmailSettings(companyId, dto);
    await this.auditRepository.create({
      companyId,
      userId,
      action: 'EMAIL_SETTINGS_UPDATED',
      entityType: 'EmailSettings',
      entityId: companyId,
    });
    return result;
  }

  /** Testuje AKTUALNIE ZAPISANĄ konfigurację (musi być zapisana przed testem) — z pominięciem dispatchera, admin potrzebuje wyniku od razu. */
  async sendTestEmail(
    companyId: string,
    userId: string,
    dto: SendTestEmailDto,
  ): Promise<{ success: true }> {
    const result = await this.mailService.send({
      companyId,
      to: dto.to,
      subject: 'Wiadomość testowa SmartRMA',
      html: 'To jest wiadomość testowa z modułu e-mail SmartRMA. Jeśli ją widzisz, konfiguracja działa poprawnie.',
    });

    await this.auditRepository.create({
      companyId,
      userId,
      action: 'EMAIL_TEST_SENT',
      entityType: 'EmailSettings',
      entityId: companyId,
      newValue: { to: dto.to, success: result.ok } as Prisma.InputJsonValue,
    });

    if (!result.ok) {
      throw new AppException(
        ERROR_CODES.NOTIFICATION_001.code,
        result.error,
        ERROR_CODES.NOTIFICATION_001.status,
      );
    }
    return { success: true };
  }
}
