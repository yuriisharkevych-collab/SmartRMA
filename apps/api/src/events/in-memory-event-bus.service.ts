import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from './domain-event.base';
import { IEventBus } from './event-bus.interface';

/**
 * Implementacja MVP `IEventBus` — in-process, nad `@nestjs/event-emitter`
 * (EVENTS.md §12: "ukryty za portem IEventBus... analogicznie do
 * IStorageService i IMailService") — ale patrz `EVENTS.md` §7.2.3:
 * subskrybenty i tak są wykonywane asynchronicznie względem odpowiedzi API,
 * więc wołający (serwis domenowy) nie powinien czekać na `publish()` przed
 * zwróceniem odpowiedzi klientowi.
 *
 * Zadanie 18 (Notifications, pierwszy realny subskrybent) — POPRAWKA:
 * `emitter.emitAsync(...)` z gołym `await` (poprzednia wersja tego pliku)
 * NIE spełniał tego, co obiecywał ówczesny komentarz klasy ("każdy
 * subskrybent opakowany przez bibliotekę w try/catch"). `eventemitter2`
 * pod `emitAsync` zwraca `Promise.all` po wszystkich listenerach — jeden
 * odrzucony listener odrzuca całość, co (a) propagowałoby się do
 * `publish()`, a stąd do wołającego serwisu domenowego (`CasesService`
 * itp.), łamiąc EVENTS.md §9.1 "wyjątek w subskrybencie nigdy nie
 * propaguje się do publishera", i (b) mogłoby ubić POZOSTAŁYCH
 * subskrybentów tego samego zdarzenia (jeśli w międzyczasie też
 * odrzucili — `Promise.all` nie czeka na resztę), łamiąc "nigdy nie
 * przerywa pozostałych subskrybentów" (§9.1). Ten błąd był uśpiony, bo do
 * Zadania 18 żaden moduł nie subskrybował żadnego zdarzenia.
 *
 * Naprawa: każdy listener wołany NIEZALEŻNIE przez `Promise.allSettled`,
 * błąd logowany strukturalnie (EVENTS.md §9.2 krok 1), nigdy nie
 * propagowany dalej (§9.3 zabrania cichego połykania — stąd log, nie
 * pusty `catch`).
 */
@Injectable()
export class InMemoryEventBus implements IEventBus {
  private readonly logger = new Logger(InMemoryEventBus.name);

  constructor(private readonly emitter: EventEmitter2) {}

  async publish<TPayload>(event: DomainEvent<TPayload>): Promise<void> {
    this.logger.debug(
      `publish ${event.eventName} (eventId=${event.eventId}, aggregateId=${event.aggregateId})`,
    );

    const listeners = this.emitter.listeners(event.eventName);
    const results = await Promise.allSettled(listeners.map((listener) => Promise.resolve(listener(event))));

    for (const result of results) {
      if (result.status === 'rejected') {
        const reason = result.reason;
        this.logger.error(
          `Subskrybent zdarzenia ${event.eventName} zawiódł (eventId=${event.eventId}, correlationId=${event.correlationId}): ${reason instanceof Error ? reason.message : String(reason)}`,
          reason instanceof Error ? reason.stack : undefined,
        );
      }
    }
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
