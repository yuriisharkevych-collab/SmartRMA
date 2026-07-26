import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

/**
 * Jedyne miejsce w module Auth, które zna `bcrypt` — Zadanie 1, punkt 6
 * ("Wyłącznie bcrypt. Żadnych własnych implementacji."). `AuthService` i
 * inne serwisy nie importują `bcrypt` bezpośrednio, tylko ten serwis.
 * Koszt haszowania (`BCRYPT_ROUNDS`) konfigurowalny przez ENV — patrz
 * `config/configuration.ts` (`BcryptConfig`).
 */
@Injectable()
export class PasswordService {
  constructor(private readonly config: ConfigService) {}

  hash(plainTextPassword: string): Promise<string> {
    return bcrypt.hash(plainTextPassword, this.config.get<number>('bcrypt.rounds')!);
  }

  compare(plainTextPassword: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(plainTextPassword, passwordHash);
  }
}
