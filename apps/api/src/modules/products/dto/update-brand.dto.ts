import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateBrandDto } from './create-brand.dto';

/**
 * `active` dopisane osobno (nie dziedziczone z `CreateBrandDto`) — marka
 * powstaje aktywna, więc to pole ma sens wyłącznie przy edycji.
 *
 * Bez niego dezaktywacja marki była nieosiągalna przez API, mimo że
 * `Brand.active` istnieje w schemacie. Marek nie usuwamy trwale:
 * `Product.brandId` na nie wskazuje, a historyczne reklamacje muszą zachować
 * komplet danych produktu — ten sam wzorzec soft-delete co `Shop`/`User`.
 */
export class UpdateBrandDto extends PartialType(CreateBrandDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
