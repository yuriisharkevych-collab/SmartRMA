/**
 * Payloady zdarzeń agregatu `Customer` (Zadanie 13) — `EVENTS.md` §5 nie
 * katalogował tego agregatu (ten sam, już zaakceptowany brak co dla
 * User/Auth i Company/Shop, patrz TODO w `event-names.const.ts`).
 *
 * Zasada §2.1 pkt 3 stosowana dosłownie: Customer TO dane osobowe
 * (imię/nazwisko/telefon/e-mail/adres) — payload nie zawiera żadnego z nich,
 * tylko identyfikatory/nazwy zmienionych pól. Subskrybent czyta `Customer`
 * z bazy po commicie, jeśli potrzebuje treści.
 */

export type CustomerCreatedPayload = Record<string, never>;

export interface CustomerUpdatedPayload {
  changedFields: string[];
}
