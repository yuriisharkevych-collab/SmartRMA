import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmailProvider, SmtpEncryption } from '@prisma/client';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * `settings.manage`. `smtpPassword`/`resendApiKey` to PLAINTEXT, przyjmowane
 * WYŁĄCZNIE do zaszyfrowania i zapisu — nigdy nie są zwracane z powrotem
 * (patrz `EmailSettingsView` — tylko flagi `hasSmtpPassword`/`hasResendApiKey`).
 * Pominięcie pola przy PATCH zostawia istniejący zapisany sekret nietknięty
 * (`CompanySettingsService.updateEmailSettings`), więc np. zmiana samej
 * nazwy nadawcy nie wymaga ponownego wpisywania hasła.
 */
export class UpdateEmailSettingsDto {
  @ApiPropertyOptional({ enum: EmailProvider })
  @IsOptional()
  @IsEnum(EmailProvider)
  provider?: EmailProvider;
  @ApiPropertyOptional() @IsOptional() @IsString() senderName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() senderEmail?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() smtpHost?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) smtpPort?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() smtpUsername?: string;
  @ApiPropertyOptional({
    description:
      'Plaintext — zapisywane wyłącznie zaszyfrowane, pomiń pole, żeby zostawić bez zmian.',
  })
  @IsOptional()
  @IsString()
  smtpPassword?: string;
  @ApiPropertyOptional({ enum: SmtpEncryption })
  @IsOptional()
  @IsEnum(SmtpEncryption)
  smtpEncryption?: SmtpEncryption;

  @ApiPropertyOptional({ description: 'Plaintext — jak `smtpPassword`.' })
  @IsOptional()
  @IsString()
  resendApiKey?: string;
}
