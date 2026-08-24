import { portalClient } from './portalClient';

export type PortalStage =
  'Zgloszona' | 'Przyjeta' | 'WTrakcie' | 'Decyzja' | 'Zakonczona' | 'Anulowana' | 'Zarchiwizowana';

export interface PortalCompanyInfo {
  name: string;
  address: string | null;
  nip: string | null;
  email: string | null;
  phone: string | null;
  privacyPolicyUrl: string | null;
}

export interface PortalCaseView {
  caseNumber: string;
  stage: PortalStage;
  stageLabel: string;
  stageIndex: number;
  stageCount: number;
  createdAt: string;
  decisionLabel: string | null;
  owner: { firstName: string; lastName: string } | null;
  companyInfo: PortalCompanyInfo;
  consentGiven: boolean;
  gdprClauseVersion: string;
  gdprInfoText: string;
  gdprRequiredConsentText: string;
  gdprMarketingConsentText: string;
  gdprDocumentSharingConsentText: string;
  unreadMessagesCount: number;
}

export interface PortalHistoryEntry {
  action: string;
  newValue: string | null;
  createdAt: string;
}

export interface PortalDocument {
  id: string;
  fileName: string;
  fileType: 'PDF' | 'JPG' | 'PNG' | 'HEIC' | 'MP4';
  category: string;
  uploadedAt: string;
}

export interface PortalMessage {
  id: string;
  senderType: 'Customer' | 'Employee' | 'System';
  content: string;
  sentAt: string;
  documents: { id: string; fileName: string }[];
}

export interface CaseCompletenessItem {
  code: string;
  itemId: string;
  label: string;
  satisfied: boolean;
  kind: 'field' | 'document';
  field?: 'serialNumber' | 'frameNumber' | 'purchaseProofNumber';
  category?: string;
}

export interface CaseCompleteness {
  requirements: CaseCompletenessItem[];
  complete: boolean;
}

export interface PortalSession {
  accessToken: string;
  expiresIn: number;
}

export interface UpdatePortalCaseItemPayload {
  serialNumber?: string;
  frameNumber?: string;
  purchaseProofNumber?: string;
}

export interface RecordPortalConsentPayload {
  requiredConsent: boolean;
  marketingConsent?: boolean;
  documentSharingConsent?: boolean;
}

/** Kategorie, jakie klient może wybrać przy uploadzie — musi zgadzać się z `UploadPortalDocumentDto` (backend). */
export type PortalDocumentCategory = 'Photo' | 'Video' | 'PurchaseProof' | 'Other';

export const portalApi = {
  loginWithCode: (caseNumber: string, accessCode: string) =>
    portalClient
      .post<PortalSession>('/portal/login', { caseNumber, accessCode })
      .then((res) => res.data),

  loginWithToken: (caseNumber: string, token: string) =>
    portalClient
      .post<PortalSession>('/portal/login/token', { caseNumber, token })
      .then((res) => res.data),

  getCase: () => portalClient.get<PortalCaseView>('/portal/case').then((res) => res.data),

  getHistory: () =>
    portalClient.get<PortalHistoryEntry[]>('/portal/case/history').then((res) => res.data),

  getDocuments: () =>
    portalClient.get<PortalDocument[]>('/portal/case/documents').then((res) => res.data),

  uploadDocument: (file: File, category?: PortalDocumentCategory, caseItemId?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (category) formData.append('category', category);
    if (caseItemId) formData.append('caseItemId', caseItemId);
    return portalClient
      .post<PortalDocument>('/portal/case/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((res) => res.data);
  },

  getMessages: () =>
    portalClient.get<PortalMessage[]>('/portal/case/messages').then((res) => res.data),

  sendMessage: (content: string, documentIds?: string[]) =>
    portalClient
      .post<PortalMessage>('/portal/case/messages', { content, documentIds })
      .then((res) => res.data),

  markMessagesRead: () =>
    portalClient.post<void>('/portal/case/messages/read').then(() => undefined),

  getCompleteness: () =>
    portalClient.get<CaseCompleteness>('/portal/case/completeness').then((res) => res.data),

  updateItemFields: (itemId: string, payload: UpdatePortalCaseItemPayload) =>
    portalClient
      .patch<PortalCaseView>(`/portal/case/items/${itemId}`, payload)
      .then((res) => res.data),

  recordConsent: (payload: RecordPortalConsentPayload) =>
    portalClient.post<void>('/portal/case/consent', payload).then(() => undefined),
};
