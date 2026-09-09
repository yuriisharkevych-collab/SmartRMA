import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, IsUrl } from 'class-validator';
import { IsPolishNip, normalizeNip } from '../../../common/validators/nip.validator';

/**
 * `company.manage`. Tworzenie `Company` idzie dziś dwiema ścieżkami spoza tego
 * DTO — `POST /companies/signup` (Etap 6, samoobsługowe zakładanie
 * Producent/Dystrybutor) i skrypty bootstrapujące (`create-admin.ts`/
 * `create-organization.ts`) — ten endpoint (`PATCH /companies/me`) tylko
 * EDYTUJE już istniejącą firmę.
 */
export class UpdateCompanyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  /**
   * Separatory (spacje/myślniki) dozwolone przy wpisywaniu — `@Transform`
   * normalizuje do samych 10 cyfr PRZED walidacją (`isValidPolishNip` w
   * `IsPolishNip` sprawdza już znormalizowaną wartość) i PRZED zapisem do
   * `Company.nip` (String?, format bazy bez zmian — zapisujemy zawsze czyste
   * 10 cyfr, nigdy oryginalny, niesformatowany wpis użytkownika).
   */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeNip(value) : value))
  @IsPolishNip({ message: 'VALIDATION-006' })
  nip?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() regon?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail({}, { message: 'VALIDATION-002' }) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'VALIDATION-005' })
  website?: string;
  @ApiPropertyOptional({
    description: 'Portal Klienta — link "Polityka Prywatności" pod sekcją RODO formularza.',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'VALIDATION-005' })
  privacyPolicyUrl?: string;
  @ApiPropertyOptional({
    description: 'Opcjonalne oznaczenie wersji polityki prywatności (np. data ostatniej zmiany).',
  })
  @IsOptional()
  @IsString()
  privacyPolicyVersion?: string;
  @ApiPropertyOptional({
    description: 'Publiczny Formularz Reklamacyjny — link "Regulamin" na kroku RODO.',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'VALIDATION-005' })
  termsUrl?: string;
}
