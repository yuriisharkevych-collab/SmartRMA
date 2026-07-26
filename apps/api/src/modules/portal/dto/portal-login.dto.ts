import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

/** BR-077 — logowanie numerem sprawy + kodem dostępu. */
export class PortalLoginDto {
  @ApiProperty({ example: 'RMA/2026/00042' })
  @IsString()
  @Matches(/^RMA\/\d{4}\/\d+$/, { message: 'Nieprawidłowy format numeru sprawy (RMA/{rok}/{sekwencja}).' })
  caseNumber!: string;

  @ApiProperty({ example: 'A7K9M2XQ' })
  @IsString()
  @MinLength(4)
  accessCode!: string;
}
