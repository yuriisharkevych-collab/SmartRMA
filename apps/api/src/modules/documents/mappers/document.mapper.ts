import { Document } from '@prisma/client';
import { DocumentEntity } from '../entities/document.entity';

export class DocumentMapper {
  static toEntity(document: Document): DocumentEntity {
    const {
      id,
      caseId,
      caseItemId,
      fileName,
      fileType,
      mimeType,
      fileSize,
      category,
      visibility,
      status,
      uploadedById,
      uploadedAt,
      version,
    } = document;
    return {
      id,
      caseId,
      caseItemId,
      fileName,
      fileType,
      mimeType,
      fileSize,
      category,
      visibility,
      status,
      uploadedById,
      uploadedAt,
      version,
    };
  }

  static toEntityList(documents: Document[]): DocumentEntity[] {
    return documents.map(DocumentMapper.toEntity);
  }
}
