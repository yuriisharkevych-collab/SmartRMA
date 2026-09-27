import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LoginMethod } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * `users.create` (RBAC.md). Hasło/PIN przychodzą jawnie tylko tutaj, w
 * locie — `UsersService` musi je zahashować przed zapisem
 * (`User.passwordHash`/`pinHash`, DATABASE.md zasada projektowa #3: sekrety
 * nigdy jawnym tekstem).
 *
 * `loginMethod` (domyślnie `Password`, nieustawione = jak dotychczas) —
 * `Pin` to nowość dla firm, gdzie wiele stanowisk dzieli jeden e-mail
 * firmowy (patrz komentarz przy `User.loginMethod` w schema.prisma).
 * Dokładnie jedno z `password`/`pin` jest wymagane, w zależności od
 * `loginMethod` — reszta walidacji (długość PIN-u, czy firma w ogóle
 * dopuszcza PIN, czy wybrane role nie kolidują z PIN-em) żyje w
 * `UsersService`/`CompanySettingsService`, bo zależy od ustawień firmy.
 *
 * `login` — zadanie "Pracownicy bez e-maila": część pracowników nie ma
 * własnej skrzynki firmowej, więc dla `loginMethod=Password` (jedyna ścieżka,
 * której to dotyczy — `Pin` nadal dzieli `email` jak dotychczas) `login` jest
 * WYMAGANY, a `email` staje się OPCJONALNY (nadal przydatny do powiadomień).
 * Unikalność loginu jest w obrębie firmy (USER-009), w odróżnieniu od e-maila
 * (USER-001, globalny) — patrz komentarz przy `User.login` w schema.prisma.
 */
export class CreateUserDto {
  @ApiProperty()
  @IsString()
  firstName!: string;

  @ApiProperty()
  @IsString()
  lastName!: string;

  @ApiPropertyOptional({
    description:
      'Opcjonalny — do powiadomień. Wymagany identyfikator logowania to `login` dla kont Password.',
  })
  @IsOptional()
  @IsEmail({}, { message: 'VALIDATION-002' })
  email?: string;

  @ApiPropertyOptional({
    description:
      'Wymagany, gdy loginMethod=Password (domyślnie) i nie podano `email` — identyfikator logowania zamiast e-maila. Jeśli podano oba, konto ma obie ścieżki logowania.',
  })
  @ValidateIf((o: CreateUserDto) => o.loginMethod !== LoginMethod.Pin && (!!o.login || !o.email))
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]{3,32}$/, { message: 'USER-010' })
  login?: string;

  @ApiPropertyOptional({ enum: LoginMethod, default: LoginMethod.Password })
  @IsOptional()
  @IsEnum(LoginMethod)
  loginMethod?: LoginMethod;

  @ApiPropertyOptional({
    minLength: 8,
    description: 'Wymagane, gdy loginMethod=Password (domyślnie).',
  })
  @ValidateIf((o: CreateUserDto) => o.loginMethod !== LoginMethod.Pin)
  @IsString()
  @MinLength(8, { message: 'AUTH-004' })
  password?: string;

  @ApiPropertyOptional({
    description: 'Wymagane, gdy loginMethod=Pin — same cyfry, długość z Ustawień firmy.',
  })
  @ValidateIf((o: CreateUserDto) => o.loginMethod === LoginMethod.Pin)
  @IsString()
  @Matches(/^\d+$/, { message: 'USER-007' })
  pin?: string;

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
