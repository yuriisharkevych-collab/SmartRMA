import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

/**
 * `users.create` (RBAC.md). Hasło przychodzi jawnie tylko tutaj, w locie —
 * `UsersService` musi je zahashować przed zapisem (`User.passwordHash`,
 * DATABASE.md zasada projektowa #3: sekrety nigdy jawnym tekstem).
 */
export class CreateUserDto {
  @ApiProperty()
  @IsString()
  firstName!: string;

  @ApiProperty()
  @IsString()
  lastName!: string;

  @ApiProperty()
  @IsEmail({}, { message: 'VALIDATION-002' })
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'AUTH-004' })
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  shopId?: string;

  @ApiProperty({ type: [String], description: 'Role.id — co najmniej jedna wymagana (RBAC-004).' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  roleIds!: string[];
}
