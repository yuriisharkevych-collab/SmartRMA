import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { AccountRecoveryService } from './account-recovery.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

/**
 * Fundament „Fresh Install" — cztery publiczne endpointy, wszystkie pod
 * `/auth` (obok `AuthController`, bez konfliktu tras — inny komplet ścieżek).
 * `resend`/`forgot-password` mają jawnie neutralną odpowiedź (204, zawsze —
 * `AccountRecoveryService` sam decyduje, czy faktycznie coś wysłać) — patrz
 * jej doc-comment.
 */
@ApiTags('Auth')
@Controller('auth')
export class AccountRecoveryController {
  constructor(private readonly accountRecoveryService: AccountRecoveryService) {}

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  @ApiOperation({ summary: 'Potwierdzenie adresu e-mail linkiem z rejestracji' })
  @ApiBody({ type: VerifyEmailDto })
  @ApiResponse({ status: 204, description: 'E-mail potwierdzony.' })
  @ApiResponse({
    status: 401,
    description: 'AUTH-008 — link nieprawidłowy, wygasły lub już użyty.',
  })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    await this.accountRecoveryService.verifyEmail(dto.token);
  }

  @Public()
  @Post('verify-email/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @ApiOperation({
    summary: 'Ponowna wysyłka linku potwierdzającego',
    description:
      'Odpowiedź jest ZAWSZE 204, niezależnie od tego, czy podany e-mail istnieje — przeciw enumeracji kont.',
  })
  @ApiBody({ type: ResendVerificationDto })
  @ApiResponse({
    status: 204,
    description: 'Jeśli konto istnieje i nie jest jeszcze zweryfikowane, wysłano nowy link.',
  })
  async resendVerification(@Body() dto: ResendVerificationDto): Promise<void> {
    await this.accountRecoveryService.resendVerification(dto.email);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @ApiOperation({
    summary: 'Żądanie resetu hasła',
    description:
      'Odpowiedź jest ZAWSZE 204, niezależnie od tego, czy podany e-mail istnieje — przeciw enumeracji kont.',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 204, description: 'Jeśli konto istnieje, wysłano link resetu hasła.' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.accountRecoveryService.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  @ApiOperation({ summary: 'Ustawienie nowego hasła linkiem resetu — unieważnia bieżącą sesję' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 204, description: 'Hasło zmienione.' })
  @ApiResponse({
    status: 401,
    description: 'AUTH-009 — link nieprawidłowy, wygasły lub już użyty.',
  })
  @ApiResponse({ status: 422, description: 'AUTH-004 — hasło nie spełnia polityki firmy.' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.accountRecoveryService.resetPassword(dto.token, dto.password);
  }
}
