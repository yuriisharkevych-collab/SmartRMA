import { ApiProperty } from '@nestjs/swagger';
import { EmailProvider, SmtpEncryption } from '@prisma/client';

export class NumberingSettingsEntity {
  @ApiProperty() caseNumberPrefix!: string;
  @ApiProperty() caseNumberPadding!: number;
  @ApiProperty() caseNumberResetYearly!: boolean;
  @ApiProperty({
    description: 'Podgląd na żywo — jak wyglądałby KOLEJNY numer, gdyby sprawa powstała teraz.',
  })
  exampleNextNumber!: string;
}

export class SecuritySettingsEntity {
  @ApiProperty() passwordMinLength!: number;
  @ApiProperty() passwordRequireUppercase!: boolean;
  @ApiProperty() passwordRequireNumber!: boolean;
  @ApiProperty() passwordRequireSymbol!: boolean;
  @ApiProperty() sessionTimeoutMinutes!: number;
  @ApiProperty() maxLoginAttempts!: number;
  @ApiProperty() lockoutDurationMinutes!: number;
  @ApiProperty({ description: 'Placeholder — 2FA nie jest jeszcze zaimplementowane.' })
  twoFactorEnabled!: boolean;
  @ApiProperty({
    description:
      'Logowanie PIN-em zamiast hasła, wyłącznie dla kont bez roli Administrator/Kierownik.',
  })
  pinLoginEnabled!: boolean;
  @ApiProperty() pinLength!: number;
  @ApiProperty() maxPinAttempts!: number;
  @ApiProperty() pinLockoutDurationMinutes!: number;
}

/** Wartości domyślne dla progów "przypomnienia o reakcji" (`case-attention.util.ts`) — nadpisanie per producent w `ManufacturerSlaEntity`. */
export class RemindersSettingsEntity {
  @ApiProperty({ nullable: true, description: '`null` = wyłączone.' }) defaultStatusStaleDays!:
    number | null;
  @ApiProperty({ nullable: true, description: '`null` = wyłączone.' }) defaultCaseAgeStaleDays!:
    number | null;
}

export class BackupInfoEntity {
  @ApiProperty({ nullable: true }) location!: string | null;
  @ApiProperty({
    nullable: true,
    description: 'Zawsze null w tej wersji — SmartRMA nie wykonuje jeszcze kopii zapasowych.',
  })
  lastBackupAt!: string | null;
  @ApiProperty() configured!: boolean;
}

export class AiSettingsEntity {
  @ApiProperty() monitorCompleteness!: boolean;
  @ApiProperty() trackDeadlines!: boolean;
  @ApiProperty() draftCustomerReplies!: boolean;
  @ApiProperty() draftManufacturerMessages!: boolean;
  @ApiProperty() analyzeHistory!: boolean;
  @ApiProperty() generateDailyPlan!: boolean;
  @ApiProperty() analyzePhotos!: boolean;
  @ApiProperty() findSimilarCases!: boolean;
}

/** Widok bezpieczny dla API — NIGDY nie zawiera odszyfrowanych sekretów (patrz `CompanySettingsService.getEmailSettings`), tylko flagi `has*`. */
export class EmailSettingsEntity {
  @ApiProperty({ enum: EmailProvider }) provider!: EmailProvider;
  @ApiProperty({ nullable: true }) senderName!: string | null;
  @ApiProperty({ nullable: true }) senderEmail!: string | null;
  @ApiProperty({ nullable: true }) smtpHost!: string | null;
  @ApiProperty({ nullable: true }) smtpPort!: number | null;
  @ApiProperty({ nullable: true }) smtpUsername!: string | null;
  @ApiProperty({ enum: SmtpEncryption }) smtpEncryption!: SmtpEncryption;
  @ApiProperty({ description: 'Czy hasło SMTP jest zapisane — nigdy nie zwracamy jego wartości.' })
  hasSmtpPassword!: boolean;
  @ApiProperty({
    description: 'Czy klucz API Resend jest zapisany — nigdy nie zwracamy jego wartości.',
  })
  hasResendApiKey!: boolean;
}

export class SystemStatsEntity {
  @ApiProperty() userCount!: number;
  @ApiProperty() customerCount!: number;
  @ApiProperty() caseCount!: number;
  @ApiProperty() manufacturerCount!: number;
  @ApiProperty() productCount!: number;
  @ApiProperty() documentCount!: number;
  @ApiProperty({ description: 'Suma Document.fileSize w bajtach, wszystkie załączniki firmy.' })
  storageUsedBytes!: number;
  @ApiProperty() appVersion!: string;
  @ApiProperty() databaseVersion!: string;
}

export class SettingsOverviewEntity {
  @ApiProperty({ type: NumberingSettingsEntity }) numbering!: NumberingSettingsEntity;
  @ApiProperty({ type: SecuritySettingsEntity }) security!: SecuritySettingsEntity;
  @ApiProperty({ type: RemindersSettingsEntity }) reminders!: RemindersSettingsEntity;
  @ApiProperty({ type: BackupInfoEntity }) backup!: BackupInfoEntity;
  @ApiProperty({ type: AiSettingsEntity }) ai!: AiSettingsEntity;
  @ApiProperty({ type: EmailSettingsEntity }) email!: EmailSettingsEntity;
  @ApiProperty({ type: SystemStatsEntity }) stats!: SystemStatsEntity;
}
