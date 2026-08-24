import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * `settings.manage`. `sessionTimeoutMinutes` steruje czasem życia refresh
 * tokena (realna długość sesji) — patrz komentarz w `AuthService.login`.
 * `twoFactorEnabled` to placeholder (2FA nie jest zaimplementowane); pole
 * istnieje, żeby ekran mógł je pokazać jako "planowane", bez czekania na
 * kolejną migrację, gdy 2FA rzeczywiście powstanie.
 */
export class UpdateSecurityDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(6) @Max(64) passwordMinLength?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() passwordRequireUppercase?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() passwordRequireNumber?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() passwordRequireSymbol?: boolean;

  @ApiPropertyOptional({ description: 'Minuty. Domyślnie 10080 (7 dni).' })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(129600) // 90 dni — górna granica sensownej sesji
  sessionTimeoutMinutes?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(3) @Max(20) maxLoginAttempts?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(1440) lockoutDurationMinutes?: number;

  @ApiPropertyOptional({ description: 'Placeholder — 2FA nie jest jeszcze zaimplementowane.' })
  @IsOptional()
  @IsBoolean()
  twoFactorEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Logowanie PIN-em zamiast hasła — wyłącznie dla kont bez roli Administrator/Kierownik (USER-006). Domyślnie wyłączone.',
  })
  @IsOptional()
  @IsBoolean()
  pinLoginEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Liczba cyfr PIN-u.' })
  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(8)
  pinLength?: number;

  @ApiPropertyOptional({
    description:
      'Próg blokady logowania PIN-em — celowo niższy niż `maxLoginAttempts` (PIN ma mniejszą przestrzeń kombinacji).',
  })
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(20)
  maxPinAttempts?: number;

  @ApiPropertyOptional({ description: 'Minuty. Celowo dłużej niż `lockoutDurationMinutes` haseł.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  pinLockoutDurationMinutes?: number;
}
