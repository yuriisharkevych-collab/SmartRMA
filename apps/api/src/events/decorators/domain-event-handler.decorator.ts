import { OnEvent } from '@nestjs/event-emitter';
import { EventName } from '../event-names.const';

/** `@nestjs/event-emitter` nie eksportuje publicznie typu opcji `OnEvent` (tylko `OnEventMetadata`, inny kształt) — wyprowadzone z sygnatury samej funkcji zamiast sięgać po nieeksportowany typ z `dist/`. */
type OnEventOptions = Parameters<typeof OnEvent>[1];

/**
 * Rejestr subskrybentów zdarzeń — cienka nakładka na `@OnEvent` z
 * `@nestjs/event-emitter`, wymuszająca użycie stałych z `EVENT_NAMES`
 * zamiast gołych stringów (EVENTS.md §4). Metoda musi być `async` i
 * przyjmować dokładnie jeden argument: instancję `DomainEvent<TPayload>`.
 *
 * Przykład (do wypełnienia przy implementacji logiki biznesowej):
 *
 *   @Injectable()
 *   export class CaseCreatedNotificationHandler {
 *     @DomainEventHandler(EVENT_NAMES.CASE_CREATED)
 *     async handle(event: DomainEvent<CaseCreatedPayload>) { ... }
 *   }
 *
 * Klasa handlera musi być zarejestrowana jako `provider` w module, który
 * subskrybuje dane zdarzenie (EVENTS.md §6.2: "publikuje wyłącznie moduł
 * będący właścicielem agregatu" — subskrybuje może dowolny inny moduł).
 */
export const DomainEventHandler = (eventName: EventName, options?: OnEventOptions) =>
  OnEvent(eventName, options);
