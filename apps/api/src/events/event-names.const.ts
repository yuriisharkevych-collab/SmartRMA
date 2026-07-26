/**
 * Rejestr nazw zdarzeń — transkrypcja `EVENTS.md` §5. Literały stringowe
 * rozsiane po serwisach są zabronione (`EVENTS.md` §4: "uniemożliwiają
 * refaktor i sprawiają, że lista subskrybentów przestaje być wyszukiwalna").
 * Każdy `publish()`/`@DomainEventHandler()` używa wyłącznie tych stałych.
 *
 * 32 zdarzenia = 11 (agregat Case, §5.1) + 6 (pozostałe agregaty, §5.2) + 4
 * (Company/Shop, Zadanie 12) + 2 (Customer, Zadanie 13) + 4 (Product/Brand,
 * Zadanie 14) + 2 (Order, Zadanie 15) + 3 (rozszerzenie agregatu Case,
 * Zadanie 16) — patrz TODO poniżej dla każdej grupy, EVENTS.md §5 ich nie
 * zna (a dla dwóch z trzech zdarzeń Zadania 16 — wprost zna PRZECIWNĄ
 * decyzję, patrz TODO).
 * Zdarzenia z gwiazdką w komentarzu mają subskrybentów oznaczonych w
 * EVENTS.md jako "moduł planowany" (Reports, AIAssistant) — kontrakt
 * istnieje, moduł jeszcze nie.
 */
export const EVENT_NAMES = {
  // --- Agregat Case (EVENTS.md §5.1) ---
  CASE_CREATED: 'case.created',
  CASE_STATUS_CHANGED: 'case.status_changed',
  CASE_DECISION_SET: 'case.decision_set',
  CASE_INFO_REQUESTED: 'case.info_requested',
  CASE_CUSTOMER_REPLIED: 'case.customer_replied',
  CASE_OWNER_CHANGED: 'case.owner_changed',
  CASE_PORTAL_ENABLED: 'case.portal_enabled',
  CASE_PORTAL_DISABLED: 'case.portal_disabled',
  CASE_PORTAL_TOKEN_GENERATED: 'case.portal_token_generated',
  CASE_SLA_REMINDER_DUE: 'case.sla_reminder_due',
  CASE_SLA_ESCALATED: 'case.sla_escalated',
  // Zadanie 16 — rozszerzenie agregatu Case, patrz TODO poniżej (CASE_NOTE_ADDED/CASE_MESSAGE_ADDED sprzeczne z EVENTS.md §10.2).
  CASE_UPDATED: 'case.updated',
  CASE_NOTE_ADDED: 'case.note_added',
  CASE_MESSAGE_ADDED: 'case.message_added',

  // --- Pozostałe agregaty (EVENTS.md §5.2) ---
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_MARKED_INVALID: 'document.marked_invalid',
  CASE_ITEM_MANUFACTURER_ASSIGNED: 'case_item.manufacturer_assigned',
  REPLACEMENT_ISSUED: 'replacement.issued',
  REPLACEMENT_RETURNED: 'replacement.returned',
  LOGISTICS_STATUS_CHANGED: 'logistics.status_changed',

  // --- Agregaty Company/Shop (Zadanie 12 — brak odpowiednika w EVENTS.md §5, patrz TODO poniżej) ---
  COMPANY_UPDATED: 'company.updated',
  SHOP_CREATED: 'shop.created',
  SHOP_UPDATED: 'shop.updated',
  SHOP_DEACTIVATED: 'shop.deactivated',

  // --- Agregat Customer (Zadanie 13 — brak odpowiednika w EVENTS.md §5, patrz TODO poniżej) ---
  CUSTOMER_CREATED: 'customer.created',
  CUSTOMER_UPDATED: 'customer.updated',

  // --- Agregaty Product/Brand (Zadanie 14 — brak odpowiednika w EVENTS.md §5, patrz TODO poniżej) ---
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  BRAND_CREATED: 'brand.created',
  BRAND_UPDATED: 'brand.updated',

  // --- Agregat Order (Zadanie 15 — brak odpowiednika w EVENTS.md §5, patrz TODO poniżej) ---
  ORDER_CREATED: 'order.created',
  ORDER_UPDATED: 'order.updated',
} as const;

