import { IsEmail } from 'class-validator';

/** `POST /auth/forgot-password` — odpowiedź jest ZAWSZE neutralna (patrz `AccountRecoveryService.forgotPassword`), przeciw enumeracji kont. */
export class ForgotPasswordDto {
  @IsEmail({}, { message: 'VALIDATION-002' }) email!: string;
}
