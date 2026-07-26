import { randomBytes, randomInt } from 'crypto';

/**
 * Generatory dla dwóch mechanizmów dostępu Portalu Klienta (BR-077).
 * Same wartości NIGDY nie są przechowywane — wyłącznie ich bcrypt hash
 * (`Case.clientAccessCodeHash`/`clientAccessTokenHash`). Wywołujący pokazuje
 * zwróconą wartość jawną pracownikowi/klientowi dokładnie raz.
 */

// Bez znaków łatwych do pomylenia przy przepisywaniu (0/O, 1/I/L) — kod dyktowany
// klientowi przez telefon albo wpisywany ręcznie z wydruku (case-print.html).
const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ACCESS_CODE_LENGTH = 8;

export function generatePortalAccessCode(): string {
  let code = '';
  for (let i = 0; i < ACCESS_CODE_LENGTH; i += 1) {
    code += ACCESS_CODE_ALPHABET[randomInt(ACCESS_CODE_ALPHABET.length)];
  }
  return code;
}

/** Token bezpiecznego linku — nieprzepisywany ręcznie, więc pełna entropia losowych bajtów. */
export function generatePortalSecureToken(): string {
  return randomBytes(32).toString('hex');
}
