import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Sekcja RODO formularza w Portalu — dane administratora POBIERANE DYNAMICZNIE z
 * modułu Ustawienia (`Company`), nigdy wpisane na stałe w kodzie. Jeśli administrator
 * zmieni dane firmy, Portal automatycznie pokaże nowe — to jest po prostu świeży
 * odczyt `Company` przy każdym `GET /portal/case`, bez żadnego cache.
 */
export class PortalCompanyInfoEntity {
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) address!: string | null;
  @ApiPropertyOptional({ nullable: true }) nip!: string | null;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true }) privacyPolicyUrl!: string | null;
}
