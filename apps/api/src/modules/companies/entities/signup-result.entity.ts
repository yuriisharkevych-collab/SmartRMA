import { ApiProperty } from '@nestjs/swagger';

/**
 * Fundament „Fresh Install" — zastępuje `AuthTokensEntity` jako odpowiedź
 * `POST /companies/signup` (breaking change, wprost wymagany): rejestracja
 * NIE loguje już automatycznie, konto czeka na potwierdzenie e-maila
 * (AUTH-007). `email` — żeby frontend mógł pokazać "sprawdź skrzynkę
 * {email}" bez ponownego wpisywania go przez użytkownika.
 */
export class SignupResultEntity {
  @ApiProperty()
  message!: string;

  @ApiProperty()
  email!: string;
}
