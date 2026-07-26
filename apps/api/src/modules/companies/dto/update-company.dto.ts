import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

/** `company.manage`. Tworzenie `Company` to operacja seeda/onboardingu, nie endpoint (MVP: jedna firma, BUSINESS_RULES.md BR-086). */
export class UpdateCompanyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nip?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail({}, { message: 'VALIDATION-002' }) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
}
