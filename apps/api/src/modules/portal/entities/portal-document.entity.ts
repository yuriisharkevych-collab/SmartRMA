import { ApiProperty } from '@nestjs/swagger';
import { DocumentCategory, DocumentType } from '@prisma/client';

/** Filtrowane po `visibility=Public` i `status=Aktywny` (BR-020, BR-080) w `PortalService`. */
export class PortalDocumentEntity {
  @ApiProperty() id!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty({ enum: DocumentType }) fileType!: DocumentType;
  @ApiProperty({ enum: DocumentCategory }) category!: DocumentCategory;
  @ApiProperty() uploadedAt!: Date;
}
