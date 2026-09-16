/**
 * Payloady zdarzeń agregatów `Company`/`Shop` (Zadanie 12) — `EVENTS.md` §5
 * nigdy nie katalogował tych agregatów (ten sam, już zaakceptowany brak co
 * dla User/Auth, patrz DECISIONS.md Zadanie 6 kwestia otwarta nr 7 i TODO w
 * `event-names.const.ts`). Zasada §2.1: identyfikatory i zmienione pola, nie
 * całe encje.
 */

export interface CompanyUpdatedPayload {
  changedFields: string[];
}

export interface ShopCreatedPayload {
  name: string;
}

export interface ShopUpdatedPayload {
  changedFields: string[];
}

export type ShopDeactivatedPayload = Record<string, never>;

/**
 * Fundament „Fresh Install" — WYJĄTEK od zasady „identyfikatory, nie
 * wartości" (patrz doc-comment na górze pliku / `event-names.const.ts`):
 * niesie plaintext token weryfikacji e-maila, bo `InMemoryEventBus` jest
 * czysto wewnątrzprocesowy (nigdy nie trafia do bazy/loga/kolejki
 * zewnętrznej) — ten sam, już zaakceptowany wyjątek co jednorazowy kod
 * dostępu Portalu Klienta w `CasesService.enablePortal`.
 */
export interface CompanySignupCompletedPayload {
  email: string;
  firstName: string;
  companyName: string;
  verificationToken: string;
}
