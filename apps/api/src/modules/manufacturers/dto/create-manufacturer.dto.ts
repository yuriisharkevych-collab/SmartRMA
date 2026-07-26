import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubmissionMethod } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

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

  @ApiPropertyOptional() @IsOptional() @IsString() complaintProcedure?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() requiredDocumentsNote?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() requiredPhotosNote?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() requiredVideosNote?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresSerialNumber?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresFrameNumber?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresProofOfPurchase?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxPhotos?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxAttachmentSizeMb?: number;
}
