import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubmissionMethod } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

/** `manufacturers.manage`. MANUFACTURER-002, jeśli Contractor ma już profil (DATABASE.md §12). */
export class CreateManufacturerDto {
  @ApiProperty({ description: 'Contractor.id — musi istnieć i nie mieć jeszcze profilu.' })
  @IsUUID()
  contractorId!: string;

  @ApiPropertyOptional({ enum: SubmissionMethod })
  @IsOptional()
  @IsEnum(SubmissionMethod)
  submissionMethod?: SubmissionMethod;

  @ApiPropertyOptional() @IsOptional() @IsString() portalUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() portalLogin?: string;
  // `portalPassword` NIE jest przyjmowane — `Manufacturer.portalPasswordEncrypted`
  // wymaga szyfrowania aplikacyjnego, oznaczonego w `schema.prisma` jako
  // niezrealizowane ("BACKEND TODO"). Przyjmowanie hasła jawnym tekstem bez
  // działającego szyfrowania byłoby gorsze niż brak tego pola.

  @ApiPropertyOptional() @IsOptional() @IsString() complaintProcedure?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() requiredDocumentsNote?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() requiredPhotosNote?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() requiredVideosNote?: string;

  @ApiPropertyOptional({
    description: 'Skrzynka reklamacyjna — odrębna od kontaktu handlowego na Contractor.',
  })
  @IsOptional()
  @IsEmail({}, { message: 'VALIDATION-002' })
  complaintEmail?: string;

  @ApiPropertyOptional({
    description:
      'Minimalna liczba zdjęć wymagana do wysłania sprawy dalej (CASE-002). 0 = brak wymogu.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  minPhotos?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresVideo?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresSerialNumber?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresFrameNumber?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresProofOfPurchase?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxPhotos?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxAttachmentSizeMb?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
