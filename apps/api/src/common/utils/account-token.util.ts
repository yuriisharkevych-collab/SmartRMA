import { createHash, randomBytes } from 'crypto';

/**
 * Fundament „Fresh Install" — token jednorazowy dla potwierdzenia adresu
 * e-mail i resetu hasła (`User.emailVerificationTokenHash`/
 * `User.passwordResetTokenHash`). Ten sam kompromis co
 * `common/utils/partner-invite-token.util.ts` (256-bitowy losowy token,
 * SHA-256 do przechowania — NIE bcrypt, bo to nie hasło/PIN o niskiej
 * entropii do brute-force'owania, tylko losowy sekret, gdzie szybki,
 * deterministyczny hash jest właściwym wyborem) — celowo osobny plik, nie
 * import z tamtego, żeby nazwa funkcji nie sugerowała związku z
 * zaproszeniami partnerów B2B (inny kontekst domenowy, inna tabela).
 */
export function generateAccountToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashAccountToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
