import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * `settings.manage`. Wartości DOMYŚLNE dla całej firmy — nadpisanie per
 * producent żyje na `PUT /manufacturers/:id/sla`. `null` = próg wyłączony
 * (BR wzorem `UpdateManufacturerSlaDto`: `null` ≠ pominięcie pola, PATCH
 * częściowy vs. jawne wyzerowanie rozróżnia serwis).
 */
export class UpdateRemindersDto {
  @ApiPropertyOptional({
    nullable: true,
    description: 'Dni bez zmiany statusu, po których sprawa wymaga reakcji. `null` = wyłączone.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultStatusStaleDays?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Dni od zgłoszenia reklamacji, po których sprawa wymaga reakcji. `null` = wyłączone.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultCaseAgeStaleDays?: number | null;
}
