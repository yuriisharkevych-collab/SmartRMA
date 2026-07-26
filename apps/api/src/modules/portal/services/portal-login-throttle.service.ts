import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { AppException } from '../../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../../common/exceptions/error-codes.const';
import { REDIS_CLIENT } from '../../../redis/redis.constants';

const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_SECONDS = 15 * 60;

/**
 * BR-078 — blokada logowania Portalu po 5 nieudanych próbach, licznik
 * server-side PER numer sprawy I PER adres IP (nie w `localStorage`
 * przeglądarki klienta, jak w prototypie — tam świadomie oznaczone jako
 * niewystarczające produkcyjnie). Redis: naturalny wybór dla licznika
 * z TTL, bez dodawania tabeli do `schema.prisma` dla efemerycznego stanu.
 */
@Injectable()
export class PortalLoginThrottleService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(caseNumber: string, ip: string): string {
    return `portal-login:${caseNumber}:${ip}`;
  }

  /** Rzuca PORTAL-003, jeśli próg już przekroczony — wołać PRZED próbą weryfikacji danych logowania. */
  async assertNotLocked(caseNumber: string, ip: string): Promise<void> {
    const attempts = await this.redis.get(this.key(caseNumber, ip));
    if (attempts && Number(attempts) >= MAX_ATTEMPTS) {
      throw new AppException(ERROR_CODES.PORTAL_003.code, ERROR_CODES.PORTAL_003.message, ERROR_CODES.PORTAL_003.status);
    }
  }

  /** Wołać po KAŻDEJ nieudanej próbie (zły numer sprawy, zły kod, portal wyłączony) — BR-078 nie różnicuje powodu. */
  async recordFailure(caseNumber: string, ip: string): Promise<void> {
    const key = this.key(caseNumber, ip);
    const attempts = await this.redis.incr(key);
    if (attempts === 1) {
      await this.redis.expire(key, LOCKOUT_WINDOW_SECONDS);
    }
  }

  async reset(caseNumber: string, ip: string): Promise<void> {
    await this.redis.del(this.key(caseNumber, ip));
  }
}
