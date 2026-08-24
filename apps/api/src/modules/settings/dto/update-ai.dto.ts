import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * `settings.manage`. WAŻNE: te flagi NIE sterują żadną istniejącą logiką —
 * SmartRMA AI nie jest jeszcze zaimplementowane. Ten DTO zapisuje wyłącznie
 * preferencje administratora na przyszłość (żądanie: "Nie implementuj
 * jeszcze AI. Przygotuj konfigurację przyszłego modułu."). Frontend musi
 * oznaczać tę sekcję jako "Planowane w SmartRMA AI".
 */
export class UpdateAiDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() monitorCompleteness?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackDeadlines?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() draftCustomerReplies?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() draftManufacturerMessages?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() analyzeHistory?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() generateDailyPlan?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() analyzePhotos?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() findSimilarCases?: boolean;
}
