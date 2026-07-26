import { DocumentCategory, DocumentType, DocumentVisibility } from '@prisma/client';

/** `EVENTS.md` §5.2 — agregat `Document`. */

export interface DocumentUploadedPayload {
  documentId: string;
  caseItemId: string | null;
  category: DocumentCategory;
  visibility: DocumentVisibility;
  fileType: DocumentType;
  caseHistoryId: string;
}

export interface DocumentMarkedInvalidPayload {
  documentId: string;
  reason: string;
  caseHistoryId: string;
}
