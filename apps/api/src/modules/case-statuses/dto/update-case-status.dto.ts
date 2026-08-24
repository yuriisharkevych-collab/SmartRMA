import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateCaseStatusDto } from './create-case-status.dto';

/**
 * `caseStatuses.manage`. Wszystko z `CreateCaseStatusDto` opcjonalne + `active`
 * (dezaktywacja — jedyny sposób "usunięcia" statusu, patrz `CaseStatusesService.update`
 * dla guardu CASE-015). `code` nadal nieobecny — niezmienny raz ustawiony.
 */
export class UpdateCaseStatusDto extends PartialType(CreateCaseStatusDto) {
  @ApiPropertyOptional({
    description:
      'Dezaktywacja zablokowana (CASE-015), jeśli status jest używany przez aktywną (nie-finalną) sprawę.',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
