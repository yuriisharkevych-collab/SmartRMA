import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

/** `caseStatuses.manage`. `statusIds` w NOWEJ kolejności — `order` zapisywany jako indeks w tablicy (0-based). */
export class ReorderCaseStatusesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  statusIds!: string[];
}
