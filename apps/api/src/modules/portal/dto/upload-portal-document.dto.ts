import { ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentCategory } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';

/**
 * Kategorie dostępne klientowi w Portalu — świadomie WĘŻSZY podzbiór niż pełny
 * `DocumentCategory` (bez `Confirmation`/`Manufacturer`/`Protocol`/`Decision`, które są
 * generowane/dołączane wyłącznie przez pracownika/system).
 */
const PORTAL_ALLOWED_CATEGORIES = [
  DocumentCategory.Photo,
  DocumentCategory.Video,
  DocumentCategory.PurchaseProof,
  DocumentCategory.Other,
] as const;

export class UploadPortalDocumentDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() caseItemId?: string;
  @ApiPropertyOptional({ enum: PORTAL_ALLOWED_CATEGORIES })
  @IsOptional()
  @IsEnum(DocumentCategory)
  @IsIn(PORTAL_ALLOWED_CATEGORIES, { message: 'VALIDATION-001' })
  category?: DocumentCategory;
}
