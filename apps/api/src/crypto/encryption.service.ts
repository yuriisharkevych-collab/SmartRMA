import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Szyfrowanie sekretów przechowywanych w bazie (hasło SMTP, klucz API Resend —
 * `EmailSettings`), gdzie w odróżnieniu od haseł/kodów Portalu (bcrypt, jednokierunkowo)
 * wartość MUSI dać się odzyskać, żeby faktycznie zalogować się do serwera pocztowego.
 * Klucz AES-256 to SHA-256 z `ENCRYPTION_KEY` (env, min. 32 znaki) — chroni przed
 * odczytaniem sekretów z samego zrzutu bazy, NIE jest odporne na słaby/krótki
 * `ENCRYPTION_KEY` (brak work factor jak w bcrypt/scrypt) i nie ma rotacji ani
 * kluczy per-firma w tej wersji — świadome ograniczenie MVP, patrz DECISIONS.md.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = createHash('sha256').update(config.get<string>('encryption.key')!).digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':');
  }

  decrypt(stored: string): string {
    const [ivHex, authTagHex, ciphertextHex] = stored.split(':');
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }
}
