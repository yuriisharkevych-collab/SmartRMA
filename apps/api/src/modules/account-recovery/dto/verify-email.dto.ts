import { IsString, MinLength } from 'class-validator';

/** `POST /auth/verify-email` — token z linku e-mail (`account-token.util.ts`, 256-bit, hex). */
export class VerifyEmailDto {
  @IsString() @MinLength(32) token!: string;
}
