import { apiClient } from './client';

/** Kształt odzwierciedla `CaseEntity` z `apps/api` — celowo zdублowany, nie importowany między apps (osobne bundle'e, `apps/web` nie zależy od `apps/api`). Rozważyć w przyszłości pakiet `packages/shared-types`, jeśli rozjazd zacznie boleć. */
export interface CaseSummary {
  id: string;
  caseNumber: string;
  status: string;
  priority: string;
  customerId: string;
  ownerId: string | null;
  complaintType: string;
  submissionMode: string;
  source: string;
  description: string | null;
  requestedResolution: string | null;
  nextAction: string | null;
  nextActionDueDate: string | null;
  customerStatement: string | null;
  decision: string | null;
  requiresManagerApproval: boolean;
  isException: boolean;
  clientPortalEnabled: boolean;
  clientLastLoginAt: string | null;
  createdAt: string;
  closedAt: string | null;
  items: CaseItem[];
}

/** `CaseItemEntity` z `apps/api` — pozycja reklamacji (produkt katalogowy + dane egzemplarza). */
export interface CaseItem {
  id: string;
  caseId: string;
  orderItemId: string | null;
  productId: string;
  manufacturerId: string | null;
  description: string;
  quantity: number;
  serialNumber: string | null;
  frameNumber: string | null;
  purchaseDate: string | null;
  purchaseProofNumber: string | null;
}

/** `CreateCaseItemDto` z `apps/api` — jedna pozycja reklamacji. `productId` wskazuje pozycję katalogu (BR-074: `Product` to model, nie egzemplarz); dane egzemplarza żyją bezpośrednio na `CaseItem`. */
export interface CreateCaseItemPayload {
  productId: string;
  description: string;
  manufacturerId?: string;
  serialNumber?: string;
  frameNumber?: string;
  /** ISO 8601 (YYYY-MM-DD). */
  purchaseDate?: string;
  purchaseProofNumber?: string;
}

export type ComplaintType = 'Warranty' | 'StatutoryWarranty';
export type ComplaintSource =
  'SklepStacjonarny' | 'Email' | 'Telefon' | 'FormularzWWW' | 'Marketplace' | 'Inne';

/** `CreateCaseDto` z `apps/api`. */
export interface CreateCasePayload {
  customerId: string;
  ownerId?: string;
  complaintType: ComplaintType;
  source: ComplaintSource;
  requestedResolution: string;
  description: string;
  customerStatement?: string;
  items: CreateCaseItemPayload[];
}

/**
 * Wzorzec dla pozostałych 16 modułów (Users, Manufacturers, ...) — jeden
 * plik `*.api.ts` per zasób, cienka warstwa nad `apiClient`, bez logiki.
 * Nie skopiowany 1:1 dla wszystkich w tym scaffoldzie (redundancja bez
 * wartości na tym etapie) — patrz raport końcowy.
 */
/** `CaseHistoryEntity` — dziennik biznesowy sprawy (oś czasu). */
export interface CaseHistoryEntry {
  id: string;
  caseId: string;
  userId: string | null;
  action: string;
  previousValue: string | null;
  newValue: string | null;
  visibleForCustomer: boolean;
  createdAt: string;
}

/** `NoteEntity` — notatka wewnętrzna, nigdy widoczna dla klienta (DATABASE.md §23). */
export interface CaseNote {
  id: string;
  caseId: string;
  userId: string;
  content: string;
  createdAt: string;
}

/** `MessageEntity` — korespondencja z klientem (DATABASE.md §24). */
export interface CaseMessage {
  id: string;
  caseId: string;
  senderType: string;
  senderUserId: string | null;
  direction: string;
  channel: string;
  subject: string | null;
  content: string;
  sentAt: string;
  readAt: string | null;
}

/** `PortalCredentialEntity` — kod dostępu / token linku zwracany JEDEN raz, w momencie wygenerowania (WORKFLOW.md §6 poz. 13/14), razem ze zaktualizowaną sprawą. */
export interface PortalCredential {
  case: CaseSummary;
  value: string;
}

export type Decision =
  'Naprawa' | 'WymianaCzesci' | 'WymianaProduktu' | 'ZwrotSrodkow' | 'Odrzucenie';
export type MessageChannel = 'Email' | 'SMS' | 'Portal' | 'Telefon';

export const casesApi = {
  list: () => apiClient.get<CaseSummary[]>('/cases').then((res) => res.data),
  search: (query: string) =>
    apiClient.get<CaseSummary[]>('/cases', { params: { query } }).then((res) => res.data),
  getById: (id: string) => apiClient.get<CaseSummary>(`/cases/${id}`).then((res) => res.data),
  create: (payload: CreateCasePayload) =>
    apiClient.post<CaseSummary>('/cases', payload).then((res) => res.data),

  // --- Przejścia i decyzje ---
  changeStatus: (id: string, status: string) =>
    apiClient.put<CaseSummary>(`/cases/${id}/status`, { status }).then((res) => res.data),
  setDecision: (id: string, decision: Decision) =>
    apiClient.put<CaseSummary>(`/cases/${id}/decision`, { decision }).then((res) => res.data),
  assignOwner: (id: string, ownerId: string) =>
    apiClient.put<CaseSummary>(`/cases/${id}/owner`, { ownerId }).then((res) => res.data),
  cancel: (id: string, reason: string) =>
    apiClient.post<CaseSummary>(`/cases/${id}/cancel`, { reason }).then((res) => res.data),
  archive: (id: string) =>
    apiClient.post<CaseSummary>(`/cases/${id}/archive`).then((res) => res.data),
  requestInfo: (id: string, requestedItems: string[], messageText: string) =>
    apiClient
      .post<CaseSummary>(`/cases/${id}/request-info`, { requestedItems, messageText })
      .then((res) => res.data),

  // --- Oś czasu / notatki / wiadomości ---
  history: (id: string) =>
    apiClient.get<CaseHistoryEntry[]>(`/cases/${id}/history`).then((res) => res.data),
  notes: (id: string) => apiClient.get<CaseNote[]>(`/cases/${id}/notes`).then((res) => res.data),
  addNote: (id: string, content: string) =>
    apiClient.post<CaseNote>(`/cases/${id}/notes`, { content }).then((res) => res.data),
  messages: (id: string) =>
    apiClient.get<CaseMessage[]>(`/cases/${id}/messages`).then((res) => res.data),
  sendMessage: (
    id: string,
    payload: { channel: MessageChannel; subject?: string; content: string },
  ) => apiClient.post<CaseMessage>(`/cases/${id}/messages`, payload).then((res) => res.data),

  // --- Portal Klienta ---
  enablePortal: (id: string) =>
    apiClient.post<PortalCredential>(`/cases/${id}/portal/enable`).then((res) => res.data),
  disablePortal: (id: string) =>
    apiClient.post<CaseSummary>(`/cases/${id}/portal/disable`).then((res) => res.data),
  generateSecureLink: (id: string) =>
    apiClient.post<PortalCredential>(`/cases/${id}/portal/secure-link`).then((res) => res.data),
};
