import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentCategory, DocumentStatus, DocumentType, DocumentVisibility } from '@prisma/client';

export class DocumentEntity {
  @ApiProperty() id!: string;
  @ApiProperty() caseId!: string;
  @ApiPropertyOptional({ nullable: true }) caseItemId!: string | null;
  @ApiProperty() fileName!: string;
  @ApiProperty({ enum: DocumentType }) fileType!: DocumentType;
  @ApiProperty() mimeType!: string;
  @ApiProperty() fileSize!: number;
  @ApiProperty({ enum: DocumentCategory }) category!: DocumentCategory;
  @ApiProperty({ enum: DocumentVisibility }) visibility!: DocumentVisibility;
  @ApiProperty({ enum: DocumentStatus }) status!: DocumentStatus;
  @ApiPropertyOptional({
    nullable: true,
    description:
      '`null` — wgrane przez klienta w Portalu (bez rekordu User), patrz komentarz w schemacie.',
  })
  uploadedById!: string | null;
  @ApiProperty() uploadedAt!: Date;
  @ApiProperty() version!: number;
}
