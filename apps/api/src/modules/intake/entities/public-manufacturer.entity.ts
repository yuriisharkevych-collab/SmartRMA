import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Krok "Produkt" Publicznego Formularza — klient wybiera PRODUCENTA z krótkiej
 * listy, a nazwę/model produktu wpisuje sam ("tak jak na paragonie") — bez
 * katalogu produktów, który przy dużej sprzedaży byłby zbyt obszerny do
 * przeglądania anonimowo. Flagi `requiresXxx`/`minPhotos`/`requiresVideo`
 * zasilają checklistę kompletności liczoną NA BIEŻĄCO w przeglądarce, w miarę
 * wypełniania kolejnych kroków — ten sam mechanizm co "Uzupełnienie
 * reklamacji" w Portalu Klienta, tu zastosowany przed utworzeniem sprawy.
 */
export class PublicManufacturerEntity {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() requiresSerialNumber!: boolean;
  @ApiProperty() requiresFrameNumber!: boolean;
  @ApiProperty() requiresProofOfPurchase!: boolean;
  @ApiProperty() minPhotos!: number;
  @ApiProperty() requiresVideo!: boolean;
  @ApiProperty() maxPhotos!: number;
  @ApiProperty() maxAttachmentSizeMb!: number;

  /** Etap 3 — kategorie produktowe formularza rozgałęzionego marki (`BrandComplaintFormPage.tsx`), per producent. Puste na formularzu firmowym generycznym (`/reklamacja/:orgSlug`) — ten krok tam nie istnieje. */
  @ApiPropertyOptional({ type: [String] }) productCategories?: string[];
}
