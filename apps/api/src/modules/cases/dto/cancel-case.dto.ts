import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/** `cases.cancel`. CASE-011: powód wymagany (WORKFLOW.md §5). */
export class CancelCaseDto {
  @ApiProperty() @IsString() @MinLength(1) reason!: string;
}
