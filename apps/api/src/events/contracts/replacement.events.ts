/** `EVENTS.md` §5.2 — agregat `Replacement` (`ReplacementProduct`). */

export interface ReplacementIssuedPayload {
  replacementId: string;
  caseItemId: string;
  productIdentifier: string;
  plannedReturnAt: Date | null;
  caseHistoryId: string;
}

export interface ReplacementReturnedPayload {
  replacementId: string;
  caseItemId: string;
  conditionOnReturn: string | null;
  caseHistoryId: string;
}
