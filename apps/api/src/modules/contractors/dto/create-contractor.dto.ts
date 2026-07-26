import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContractorCategory } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

/** `contractors.manage`. CONTRACTOR-001 przy kolizji NIP w firmie (DATABASE.md §11). */
export class CreateContractorDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ enum: ContractorCategory }) @IsEnum(ContractorCategory) category!: ContractorCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nip?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail({}, { message: 'VALIDATION-002' }) contactEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactPerson?: string;
}
