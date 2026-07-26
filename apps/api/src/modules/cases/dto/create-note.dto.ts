import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/** `notes.create`. Wewnętrzne, nigdy widoczne dla klienta (DATABASE.md §23). */
export class CreateNoteDto {
  @ApiProperty() @IsString() @MinLength(1) content!: string;
}
