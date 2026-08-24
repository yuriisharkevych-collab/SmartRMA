import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';
import { CASE_NUMBER_PATTERN } from '../../company-settings/case-numbering.util';

/** BR-077 — logowanie numerem sprawy + kodem dostępu. */
export class PortalLoginDto {
  @ApiProperty({ example: 'RMA/2026/00042' })
  @IsString()
  @Matches(CASE_NUMBER_PATTERN, { message: 'Nieprawidłowy format numeru sprawy.' })
  caseNumber!: string;

  @ApiProperty({ example: 'A7K9M2XQ' })
  @IsString()
  @MinLength(4)
  accessCode!: string;
}
