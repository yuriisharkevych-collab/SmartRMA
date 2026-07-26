import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** `cases.assign` (WORKFLOW.md §6 poz. 17). */
export class AssignOwnerDto {
  @ApiProperty() @IsUUID() ownerId!: string;
}
