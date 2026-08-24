import { apiClient } from './client';

export interface NumberingSettings {
  caseNumberPrefix: string;
  caseNumberPadding: number;
  caseNumberResetYearly: boolean;
  exampleNextNumber: string;
}

export interface SecuritySettings {
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
  sessionTimeoutMinutes: number;
  maxLoginAttempts: number;
  lockoutDurationMinutes: number;
  /** Placeholder — 2FA nie jest jeszcze zaimplementowane; pole istnieje pod przyszłą funkcję. */
  twoFactorEnabled: boolean;
  /** Logowanie PIN-em zamiast hasła — wyłącznie dla kont bez roli Administrator/Kierownik. Domyślnie wyłączone. */
  pinLoginEnabled: boolean;
  pinLength: number;
  maxPinAttempts: number;
  pinLockoutDurationMinutes: number;
}

/** Wartości domyślne dla progów "przypomnienia o reakcji" — nadpisanie per producent w Ustawienia → Producenci (SLA). `null` = wyłączone. */
export interface RemindersSettings {
  defaultStatusStaleDays: number | null;
  defaultCaseAgeStaleDays: number | null;
}

export interface BackupInfo {
  location: string | null;
  lastBackupAt: string | null;
  configured: boolean;
}

export interface AiSettings {
  monitorCompleteness: boolean;
  trackDeadlines: boolean;
  draftCustomerReplies: boolean;
  draftManufacturerMessages: boolean;
  analyzeHistory: boolean;
  generateDailyPlan: boolean;
  analyzePhotos: boolean;
  findSimilarCases: boolean;
}

export type EmailProvider = 'Smtp' | 'Resend' | 'Microsoft365' | 'GoogleWorkspace';
export type SmtpEncryption = 'None' | 'Tls' | 'Ssl';

/** Nigdy nie zawiera odszyfrowanych sekretów — tylko flagi `has*` (czy hasło/klucz jest zapisany). */
export interface EmailSettings {
  provider: EmailProvider;
  senderName: string | null;
  senderEmail: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  smtpEncryption: SmtpEncryption;
  hasSmtpPassword: boolean;
  hasResendApiKey: boolean;
}

/** `smtpPassword`/`resendApiKey` to PLAINTEXT — pomiń pole (lub `undefined`), żeby zostawić zapisany sekret bez zmian. */
export interface UpdateEmailSettingsPayload {
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

export interface SystemStats {
  userCount: number;
  customerCount: number;
  caseCount: number;
  manufacturerCount: number;
  productCount: number;
  documentCount: number;
  storageUsedBytes: number;
  appVersion: string;
  databaseVersion: string;
}

export interface SettingsOverview {
  numbering: NumberingSettings;
  security: SecuritySettings;
  reminders: RemindersSettings;
  backup: BackupInfo;
  ai: AiSettings;
  email: EmailSettings;
  stats: SystemStats;
}

export type UpdateNumberingPayload = Partial<Omit<NumberingSettings, 'exampleNextNumber'>>;
export type UpdateSecurityPayload = Partial<SecuritySettings>;
export type UpdateRemindersPayload = Partial<RemindersSettings>;
export type UpdateAiPayload = Partial<AiSettings>;

export const settingsApi = {
  overview: () => apiClient.get<SettingsOverview>('/settings/overview').then((res) => res.data),
  updateNumbering: (payload: UpdateNumberingPayload) =>
    apiClient.patch<SettingsOverview>('/settings/numbering', payload).then((res) => res.data),
  updateSecurity: (payload: UpdateSecurityPayload) =>
    apiClient.patch<SettingsOverview>('/settings/security', payload).then((res) => res.data),
  updateReminders: (payload: UpdateRemindersPayload) =>
    apiClient.patch<SettingsOverview>('/settings/reminders', payload).then((res) => res.data),
  updateAi: (payload: UpdateAiPayload) =>
    apiClient.patch<AiSettings>('/settings/ai', payload).then((res) => res.data),
  updateEmail: (payload: UpdateEmailSettingsPayload) =>
    apiClient.patch<EmailSettings>('/settings/email', payload).then((res) => res.data),
  sendTestEmail: (to: string) =>
    apiClient.post<{ success: true }>('/settings/email/test-send', { to }).then((res) => res.data),
};
