import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional } from 'class-validator';

/**
 * `manufacturers.manage`. Wszystkie pola niezależnie nullable — `null` =
 * mechanizm wyłączony dla tego producenta, NIE wartość domyślna
 * (BUSINESS_RULES.md BR-095). Brak pola w żądaniu ≠ `null` — rozróżnienie
 * do pilnowania w serwisie przy implementacji (PATCH częściowy vs. wyzerowanie).
 */
export class UpdateManufacturerSlaDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() responseDays?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() repairDays?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() reminderAfterDays?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() escalationAfterDays?: number | null;
}
