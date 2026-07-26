import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** `GET /cases` — bez `query`: pełna lista firmy; z `query`: wyszukiwanie po numerze sprawy (wzorzec z `SearchCatalogDto`). */
export class SearchCasesDto {
  @ApiPropertyOptional() @IsOptional() @IsString() query?: string;
}
