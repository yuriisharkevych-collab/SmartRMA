import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PortalStage } from '@prisma/client';

/**
 * `CaseStatusDefinition` — nie eksponuje `companyId` (wzorzec `ManufacturerEntity`).
 * Pola `portalStage`/`requiresConfirmation`/`requiredCheck`/`notifyCustomerTemplateCode`/
 * `isDefaultForNew` są ustawiane WEWNĘTRZNIE (domyślne wartości bezpieczne dla
 * statusów tworzonych przez admina) — poza zakresem CRUD opisanym w wymaganiu
 * właściciela ("utworzyć/zmienić nazwę/opis/kolejność/aktywować/dezaktywować/
 * określić czy końcowy" — nic więcej), więc nie są przyjmowane przez DTO, ale
 * SĄ zwracane w odpowiedzi (frontend ich potrzebuje: `portalStage` dla Portalu,
 * `requiresConfirmation`/`requiredCheck` dla modala zmiany statusu).
 */
export class CaseStatusEntity {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() label!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty() order!: number;
  @ApiProperty() active!: boolean;
  @ApiProperty() isFinal!: boolean;
  @ApiProperty() isDefaultForNew!: boolean;
  @ApiProperty() requiresConfirmation!: boolean;
  @ApiPropertyOptional({ nullable: true }) requiredCheck!: string | null;
  @ApiProperty({ enum: PortalStage }) portalStage!: PortalStage;
  @ApiPropertyOptional({ nullable: true }) defaultNextAction!: string | null;
  @ApiPropertyOptional({ nullable: true }) notifyCustomerTemplateCode!: string | null;
  @ApiProperty() isSystem!: boolean;
}
