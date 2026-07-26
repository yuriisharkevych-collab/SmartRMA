/**
 * Payloady zdarzeń agregatów `Product`/`Brand` (Zadanie 14) — `EVENTS.md`
 * §5 nie katalogował tych agregatów (ten sam, już zaakceptowany brak co dla
 * User/Auth, Company/Shop, Customer — patrz TODO w `event-names.const.ts`).
 * `name` w payloadzie *created — katalogowa nazwa produktu/marki, nie dane
 * osobowe (EVENTS.md §2.1 pkt 3 dotyczy klienta, nie katalogu), analogicznie
 * do `ShopCreatedPayload.name`.
 */

export interface ProductCreatedPayload {
  name: string;
}

export interface ProductUpdatedPayload {
  changedFields: string[];
}

export interface BrandCreatedPayload {
  name: string;
}

export interface BrandUpdatedPayload {
  changedFields: string[];
}
