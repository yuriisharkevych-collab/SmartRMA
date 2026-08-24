import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * `caseStatuses.manage`. Świadomie WĄSKI zakres pól — dokładnie to, co
 * wymaganie właściciela opisuje jako dostępne administratorowi ("utworzyć
 * status, zmienić nazwę, zmienić opis, ustawić kolejność, określić czy
 * status jest końcowy" — §9). `code` NIE jest przyjmowany — generowany raz
 * przez serwis ze `label` i niezmienny (wzorzec `Role.code` vs `Role.name`).
 * `portalStage`/`requiresConfirmation`/`requiredCheck`/
 * `notifyCustomerTemplateCode` dostają bezpieczne wartości domyślne w
 * serwisie — administrator nie definiuje logiki biznesowej per status,
 * tylko jego widoczną etykietę/kolejność/charakter (końcowy czy nie).
 */
export class CreateCaseStatusDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) label!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;

  @ApiPropertyOptional({
    description: 'Wyłącznie sortowanie listy — nie blokuje żadnego przejścia.',
  })
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiPropertyOptional({
    description: 'Czy sprawa w tym statusie jest zamknięta (KPI Raportów/Dashboardu).',
  })
  @IsOptional()
  @IsBoolean()
  isFinal?: boolean;
}
