import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** `GET /orders` — bez `query`: pełna lista firmy; z `query`: wyszukiwanie po numerze zamówienia (wzorzec z `SearchCatalogDto`). */
export class SearchOrdersDto {
  @ApiPropertyOptional() @IsOptional() @IsString() query?: string;
}
