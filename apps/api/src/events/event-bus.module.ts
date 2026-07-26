import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EVENT_BUS } from './event-bus.interface';
import { IdempotencyService } from './idempotency.service';
import { InMemoryEventBus } from './in-memory-event-bus.service';

/**
 * Globalny — każdy moduł domenowy publikuje/subskrybuje przez `IEventBus`
 * (token `EVENT_BUS`), nigdy nie importuje `EventEmitter2` bezpośrednio
 * (EVENTS.md §12: "Kod biznesowy zna wyłącznie IEventBus").
 *
 * `wildcard`/`maxListeners` dobrane pod nazewnictwo `{agregat}.{zdarzenie}`
 * (EVENTS.md §3) — wildcard OFF, bo nie potrzebujemy nasłuchu wzorców typu
 * `case.*` w MVP; gdyby się pojawiła taka potrzeba, to świadoma zmiana, nie
 * domyślne zachowanie.
 */
@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
  ],
  providers: [
    { provide: EVENT_BUS, useClass: InMemoryEventBus },
    IdempotencyService,
  ],
  exports: [EVENT_BUS, IdempotencyService],
})
export class DomainEventBusModule {}
