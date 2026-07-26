import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** Współdzielone przez `GET /products` i `GET /brands` — identyczny kształt (fraza opcjonalna), wzorzec z `SearchCustomersDto`. */
export class SearchCatalogDto {
  @ApiPropertyOptional() @IsOptional() @IsString() query?: string;
}
