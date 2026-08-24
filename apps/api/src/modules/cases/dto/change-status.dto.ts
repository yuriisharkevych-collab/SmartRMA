import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * `cases.status.change`. Status Workflow Refactor — pracownik może wybrać
 * KAŻDY aktywny status per-firmowego katalogu `CaseStatusDefinition` w
 * dowolnym momencie (żadnej tabeli dozwolonych przejść). `status` to `code`
 * z tego katalogu, walidowany w `CasesService.performTransition` (CASE-016,
 * jeśli nieznany/nieaktywny/spoza tej firmy) — nie da się tego wyrazić
 * statycznym dekoratorem, bo katalog jest per-firma i dynamiczny.
 */
export class ChangeStatusDto {
  @ApiProperty() @IsString() @IsNotEmpty() status!: string;

  /** Domyślnie `true` — automatyczny e-mail do klienta dla przejść, które go wysyłają (`CASE_STATUS_NOTIFICATION_RULES`). `false` pozwala pracownikowi świadomie pominąć powiadomienie przy tym konkretnym przejściu. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() notifyCustomer?: boolean;
}
