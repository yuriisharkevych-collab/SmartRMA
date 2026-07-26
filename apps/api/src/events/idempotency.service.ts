import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

/**
 * Pomocniczy mechanizm idempotencji dla subskrybentów zdarzeń —
 * `EVENTS.md` §8.2 wymienia trzy dopuszczalne mechanizmy i WPROST mówi:
 * "Nie wprowadzamy [tabeli ProcessedEvent] w MVP". Ten serwis **nie jest**
 * tabelą `ProcessedEvent` — to efemeryczna, TTL-owana blokada w Redisie,
 * dostępna jako trzecia linia obrony, GDY mechanizmy 1 i 2 z §8.2 (naturalna
 * idempotencja przez stan / klucz naturalny w bazie) nie wystarczają.
 * Preferuj zawsze najpierw mechanizmy 1 i 2 — one już istnieją w modelu
 * (`Notification.status`, `@@unique` na `NotificationTemplate` itd.).
 *
 * `wasProcessed`/`markProcessed` operują na `eventId` (klucz idempotencji,
 * EVENTS.md §8.1) + nazwie subskrybenta, żeby dwóch różnych subskrybentów
 * tego samego zdarzenia nie blokowało się nawzajem.
 */
@Injectable()
export class IdempotencyService {
  private static readonly DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24h — dłużej niż realny czas retry

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(eventId: string, subscriberName: string): string {
    return `idempotency:${subscriberName}:${eventId}`;
  }

  /** Atomowo oznacza jako przetworzone; zwraca `true`, jeśli to PIERWSZE przetworzenie. */
  async tryMarkProcessed(
    eventId: string,
    subscriberName: string,
    ttlSeconds = IdempotencyService.DEFAULT_TTL_SECONDS,
  ): Promise<boolean> {
    const result = await this.redis.set(
      this.key(eventId, subscriberName),
      '1',
      'EX',
      ttlSeconds,
      'NX',
    );
    return result === 'OK';
  }

  async wasProcessed(eventId: string, subscriberName: string): Promise<boolean> {
    const value = await this.redis.get(this.key(eventId, subscriberName));
    return value !== null;
  }
}
