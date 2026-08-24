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
  /** Faza 6 (Producent/Dystrybutor + Partnerzy B2B) — skąd sprawa trafiła do TEJ organizacji: `DirectCustomer` (własny formularz/pracownik) albo `PartnerB2B` (przekazana przez partnera, `CaseHandoff`). Niezależne od `source` (kanał zgłoszenia klienta). */
  originType: 'DirectCustomer' | 'PartnerB2B';
  /** Formularz rozgałęziony marki (np. Veres Meble) — realna firma-partner (Partnership), która zgłosiła tę sprawę przez publiczny formularz. `null` dla zwykłych B2C. */
  reportedByPartnerCompanyId: string | null;
  reportedByPartnerCompanyName: string | null;
  /** Z kim prowadzić dalszy kontakt, gdy partner zgłosił sprawę w imieniu klienta końcowego. */
  contactPreference: 'Customer' | 'Partner' | null;
  description: string | null;
  requestedResolution: string | null;
  nextAction: string | null;
  nextActionDueDate: string | null;
  customerStatement: string | null;
  decision: string | null;
  decisionAt: string | null;
  decisionIsPositive: boolean | null;
  decisionContractorId: string | null;
  decisionJustification: string | null;
  decisionFulfillmentMethod: DecisionFulfillmentMethod | null;
  decisionManufacturerResponse: string | null;
  requiresManagerApproval: boolean;
  isException: boolean;
  clientPortalEnabled: boolean;
  clientLastLoginAt: string | null;
  createdAt: string;
  closedAt: string | null;
  cancelledAt: string | null;
  archivedAt: string | null;
  /** Data ostatniej realnej zmiany statusu (nie aktualizowana, gdy pracownik "zmienia" na ten sam status) — podstawa przypomnień o reakcji. */
  statusChangedAt: string;
  /** Przekroczyła próg "brak zmiany statusu" i/lub "dni od zgłoszenia" (Ustawienia → Przypomnienia / SLA producenta). Sprawa w statusie końcowym zawsze `false`. */
  needsAttention: boolean;
  attentionReasons: string[];
  /** Etap 2 (Dashboard Producenta/Dystrybutora) — `true` gdy sprawa B2C ma wysłaną prośbę o uzupełnienie danych i nadal ma niespełnione wymagania (te same co zakładka "Uzupełnij" w Portalu Klienta). Zawsze `false` dla B2B. */
  waitingForCustomer: boolean;
  items: CaseItem[];
  /** Wiadomości od klienta jeszcze nieprzeczytane przez pracownika — zerowane po otwarciu zakładki Wiadomości (`casesApi.markMessagesRead`). */
  unreadMessagesCount: number;
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

/**
 * `CreateCaseItemDto` z `apps/api` — jedna pozycja reklamacji. `productId` wskazuje ISTNIEJĄCĄ
 * pozycję katalogu (BR-074: `Product` to model, nie egzemplarz); dane egzemplarza żyją
 * bezpośrednio na `CaseItem`. Dokładnie jedno z `productId`/`productName` — `productName`
 * (model spoza katalogu) każe backendowi znaleźć-albo-utworzyć `Product` SAMEMU (uprawnienie
 * `cases.create` wystarcza, bez osobnego `products.manage` — patrz `CasesService.create`).
 */
