import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

/** AUTH-001 (ERROR_CODES.md) — logowanie pracownika, nie Portalu Klienta (RBAC.md §1.2, odrębny mechanizm). */
export class LoginDto {
  @ApiProperty({ example: 'jan.kowalski@sklep.pl' })
  @IsEmail({}, { message: 'VALIDATION-002' })
  email!: string;

  @ApiProperty()
  @IsString({ message: 'VALIDATION-001' })
  @MinLength(1, { message: 'VALIDATION-001' })
  password!: string;
}
