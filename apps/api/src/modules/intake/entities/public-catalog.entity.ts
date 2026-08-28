import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Etap 4 (Produkty i konfiguracja formularza) — krok "Marka". Pominięty w UI, gdy producent ma ≤1 aktywną markę (auto-wybór, patrz `IntakeRepository.findPublicBrandsForManufacturer`). */
export class PublicBrandEntity {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

/** Krok "Kategoria" — zastępuje dawne `Manufacturer.productCategories: String[]` z Etapu 3. */
export class PublicProductCategoryEntity {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

/** Krok "Produkt" — pozycja z katalogu producenta, opcjonalnie zawężona po marce/kategorii. */
export class PublicProductEntity {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) brandId!: string | null;
  @ApiPropertyOptional({ nullable: true }) categoryId!: string | null;
}

/** Wymagania rozwiązane DLA WYBRANEJ marki (`resolveRequirements`/`resolveRequirementsForItem`) — ten sam resolver co reszta systemu, żeby checklista formularza publicznego ("ile zdjęć trzeba dołączyć") zgadzała się z tym, co faktycznie wyegzekwuje `CasesService.create`. */
export class PublicRequirementsEntity {
  @ApiProperty() requiresSerialNumber!: boolean;
  @ApiProperty() requiresFrameNumber!: boolean;
  @ApiProperty() requiresProofOfPurchase!: boolean;
  @ApiProperty() minPhotos!: number;
  @ApiProperty() requiresVideo!: boolean;
  @ApiProperty() maxPhotos!: number;
  @ApiProperty() maxAttachmentSizeMb!: number;
}
