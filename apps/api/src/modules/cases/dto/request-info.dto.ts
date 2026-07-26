import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString, MinLength } from 'class-validator';

/** `cases.infoRequest.send` (WORKFLOW.md §4, §6 poz. 4). */
export class RequestInfoDto {
  @ApiProperty({ type: [String], description: 'Chipy z prototypu: numer seryjny / zdjęcia / dowód zakupu / inny dokument.' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  requestedItems!: string[];

  @ApiProperty() @IsString() @MinLength(1) messageText!: string;
}
