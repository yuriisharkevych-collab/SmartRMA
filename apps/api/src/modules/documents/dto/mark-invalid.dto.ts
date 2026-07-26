import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/** `documents.markInvalid`. BR-020: dokument nigdy nie jest usuwany, tylko oznaczony. */
export class MarkDocumentInvalidDto {
  @ApiProperty() @IsString() @MinLength(1) reason!: string;
}
