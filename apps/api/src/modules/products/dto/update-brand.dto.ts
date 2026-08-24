import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { CreateBrandDto } from './create-brand.dto';

/**
 * `active` dopisane osobno (nie dziedziczone z `CreateBrandDto`) — marka
 * powstaje aktywna, więc to pole ma sens wyłącznie przy edycji.
 *
 * Bez niego dezaktywacja marki była nieosiągalna przez API, mimo że
 * `Brand.active` istnieje w schemacie. Marek nie usuwamy trwale:
 * `Product.brandId` na nie wskazuje, a historyczne reklamacje muszą zachować
 * komplet danych produktu — ten sam wzorzec soft-delete co `Shop`/`User`.
 *
 * Etap 3 — opcjonalne nadpisania wymagań/SLA producenta, WYŁĄCZNIE przy
 * edycji (marka powstaje BEZ żadnego nadpisania — "dziedzicz z producenta"
 * jest stanem domyślnym, admin świadomie włącza nadpisanie później).
 * `null` jawnie wysłane w PATCH = "usuń nadpisanie, wróć do dziedziczenia"
 * (odróżnij od `undefined`/pole pominięte = "nie zmieniaj"), stąd
 * `nullable: true` bez `@IsOptional` blokującego `null` — `class-validator`
 * i tak przepuszcza `null` przez `@IsBoolean()`/`@IsInt()` tylko z `@IsOptional()`,
 * więc semantyka "pomiń pole" i "ustaw null" są tu nierozróżnialne na poziomie
 * DTO; rozstrzyga to `ProductsService.updateBrand` (patrz tam).
 */
export class UpdateBrandDto extends PartialType(CreateBrandDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'null = dziedzicz z producenta.' })
  @IsOptional()
  @IsBoolean()
  requiresSerialNumber?: boolean | null;

  @ApiPropertyOptional({ nullable: true, description: 'null = dziedzicz z producenta.' })
  @IsOptional()
  @IsBoolean()
  requiresFrameNumber?: boolean | null;

  @ApiPropertyOptional({ nullable: true, description: 'null = dziedzicz z producenta.' })
  @IsOptional()
  @IsBoolean()
  requiresProofOfPurchase?: boolean | null;

  @ApiPropertyOptional({ nullable: true, description: 'null = dziedzicz z producenta.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minPhotos?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'null = dziedzicz z producenta.' })
  @IsOptional()
  @IsBoolean()
  requiresVideo?: boolean | null;

  @ApiPropertyOptional({ nullable: true, description: 'null = dziedzicz z producenta.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxPhotos?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'null = dziedzicz z producenta.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxAttachmentSizeMb?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'null = dziedzicz próg producenta/firmy.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  statusStaleDaysOverride?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'null = dziedzicz próg producenta/firmy.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  caseAgeStaleDaysOverride?: number | null;
}
