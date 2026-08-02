import { apiClient } from './client';

/** Kształt odzwierciedla `DocumentEntity` z `apps/api`. */
export interface CaseDocument {
  id: string;
  caseId: string;
  caseItemId: string | null;
  fileName: string;
  fileType: string;
  mimeType: string;
  fileSize: number;
  category: string;
  visibility: string;
  status: string;
  uploadedById: string;
  uploadedAt: string;
  version: number;
}

/**
 * `POST /cases/:caseId/documents` — `multipart/form-data`. `fileName`/
 * `fileType`/`mimeType`/`fileSize`/`storagePath` z `CreateDocumentDto` są
 * wyprowadzane przez backend z samego pliku (`IStorageService`) — frontend
 * wysyła wyłącznie binarium + opcjonalne pola opisowe.
 */
export const documentsApi = {
  list: (caseId: string) =>
    apiClient.get<CaseDocument[]>(`/cases/${caseId}/documents`).then((res) => res.data),
  upload: (caseId: string, file: File, category?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (category) formData.append('category', category);
    return apiClient
      .post<CaseDocument>(`/cases/${caseId}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((res) => res.data);
  },
  /** Endpoint wymaga JWT (`RequirePermissions`) — nie da się go otworzyć gołym `<a href>`; pobiera binarium jako blob przez `apiClient` (nagłówek Authorization dołączony przez interceptor), zwraca lokalny `object URL` do podglądu/pobrania. Wołający odpowiada za `URL.revokeObjectURL()`. */
  getFileObjectUrl: (caseId: string, documentId: string) =>
    apiClient
      .get(`/cases/${caseId}/documents/${documentId}/file`, { responseType: 'blob' })
      .then((res) => URL.createObjectURL(res.data as Blob)),
};
