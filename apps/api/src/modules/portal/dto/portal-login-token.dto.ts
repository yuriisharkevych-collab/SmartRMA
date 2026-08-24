import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';
import { CASE_NUMBER_PATTERN } from '../../company-settings/case-numbering.util';

/** BR-077 — logowanie bezpiecznym, jednorazowym linkiem (WORKFLOW.md §6 poz. 14). */
export class PortalLoginTokenDto {
  @ApiProperty({ example: 'RMA/2026/00042' })
  @IsString()
  @Matches(CASE_NUMBER_PATTERN, { message: 'Nieprawidłowy format numeru sprawy.' })
  caseNumber!: string;

  @ApiProperty() @IsString() @MinLength(16) token!: string;
}
