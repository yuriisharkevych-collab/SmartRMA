import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsBoolean, IsOptional } from 'class-validator';

/**
 * Sekcja RODO na końcu formularza uzupełnienia w Portalu Klienta. `requiredConsent`
 * musi być `true` — `@Equals(true)`, nie tylko `@IsBoolean()`, żeby "false" (checkbox
 * odznaczony) też przechodził walidację DTO, ale wysyłka i tak kończyła się jawnym
 * VALIDATION-001, zamiast cichego zapisania zgody, na którą klient się NIE zgodził.
 */
export class RecordPortalConsentDto {
  @ApiProperty({
    description: 'Zgoda na przetwarzanie danych w celu obsługi reklamacji — obowiązkowa.',
  })
  @IsBoolean()
  @Equals(true, { message: 'VALIDATION-001' })
  requiredConsent!: boolean;

  @ApiPropertyOptional({ description: 'Zgoda na kontakt e-mail/SMS — opcjonalna.' })
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  @ApiPropertyOptional({
    description:
      'Zgoda na udostępnienie załączonych dokumentów/zdjęć producentowi lub dystrybutorowi w celu weryfikacji sprawy — opcjonalna.',
  })
  @IsOptional()
  @IsBoolean()
  documentSharingConsent?: boolean;
}
