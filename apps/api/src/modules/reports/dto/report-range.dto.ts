import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

/**
 * Zakres raportu. Presety („dziś", „miesiąc", „kwartał"…) rozwija FRONTEND
 * na konkretne daty — backend przyjmuje wyłącznie `from`/`to`, dzięki czemu
 * własny zakres i preset idą tą samą ścieżką i nie ma dwóch interpretacji
 * tego, gdzie kończy się „miesiąc".
 */
export class ReportRangeDto {
  @ApiPropertyOptional({ description: 'ISO 8601. Domyślnie: 12 miesięcy wstecz.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO 8601. Domyślnie: teraz.' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
