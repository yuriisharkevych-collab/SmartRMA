import {
  CasePriority,
  ComplaintSource,
  ComplaintType,
  Decision,
  MessageChannel,
  MessageDirection,
  SubmissionMode,
} from '@prisma/client';

/**
 * Payloady zdarzeń agregatu `Case` — `EVENTS.md` §5.1, kolumna "Payload
 * (ponad kopertę)". Zasada §2.1: identyfikatory, nie encje; zero danych
 * osobowych (imię/e-mail/telefon/adres) w payloadzie.
 */

export interface CaseCreatedPayload {
  caseNumber: string;
  complaintType: ComplaintType;
  submissionMode: SubmissionMode;
  source: ComplaintSource;
  customerId: string;
  ownerId: string | null;
  itemCount: number;
  caseHistoryId: string;
}

export interface CaseStatusChangedPayload {
  /** Kod z per-firma katalogu `CaseStatusDefinition.code` (Status Workflow Refactor) — NIE enum, patrz komentarz przy `Case.status` w schema.prisma. */
  previousStatus: string;
  newStatus: string;
  complaintType: ComplaintType;
  caseHistoryId: string;
  /** `CasesService.changeStatus` — pracownik mógł zrezygnować z automatycznego e-maila do klienta przy tym konkretnym przejściu. Domyślnie `true`. */
  notifyCustomer: boolean;
  /**
   * Status Workflow Refactor — "Anulowana" nie jest już osobnym statusem
   * (folded w "Zakonczona", rozróżnienie przez `Case.cancelledAt`). Ta flaga
   * pozwala handlerowi powiadomień wybrać `case.cancelled.customer` zamiast
   * `case.closed.customer`, mimo że `newStatus` jest w obu przypadkach
   * tym samym kodem.
   */
  cancelled?: boolean;
}

export interface CaseDecisionSetPayload {
  decision: Decision;
  decisionByUserId: string;
  requiresManagerApproval: boolean;
  caseHistoryId: string;
}

export interface CaseInfoRequestedPayload {
  requestedItems: string[];
  messageText: string;
  caseHistoryId: string;
}

export interface CaseOwnerChangedPayload {
  previousOwnerId: string | null;
  newOwnerId: string;
  caseHistoryId: string;
}

export interface CasePortalEnabledPayload {
  caseHistoryId: string;
}

export interface CasePortalDisabledPayload {
  caseHistoryId: string;
}

export interface CasePortalTokenGeneratedPayload {
  tokenExpiresAt: Date;
}

export interface CaseSlaReminderDuePayload {
  manufacturerId: string;
  daysWaiting: number;
  reminderAfterDays: number;
}

export interface CaseSlaEscalatedPayload {
  manufacturerId: string;
  daysWaiting: number;
  previousPriority: CasePriority;
  newPriority: CasePriority;
}

/**
 * Zadanie 16 — trzy zdarzenia BEZ odpowiednika w EVENTS.md §5:
 *
 * `CaseUpdatedPayload` — dla ogólnej edycji sprawy (`cases.edit`:
 * requestedResolution/description/priority). Brak dedykowanego zdarzenia w
 * katalogu (tylko wąskie `case.decision_set`/`case.owner_changed` istniały)
 * — ten sam, już wielokrotnie akceptowany wzorzec braku (Company/Customer/
 * Product/Order, patrz TODO w `event-names.const.ts`).
 *
 * `CaseNoteAddedPayload`/`CaseMessageAddedPayload` — UWAGA, to NIE jest
 * zwykły brak katalogowania: EVENTS.md §10.2 wprost i świadomie stwierdza,
 * że `NoteAdded`/`MessageSent` (kierunek Outbound) NIE MAJĄ zdarzenia
 * ("bezpośrednia akcja pracownika bez dodatkowych automatycznych
 * konsekwencji"), decyzja zamknięta w Zadaniu 6. To zadanie (16) explicite
 * każe je publikować — bezpośrednia sprzeczność z tamtą decyzją, zgłoszona
 * w raporcie końcowym, nie przemilczana. Payloady minimalne (same
 * identyfikatory) - zero danych osobowych/treści notatki/wiadomości.
 */
export interface CaseUpdatedPayload {
  changedFields: string[];
}

export interface CaseNoteAddedPayload {
  noteId: string;
  caseHistoryId: string;
}

export interface CaseMessageAddedPayload {
  messageId: string;
  channel: MessageChannel;
  direction: MessageDirection;
  caseHistoryId: string;
}
