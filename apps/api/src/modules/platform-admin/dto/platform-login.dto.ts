import { IsEmail, IsString, MinLength } from 'class-validator';

/** `POST /platform-auth/login` — celowo BEZ `@IsPolishNip`/pól tenanta, DTO minimalne jak `LoginDto` pracowniczy. */
export class PlatformLoginDto {
  @IsEmail({}, { message: 'VALIDATION-002' }) email!: string;
  @IsString() @MinLength(1) password!: string;
}
