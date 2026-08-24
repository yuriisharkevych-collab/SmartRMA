import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUrl } from 'class-validator';

/** `company.manage`. Tworzenie `Company` to operacja seeda/onboardingu, nie endpoint (MVP: jedna firma, BUSINESS_RULES.md BR-086). */
export class UpdateCompanyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nip?: string;
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
