import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Nagłówek Publicznego Formularza Reklamacyjnego + krok RODO — pobierane na żywo z Ustawień (Company), nigdy wpisane na stałe. */
export class PublicCompanyBrandingEntity {
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) address!: string | null;
  @ApiPropertyOptional({ nullable: true }) nip!: string | null;
  @ApiPropertyOptional({ nullable: true }) logoUrl!: string | null;
  @ApiPropertyOptional({ nullable: true }) privacyPolicyUrl!: string | null;
  @ApiPropertyOptional({ nullable: true }) privacyPolicyVersion!: string | null;
  @ApiPropertyOptional({ nullable: true }) termsUrl!: string | null;
}
