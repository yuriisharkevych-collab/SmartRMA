import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductEntity {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty() manufacturerId!: string;
  @ApiPropertyOptional({ nullable: true }) brandId!: string | null;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) sku!: string | null;
  /** Etap 3 — wolny tekst, zachowany dla kompatybilności wstecznej istniejących produktów. Nowy kod (Etap 4) czyta/zapisuje wyłącznie `categoryId`. */
  @ApiPropertyOptional({ nullable: true }) category!: string | null;
  @ApiPropertyOptional({ nullable: true }) categoryId!: string | null;
  @ApiProperty() active!: boolean;
}

/** Etap 4 (Produkty i konfiguracja formularza) — kategoria produktowa per producent, zastępuje płaską `Manufacturer.productCategories` z Etapu 3. */
export class ProductCategoryEntity {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty() manufacturerId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() active!: boolean;
}

export class BrandEntity {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty() manufacturerId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() active!: boolean;

  /** Etap 3 — opcjonalne nadpisania wymagań/SLA producenta. `null` na każdym polu = "dziedzicz z producenta" (patrz `manufacturers/requirements-resolver.ts`), NIGDY odczytywane wprost poza resolverem. */
  @ApiPropertyOptional({ nullable: true }) requiresSerialNumber!: boolean | null;
  @ApiPropertyOptional({ nullable: true }) requiresFrameNumber!: boolean | null;
  @ApiPropertyOptional({ nullable: true }) requiresProofOfPurchase!: boolean | null;
  @ApiPropertyOptional({ nullable: true }) minPhotos!: number | null;
  @ApiPropertyOptional({ nullable: true }) requiresVideo!: boolean | null;
  @ApiPropertyOptional({ nullable: true }) maxPhotos!: number | null;
  @ApiPropertyOptional({ nullable: true }) maxAttachmentSizeMb!: number | null;
  @ApiPropertyOptional({ nullable: true }) statusStaleDaysOverride!: number | null;
  @ApiPropertyOptional({ nullable: true }) caseAgeStaleDaysOverride!: number | null;
}
