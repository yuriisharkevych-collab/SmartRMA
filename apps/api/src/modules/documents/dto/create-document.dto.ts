import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentCategory, DocumentType, DocumentVisibility } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * `documents.upload`. Metadane pliku — samo binarium idzie osobnym uploadem
 * (multipart, `storagePath` wynikowy z tamtej operacji; poza zakresem tego
 * DTO, patrz `IStorageService` w DECISIONS.md "Architektura Clean Architecture
 * light"). FILE-001/002/003/004 (rozmiar/limit zdjęć/format/min. 2 zdjęcia)
 * do wyegzekwowania w serwisie, nie w tym DTO.
 */
export class CreateDocumentDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() caseItemId?: string;
  @ApiProperty() @IsString() fileName!: string;
  @ApiProperty({ enum: DocumentType }) @IsEnum(DocumentType) fileType!: DocumentType;
  @ApiProperty() @IsString() mimeType!: string;
  @ApiProperty() @IsInt() fileSize!: number;
  @ApiProperty() @IsString() storagePath!: string;
  @ApiPropertyOptional({ enum: DocumentCategory }) @IsOptional() @IsEnum(DocumentCategory) category?: DocumentCategory;
  @ApiPropertyOptional({ enum: DocumentVisibility }) @IsOptional() @IsEnum(DocumentVisibility) visibility?: DocumentVisibility;
}
