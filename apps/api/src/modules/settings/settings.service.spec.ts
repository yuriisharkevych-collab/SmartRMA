import { ConfigService } from '@nestjs/config';
import { EmailProvider, SmtpEncryption } from '@prisma/client';
import { AuditRepository } from '../audit/audit.repository';
import { IMailService } from '../../mail/mail.interface';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';
import { SystemStatsService } from './system-stats.service';

const SETTINGS_ROW = {
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

const AI_ROW = {
  monitorCompleteness: false,
  trackDeadlines: false,
  draftCustomerReplies: false,
  draftManufacturerMessages: false,
  analyzeHistory: false,
  generateDailyPlan: false,
  analyzePhotos: false,
  findSimilarCases: false,
};

const EMAIL_ROW = {
  provider: EmailProvider.Smtp,
  senderName: null,
  senderEmail: null,
  smtpHost: null,
  smtpPort: null,
  smtpUsername: null,
  smtpEncryption: SmtpEncryption.Tls,
  hasSmtpPassword: false,
  hasResendApiKey: false,
};

const STATS_ROW = {
  userCount: 2,
  customerCount: 10,
  caseCount: 7,
  manufacturerCount: 1,
  productCount: 3,
  documentCount: 20,
  storageUsedBytes: 123456,
  appVersion: '0.1.0',
  databaseVersion: 'PostgreSQL 16.0',
};

describe('SettingsService', () => {
  let settingsRepository: jest.Mocked<
    Pick<SettingsRepository, 'findAllVisibleToCompany' | 'upsertForCompany'>
  >;
  let companySettingsService: jest.Mocked<
    Pick<
      CompanySettingsService,
      | 'getSettings'
      | 'getAiSettings'
      | 'updateSettings'
      | 'updateAiSettings'
      | 'getEmailSettings'
      | 'updateEmailSettings'
    >
  >;
  let systemStatsService: jest.Mocked<Pick<SystemStatsService, 'getStats'>>;
  let config: ConfigService;
  let auditRepository: jest.Mocked<Pick<AuditRepository, 'create'>>;
  let mailService: jest.Mocked<IMailService>;
  let service: SettingsService;

  beforeEach(() => {
    settingsRepository = { findAllVisibleToCompany: jest.fn(), upsertForCompany: jest.fn() };
    companySettingsService = {
      getSettings: jest.fn().mockResolvedValue(SETTINGS_ROW),
      getAiSettings: jest.fn().mockResolvedValue(AI_ROW),
      updateSettings: jest.fn().mockResolvedValue(SETTINGS_ROW),
      updateAiSettings: jest.fn().mockResolvedValue(AI_ROW),
      getEmailSettings: jest.fn().mockResolvedValue(EMAIL_ROW),
      updateEmailSettings: jest.fn().mockResolvedValue(EMAIL_ROW),
    };
    systemStatsService = { getStats: jest.fn().mockResolvedValue(STATS_ROW) };
    config = {
      get: jest.fn().mockReturnValue({ location: null, configured: false }),
    } as unknown as ConfigService;
    auditRepository = { create: jest.fn() };
    mailService = { send: jest.fn(), sendPlatformEmail: jest.fn() };

    service = new SettingsService(
      settingsRepository as unknown as SettingsRepository,
      companySettingsService as unknown as CompanySettingsService,
      systemStatsService as unknown as SystemStatsService,
      config,
      auditRepository as unknown as AuditRepository,
      mailService,
    );
  });

  describe('getOverview', () => {
    it('składa numbering/security/backup/ai/stats z trzech niezależnych źródeł', async () => {
      const overview = await service.getOverview('company-1');

      expect(overview.numbering.caseNumberPrefix).toBe('RMA');
      expect(overview.security.maxLoginAttempts).toBe(5);
      expect(overview.backup).toEqual({ location: null, lastBackupAt: null, configured: false });
      expect(overview.ai).toEqual(AI_ROW);
      expect(overview.email).toEqual(EMAIL_ROW);
      expect(overview.stats).toEqual(STATS_ROW);
    });

    it('exampleNextNumber pokazuje numer KOLEJNEJ sprawy (caseCount + 1), nie bieżącej', async () => {
      const overview = await service.getOverview('company-1');
      const year = new Date().getFullYear();
      expect(overview.numbering.exampleNextNumber).toBe(`RMA/${year}/00008`); // caseCount=7 → kolejna to 8
    });

    it('exampleNextNumber pomija rok, gdy caseNumberResetYearly=false', async () => {
      companySettingsService.getSettings.mockResolvedValue({
        ...SETTINGS_ROW,
        caseNumberResetYearly: false,
      });
      const overview = await service.getOverview('company-1');
      expect(overview.numbering.exampleNextNumber).toBe('RMA/00008');
    });
  });

  describe('updateNumbering / updateSecurity', () => {
    it('updateNumbering zapisuje przez CompanySettingsService i zwraca świeży overview', async () => {
      await service.updateNumbering('company-1', { caseNumberPrefix: 'REK' });
      expect(companySettingsService.updateSettings).toHaveBeenCalledWith('company-1', {
        caseNumberPrefix: 'REK',
      });
    });

    it('updateSecurity zapisuje przez CompanySettingsService i zwraca świeży overview', async () => {
      await service.updateSecurity('company-1', { maxLoginAttempts: 3 });
      expect(companySettingsService.updateSettings).toHaveBeenCalledWith('company-1', {
        maxLoginAttempts: 3,
      });
    });
  });

  describe('updateAi', () => {
    it('deleguje wprost do CompanySettingsService.updateAiSettings, bez dodatkowej logiki (żadna flaga nic nie uruchamia)', async () => {
      await service.updateAi('company-1', { monitorCompleteness: true });
      expect(companySettingsService.updateAiSettings).toHaveBeenCalledWith('company-1', {
        monitorCompleteness: true,
      });
    });
  });
});
