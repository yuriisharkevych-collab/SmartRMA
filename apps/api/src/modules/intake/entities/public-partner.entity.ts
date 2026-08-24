import { ApiProperty } from '@nestjs/swagger';

/** Krok "Wybór partnera" formularza rozgałęzionego marki — `Contractor` (category=Distributor) tej firmy, wyłącznie nazwa (żadnych danych wewnętrznych kontrahenta). */
export class PublicPartnerEntity {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}
