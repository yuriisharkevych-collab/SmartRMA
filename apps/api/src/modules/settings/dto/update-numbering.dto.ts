import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** `settings.manage`. Zmiana wpływa WYŁĄCZNIE na przyszłe reklamacje — istniejące numery nigdy nie są przeliczane. */
export class UpdateNumberingDto {
  @ApiPropertyOptional({ description: 'Prefiks numeru, np. "RMA".' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  caseNumberPrefix?: string;

  @ApiPropertyOptional({
    description:
      'Liczba cyfr sekwencji (zera wiodące). Sekwencja szersza niż to pole nigdy nie jest ucinana.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  caseNumberPadding?: number;

  @ApiPropertyOptional({
    description:
      'true = numeracja zaczyna się od 1 na początku każdego roku kalendarzowego; false = licznik na całe życie firmy, bez roku w numerze.',
  })
  @IsOptional()
  @IsBoolean()
  caseNumberResetYearly?: boolean;
}
