import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

/** `cases.replacement.manage` (WORKFLOW.md §6 poz. 15). */
export class IssueReplacementDto {
  @ApiProperty() @IsString() productIdentifier!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() plannedReturnAt?: string;
}

/** WORKFLOW.md §6 poz. 16. */
export class ReturnReplacementDto {
  @ApiPropertyOptional() @IsOptional() @IsString() conditionOnReturn?: string;
}
