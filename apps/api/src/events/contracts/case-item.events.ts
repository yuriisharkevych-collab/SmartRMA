/** `EVENTS.md` §5.2 — agregat `CaseItem`. */

export interface CaseItemManufacturerAssignedPayload {
  caseItemId: string;
  previousManufacturerId: string | null;
  newManufacturerId: string | null;
  resolvedFrom: 'product' | 'brand' | 'manual';
  caseHistoryId: string;
}
