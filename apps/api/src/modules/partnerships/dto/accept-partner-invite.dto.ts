import { IsString, MaxLength, MinLength } from 'class-validator';

/** `POST /partnerships/invite/:token/accept` — publiczny, zaproszony ustawia WŁASNE imię/nazwisko/hasło (e-mail pochodzi z zaproszenia, nie z formularza — nie da się go tu podmienić). */
export class AcceptPartnerInviteDto {
  @IsString() @MinLength(1) @MaxLength(100) firstName!: string;
  @IsString() @MinLength(1) @MaxLength(100) lastName!: string;
  @IsString() @MinLength(8, { message: 'AUTH-004' }) password!: string;
}
