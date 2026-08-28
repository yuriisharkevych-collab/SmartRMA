import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

/** Współdzielone przez `GET /products` i `GET /brands` — fraza opcjonalna, wzorzec z `SearchCustomersDto`. Etap 4 dodaje filtry katalogowe (`GET /products` — panel "Produkty": wyszukaj/filtruj po marce/kategorii). */
export class SearchCatalogDto {
  @ApiPropertyOptional() @IsOptional() @IsString() query?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() manufacturerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() brandId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  /** Domyślnie lista pokazuje WSZYSTKIE (aktywne+nieaktywne) — panel musi umieć pokazać dezaktywowane do ponownej aktywacji. `?active=true` zawęża do aktywnych (formularz publiczny/dropdowny). */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  active?: boolean;
}
