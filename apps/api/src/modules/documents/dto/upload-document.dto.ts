import { ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentCategory, DocumentVisibility } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

/**
 * Pola formularza `multipart/form-data` towarzyszące plikowi (`file`) w
 * `POST /cases/:caseId/documents` — `fileName`/`fileType`/`mimeType`/
 * `fileSize`/`storagePath` z `CreateDocumentDto` są wyprowadzane w
 * kontrolerze z samego pliku (`Express.Multer.File`) + `IStorageService`,
 * nie przyjmowane od klienta (nie ma sensu ufać jego deklaracji rozmiaru/typu
 * pliku, skoro plik i tak leży w `req`).
 */
export class UploadDocumentDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() caseItemId?: string;
  @ApiPropertyOptional({ enum: DocumentCategory })
  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;
  @ApiPropertyOptional({ enum: DocumentVisibility })
  @IsOptional()
  @IsEnum(DocumentVisibility)
  visibility?: DocumentVisibility;
}
