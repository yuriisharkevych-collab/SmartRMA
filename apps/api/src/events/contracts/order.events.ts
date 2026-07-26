/**
 * Payloady zdarzeń agregatu `Order` (Zadanie 15) — `EVENTS.md` §5 nie
 * katalogował tego agregatu (ten sam, już zaakceptowany brak co dla
 * User/Auth, Company/Shop, Customer, Product/Brand — patrz TODO w
 * `event-names.const.ts`). `OrderItem` traktowany jako część agregatu
 * `Order` (brak własnego `companyId`, w pełni podrzędny w schemacie) — brak
 * osobnych zdarzeń `orderItem.*`, zgodnie z tym, że EVENTS.md §5.2 nigdy nie
 * definiował żadnego zdarzenia dla `OrderItem` z osobna.
 */

export interface OrderCreatedPayload {
  orderNumber: string;
  itemCount: number;
}

export interface OrderUpdatedPayload {
  changedFields: string[];
}
