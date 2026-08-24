import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../redis/redis.constants';

/**
 * Licznik nieudanych prób logowania PIN-em, w Redis (nie `LoginEvent`/nowa
 * tabela Prisma — wzorzec `RefreshTokenStoreService`, gdzie architektura
 * jest świadomie "zamrożona" przeciw nowym tabelom sesji/stanu logowania).
 *
 * Klucz to sam (współdzielony) e-mail, NIE `userId` — przy logowaniu PIN-em
 * wiele kont może dzielić jeden e-mail (patrz `User.loginMethod=Pin`), więc
 * dopóki PIN się nie zgodzi, nie wiadomo, które konto ktoś atakuje. Blokada
 * musi więc działać na poziomie e-maila jako całości, inaczej atakujący
 * dostawałby de facto (liczba kont pod tym e-mailem × próg) prób zamiast
 * jednego progu.
 */
@Injectable()
export class PinLoginAttemptStoreService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(email: string): string {
    return `auth-pin-fail:${email.toLowerCase()}`;
  }

  async getFailedCount(email: string): Promise<number> {
    const value = await this.redis.get(this.key(email));
    return value === null ? 0 : Number(value);
  }

  async recordFailedAttempt(email: string, ttlSeconds: number): Promise<void> {
    const key = this.key(email);
    const count = await this.redis.incr(key);
    if (count === 1) {
      // Tylko pierwsza nieudana próba ustawia TTL — kolejne w tym samym oknie
      // nie mogą go przesuwać w nieskończoność (inaczej ciągłe próby
      // trzymałyby blokadę wiecznie zamiast wygasać po `ttlSeconds`).
      await this.redis.expire(key, ttlSeconds);
    }
  }

  async resetFailedCount(email: string): Promise<void> {
    await this.redis.del(this.key(email));
  }
}
