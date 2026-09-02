import { createHash, randomBytes } from 'crypto';

/**
 * Etap 5 — token jednorazowego zaproszenia partnera e-mailem
 * (`Partnership.inviteTokenHash`). Świadomie NIE bcrypt (w przeciwieństwie do
 * `Case.clientAccessCodeHash`/haseł użytkowników): to jest 256-bitowy losowy
 * token, nie krótki kod/hasło do odgadnięcia — bcrypt-owy koszt obliczeniowy
 * (celowo wolny, przeciw brute-force NISKIEJ entropii) tu nic nie daje, tylko
 * spowalnia każdą walidację linku. SHA-256 (szybki, deterministyczny hash)
 * jest tu właściwym wyborem — dokładnie ten sam kompromis co tokeny resetu
 * hasła w typowych systemach uwierzytelniania.
 */
export function generatePartnerInviteToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashPartnerInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
