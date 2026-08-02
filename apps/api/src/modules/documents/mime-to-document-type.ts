import { UnprocessableEntityException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';

const MIME_TO_DOCUMENT_TYPE: Record<string, DocumentType> = {
  'application/pdf': DocumentType.PDF,
  'image/jpeg': DocumentType.JPG,
  'image/jpg': DocumentType.JPG,
  'image/png': DocumentType.PNG,
  'image/heic': DocumentType.HEIC,
  'image/heif': DocumentType.HEIC,
  'video/mp4': DocumentType.MP4,
};

/** `DocumentType` (`schema.prisma`) to zamknięty enum formatów — plik spoza tej listy jest odrzucany, zamiast zgadywać najbliższy typ. */
export function mimeToDocumentType(mimeType: string): DocumentType {
  const documentType = MIME_TO_DOCUMENT_TYPE[mimeType.toLowerCase()];
  if (!documentType) {
    throw new UnprocessableEntityException(
      `Nieobsługiwany format pliku: ${mimeType}. Dozwolone: PDF, JPG, PNG, HEIC, MP4.`,
    );
  }
  return documentType;
}
