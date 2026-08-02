import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateTemplateDto } from './create-template.dto';

/**
 * `code`+`channel` tworzą tożsamość szablonu (`@@unique`) — niezmienne po utworzeniu.
 *
 * `active` jest polem WYŁĄCZNIE edycyjnym (szablon powstaje aktywny —
 * `@default(true)` w schemacie), dlatego dopisane tutaj zamiast dziedziczone
 * z `CreateTemplateDto`. Bez niego dezaktywacja szablonu była nieosiągalna
 * przez API, mimo że `NotificationsRepository.updateTemplate` i schemat
 * bazy ją obsługują — ten sam wzorzec soft-delete co `Shop.active`.
 */
export class UpdateTemplateDto extends PartialType(
  OmitType(CreateTemplateDto, ['code', 'channel'] as const),
) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
