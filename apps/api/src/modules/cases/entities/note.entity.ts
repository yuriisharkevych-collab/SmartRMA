import { ApiProperty } from '@nestjs/swagger';

export class NoteEntity {
  @ApiProperty() id!: string;
  @ApiProperty() caseId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() content!: string;
  @ApiProperty() createdAt!: Date;
}
