import { IsString, MinLength } from 'class-validator';

/**
 * `POST /auth/reset-password` — `password` przechodzi TU tylko podstawową
 * długość minimalną (jak `CompanySignupDto.password`/`AcceptPartnerInviteDto.password`
 * — firma jeszcze nie jest znana z samego DTO, więc jej pełna polityka
 * (`CompanySettings.passwordMin*`) jest sprawdzana DOPIERO w serwisie, gdy
 * `companyId` jest już znane z tokenu — `AccountRecoveryService.resetPassword`
 * → `CompanySettingsService.assertPasswordMeetsPolicy`.
 */
export class ResetPasswordDto {
  @IsString() @MinLength(32) token!: string;
  @IsString() @MinLength(8, { message: 'AUTH-004' }) password!: string;
}
