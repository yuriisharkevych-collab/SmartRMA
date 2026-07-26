import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

/** BR-077 — logowanie bezpiecznym, jednorazowym linkiem (WORKFLOW.md §6 poz. 14). */
export class PortalLoginTokenDto {
  @ApiProperty({ example: 'RMA/2026/00042' })
  @IsString()
  @Matches(/^RMA\/\d{4}\/\d+$/, { message: 'Nieprawidłowy format numeru sprawy (RMA/{rok}/{sekwencja}).' })
  caseNumber!: string;

  @ApiProperty() @IsString() @MinLength(16) token!: string;
}
