import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../redis/redis.constants';

/**
 * Rozstrzygnięcie problemu zgłoszonego przed implementacją Zadania 1 (Auth):
 * `schema.prisma` nie ma tabeli sesji/refresh tokenów (nie wolno jej
 * dodawać — architektura zamrożona), a stateless JWT nie da się unieważnić
 * bez żadnego stanu po stronie serwera. Wybrane rozwiązanie (decyzja
 * użytkownika): allowlist w Redis — jeden aktywny `jti` na użytkownika,
 * TTL = czas ważności refresh tokenu.
 *
 * Efekt uboczny, świadomie zaakceptowany: JEDNA aktywna sesja na
 * użytkownika. Kolejne logowanie (na innym urządzeniu/przeglądarce)
 * nadpisuje wpis i unieważnia poprzedni refresh token. Rotacja przy
 * `/auth/refresh` też nadpisuje wpis (stary `jti` przestaje być ważny).
 */
@Injectable()
export class RefreshTokenStoreService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(userId: string): string {
    return `auth-refresh:${userId}`;
  }

  async store(userId: string, jti: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(this.key(userId), jti, 'EX', ttlSeconds);
  }

  async isValid(userId: string, jti: string): Promise<boolean> {
    const stored = await this.redis.get(this.key(userId));
    return stored !== null && stored === jti;
  }

  async revoke(userId: string): Promise<void> {
    await this.redis.del(this.key(userId));
  }
}
