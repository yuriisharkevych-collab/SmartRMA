import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/**
 * AUTH-001 (ERROR_CODES.md) — logowanie pracownika, nie Portalu Klienta
 * (RBAC.md §1.2, odrębny mechanizm).
 *
 * `email` — CELOWO `@IsString()`, nie `@IsEmail()`: od zadania "Pracownicy
 * bez e-maila" to pole niesie ALBO e-mail (konta dotychczasowe), ALBO login
 * (nowe konta bez skrzynki, `User.login`) — dokładnie ten sam kompromis co
 * `password` niżej, które od dawna niesie ALBO hasło, ALBO PIN. Kontrakt
 * `/auth/login` (nazwa pola) świadomie NIEZMIENIONY — zmiana nazwy pola
 * wymagałaby dotknięcia każdego istniejącego testu/klienta bez żadnej
 * realnej korzyści. `AuthService.validateCredentials` rozstrzyga, którym
 * z trzech przypadków (e-mail/login/PIN) faktycznie jest.
 */
export class LoginDto {
  @ApiProperty({ example: 'jan.kowalski@sklep.pl', description: 'E-mail ALBO login pracownika.' })
  @IsString({ message: 'VALIDATION-001' })
  @MinLength(1, { message: 'VALIDATION-001' })
  email!: string;

  @ApiProperty()
  @IsString({ message: 'VALIDATION-001' })
  @MinLength(1, { message: 'VALIDATION-001' })
  password!: string;
}
