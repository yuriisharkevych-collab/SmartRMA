import { DomainEvent } from './domain-event.base';

export const EVENT_BUS = Symbol('EVENT_BUS');

/**
 * Port (EVENTS.md §12: "Kod biznesowy zna wyłącznie IEventBus"). Implementacja
 * MVP: `InMemoryEventBus` nad `@nestjs/event-emitter`. Wymiana na broker
 * (Kafka/RabbitMQ/Redis Streams + outbox transakcyjny, EVENTS.md §12.1) nie
 * powinna wymagać zmiany ani jednej linijki w serwisach domenowych — tylko
 * innej implementacji tego interfejsu.
 *
 * KRYTYCZNE (EVENTS.md §6.1): `publish()` woła się PO zatwierdzeniu
 * `prisma.$transaction()`, nigdy w jego wnętrzu.
 */
export interface IEventBus {
  publish<TPayload>(event: DomainEvent<TPayload>): Promise<void>;
  publishAll(events: DomainEvent[]): Promise<void>;
}
