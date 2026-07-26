import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Połączenie Redis, przygotowane pod dwa udokumentowane, jeszcze
 * niezaimplementowane zastosowania:
 *  - licznik nieudanych prób logowania Portalu Klienta po stronie serwera
 *    (BUSINESS_RULES.md BR-078 — dziś w prototypie liczony w localStorage,
 *    co jest jawnie oznaczone jako niewystarczające produkcyjnie);
 *  - kolejka ponowień wysyłki `Notification` z wykładniczym opóźnieniem
 *    (EVENTS.md §11.2, §12.3 — kandydat: BullMQ na tym samym Redisie).
 * Sam klient jest tu wyłącznie jako infrastruktura — żadna z dwóch powyższych
 * logik nie jest jeszcze zaimplementowana.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new Redis(config.get<string>('redis.url')!),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
