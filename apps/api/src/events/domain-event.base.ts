import { randomUUID } from 'node:crypto';

/**
 * "Koperta" zdarzenia — dokładnie pola z `EVENTS.md` §2. Payload opisany
 * per zdarzenie w `events/contracts/*.ts`, zgodnie z `EVENTS.md` §5.
 */
export interface DomainEventEnvelope<TPayload = unknown> {
  eventId: string;
  eventName: string;
  eventVersion: number;
  occurredAt: Date;
  companyId: string;
  aggregateType: string;
  aggregateId: string;
  actorUserId: string | null;
  correlationId: string;
  causationId: string | null;
  payload: TPayload;
}

export interface CreateDomainEventInput<TPayload> {
  eventName: string;
  eventVersion?: number;
  companyId: string;
  aggregateType: string;
  aggregateId: string;
  actorUserId: string | null;
  correlationId: string;
  causationId?: string | null;
  payload: TPayload;
}

/**
 * Klasa bazowa budująca kopertę wg reguł EVENTS.md §2.1:
 *  - `occurredAt` to czas budowy zdarzenia (== czas commitu, bo zdarzenie
 *    jest tworzone i publikowane DOPIERO po `$transaction`, patrz §6.1) —
 *    nie czas emisji do subskrybentów.
 *  - `eventVersion` domyślnie 1 (EVENTS.md §4).
 *  - Wołający (serwis domenowy, po commicie) odpowiada za nadanie
 *    poprawnego `companyId`/`aggregateId`/`correlationId` — klasa bazowa
 *    tylko domyka mechanikę (id, timestamp), nie zgaduje danych biznesowych.
 */
export class DomainEvent<TPayload = unknown> implements DomainEventEnvelope<TPayload> {
  readonly eventId: string;
  readonly eventName: string;
  readonly eventVersion: number;
  readonly occurredAt: Date;
  readonly companyId: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly actorUserId: string | null;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly payload: TPayload;

  constructor(input: CreateDomainEventInput<TPayload>) {
    this.eventId = randomUUID();
    this.eventName = input.eventName;
    this.eventVersion = input.eventVersion ?? 1;
    this.occurredAt = new Date();
    this.companyId = input.companyId;
    this.aggregateType = input.aggregateType;
    this.aggregateId = input.aggregateId;
    this.actorUserId = input.actorUserId;
    this.correlationId = input.correlationId;
    this.causationId = input.causationId ?? null;
    this.payload = input.payload;
  }
}