export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];

/**
 * TODO: `user.account_created` / `user.password_reset` (szablony istnieją w
 * NOTIFICATIONS.md §3) nie mają tu odpowiednika — EVENTS.md §5 nigdy nie
 * katalogował agregatu User/Auth (patrz DECISIONS.md, Zadanie 6, kwestia
 * otwarta nr 7). Dopisać po zaprojektowaniu §5.4 w EVENTS.md.
 *
 * TODO: analogiczny brak dla `company.updated`/`shop.created`/`shop.updated`/
 * `shop.deactivated` (Zadanie 12) — EVENTS.md §1.3 nie wymienia modułu
 * `Companies` wśród publisherów/subskrybentów, §5 nie ma sekcji dla tych
 * agregatów. Payloady patrz `events/contracts/company.events.ts`. Dopisać do
 * EVENTS.md przy najbliższej rewizji dokumentacji.
 *
 * TODO: analogiczny brak dla `customer.created`/`customer.updated`
 * (Zadanie 13) — EVENTS.md §1.3 nie wymienia modułu `Customers` wśród
 * publisherów, §5 nie ma sekcji dla agregatu Customer. Brak też
 * `customer.deactivated`: `Customer` nie ma pola `active` (DATABASE.md §10)
 * ani RBAC.md nie zna uprawnienia `customers.deactivate` — dezaktywacja
 * klienta nie istnieje w udokumentowanym modelu, więc to zdarzenie NIE
 * zostało dodane (patrz raport końcowy Zadania 13). Payloady patrz
 * `events/contracts/customer.events.ts`.
 *
 * TODO: analogiczny brak dla `product.created`/`product.updated`/
 * `brand.created`/`brand.updated` (Zadanie 14) — EVENTS.md §1.3 nie wymienia
 * modułu `Products` wśród publisherów, §5 nie ma sekcji dla agregatów
 * Product/Brand. Payloady patrz `events/contracts/product.events.ts`.
 *
 * TODO: analogiczny brak dla `order.created`/`order.updated` (Zadanie 15) —
 * EVENTS.md §1.3 nie wymienia modułu `Orders` wśród publisherów, §5 nie ma
 * sekcji dla agregatu Order. `OrderItem` NIE ma własnych zdarzeń — traktowany
 * jako część agregatu Order (brak `companyId` własnego, w pełni podrzędny w
 * schemacie), zgodnie z tym że EVENTS.md nigdy nie definiował zdarzeń
 * `orderItem.*`. Payloady patrz `events/contracts/order.events.ts`.
 *
 * TODO(WAŻNE — nie zwykły brak, tylko odwrócenie istniejącej decyzji):
 * `case.updated` to zwykły, już wielokrotnie widziany brak katalogowania
 * (analogicznie do company.updated/customer.updated/product.updated/
 * order.updated) — dopisać do EVENTS.md §5.1 przy najbliższej rewizji.
 *
 * `case.note_added`/`case.message_added` są INNE: EVENTS.md §10.2 wprost
 * stwierdza (decyzja zamknięta w Zadaniu 6), że `NoteAdded`/`MessageSent`
 * (kierunek Outbound) celowo NIE MAJĄ odpowiadającego zdarzenia — "to
 * bezpośrednie akcje pracownika bez dodatkowych automatycznych konsekwencji
 * poza samym zapisem". Zadanie 16 wprost poleciło publikację tych dwóch
 * zdarzeń, co jest bezpośrednią sprzecznością z tamtą decyzją. Zaimplementowano
 * zgodnie z poleceniem Zadania 16 (zmiana addytywna, łatwo odwracalna, brak
 * subskrybentów) — ale wymaga jawnej rewizji EVENTS.md §10.2 (i decyzji, czy
 * §6/uwaga pod tabelą w WORKFLOW.md też mają się zmienić), nie cichej
 * aktualizacji. Patrz raport końcowy Zadania 16.
 */