export interface CreateCaseItemPayload {
  productId?: string;
  productName?: string;
  brandId?: string;
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

/** `UpdateCaseDto` z `apps/api` — `complaintType` edytowalny wyłącznie do wyjścia ze statusu `Weryfikacja` (CASE-014), patrz `CaseDetailPage`. */
export interface UpdateCasePayload {
  requestedResolution?: string;
  description?: string;
  priority?: string;
  complaintType?: ComplaintType;
}

/** `UpdateCaseItemDto` z `apps/api` — poprawa błędnie wpisanych danych pozycji PO utworzeniu sprawy (BR-072/BR-074). Dokładnie jedno z `productId`/`productName`, jeśli którekolwiek podano. */
export interface UpdateCaseItemPayload {
  productId?: string;
  productName?: string;
  brandId?: string;
  manufacturerId?: string;
  description?: string;
  serialNumber?: string;
  frameNumber?: string;
  /** ISO 8601 (YYYY-MM-DD). */
  purchaseDate?: string;
  purchaseProofNumber?: string;
}

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
  /** Dociągnięte przez backend jednym JOIN-em — dostępne niezależnie od uprawnienia `users.view` (patrz `CaseHistoryRepository.findByCaseId`). */
  userFirstName: string | null;
  userLastName: string | null;
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
  /** Załączniki (0..N) — dokumenty wgrane wcześniej przez `documentsApi.upload`, patrz `sendMessage`. */
  documents: { id: string; fileName: string }[];
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
export type DecisionFulfillmentMethod = 'Kurier' | 'OdbiorOsobisty' | 'PrzelewBankowy' | 'Inne';
export type MessageChannel = 'Email' | 'SMS' | 'Portal' | 'Telefon';

/**
 * Status Workflow Refactor §8 — decyzja producenta/dystrybutora jako dane
 * strukturalne, nie tylko wartość enuma, żeby Raporty/przyszłe AI mogły
 * analizować DLACZEGO i JAK zrealizowano decyzję. Wszystkie opcjonalne.
 */
export interface SetDecisionPayload {
  decisionContractorId?: string;
  decisionJustification?: string;
  decisionFulfillmentMethod?: DecisionFulfillmentMethod;
  decisionManufacturerResponse?: string;
}

/** `HandoffThreadSide` z `apps/api` — wąski widok JEDNEJ strony wątku przekazania: WYŁĄCZNIE status/decyzja/numer sprawy/nazwa organizacji drugiej strony. */
export interface HandoffThreadSide {
  companyName: string;
  caseNumber: string;
  status: string;
  statusLabel: string;
  decision: Decision | null;
  updatedAt: string;
  createdAt: string;
}

/** `HandoffThreadEntity` z `apps/api` (Faza 5/6 planu B2B) — sprawa "w środku" łańcucha (np. Dystrybutor) jest jednocześnie celem i źródłem, stąd oba pola niezależnie nullable. */
export interface HandoffThread {
  receivedFrom: HandoffThreadSide | null;
  sentTo: HandoffThreadSide | null;
}

export const casesApi = {
  list: () => apiClient.get<CaseSummary[]>('/cases').then((res) => res.data),
  search: (query: string) =>
    apiClient.get<CaseSummary[]>('/cases', { params: { query } }).then((res) => res.data),
  getById: (id: string) => apiClient.get<CaseSummary>(`/cases/${id}`).then((res) => res.data),
  create: (payload: CreateCasePayload) =>
    apiClient.post<CaseSummary>('/cases', payload).then((res) => res.data),
  update: (id: string, payload: UpdateCasePayload) =>
    apiClient.patch<CaseSummary>(`/cases/${id}`, payload).then((res) => res.data),
  updateItem: (caseId: string, itemId: string, payload: UpdateCaseItemPayload) =>
    apiClient
      .patch<CaseSummary>(`/cases/${caseId}/items/${itemId}`, payload)
      .then((res) => res.data),
  /** `cases.delete` — TRWAŁE usunięcie, wyłącznie Administrator. Do czyszczenia spraw testowych, nieodwracalne. */
  delete: (id: string) => apiClient.delete<void>(`/cases/${id}`).then(() => undefined),

  // --- Przejścia i decyzje ---
  changeStatus: (id: string, status: string, notifyCustomer?: boolean) =>
    apiClient
      .put<CaseSummary>(`/cases/${id}/status`, { status, notifyCustomer })
      .then((res) => res.data),
  setDecision: (id: string, decision: Decision, extra: SetDecisionPayload = {}) =>
    apiClient
      .put<CaseSummary>(`/cases/${id}/decision`, { decision, ...extra })
      .then((res) => res.data),
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
    payload: { channel: MessageChannel; subject?: string; content: string; documentIds?: string[] },
  ) => apiClient.post<CaseMessage>(`/cases/${id}/messages`, payload).then((res) => res.data),
  markMessagesRead: (id: string) =>
    apiClient.post<{ success: true }>(`/cases/${id}/messages/read`).then((res) => res.data),

  // --- Portal Klienta ---
  enablePortal: (id: string) =>
    apiClient.post<PortalCredential>(`/cases/${id}/portal/enable`).then((res) => res.data),
  disablePortal: (id: string) =>
    apiClient.post<CaseSummary>(`/cases/${id}/portal/disable`).then((res) => res.data),
  generateSecureLink: (id: string) =>
    apiClient.post<PortalCredential>(`/cases/${id}/portal/secure-link`).then((res) => res.data),

  // --- Producent/Dystrybutor + Partnerzy B2B (Faza 5) ---
  /** `null`, gdy sprawa nie jest stroną żadnego przekazania — patrz `HandoffThread`. */
  getHandoffThread: (id: string) =>
    apiClient.get<HandoffThread | null>(`/cases/${id}/handoff`).then((res) => res.data),
  sendToPartner: (id: string, partnershipId: string, brandId: string) =>
    apiClient
      .post<{ targetCaseNumber: string }>(`/cases/${id}/handoff`, { partnershipId, brandId })
      .then((res) => res.data),
};
