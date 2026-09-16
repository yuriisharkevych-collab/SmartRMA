import { IsEmail } from 'class-validator';

/** `POST /auth/verify-email/resend` — odpowiedź jest ZAWSZE neutralna (patrz `AccountRecoveryService.resendVerification`), przeciw enumeracji kont. */
export class ResendVerificationDto {
  @IsEmail({}, { message: 'VALIDATION-002' }) email!: string;
}
