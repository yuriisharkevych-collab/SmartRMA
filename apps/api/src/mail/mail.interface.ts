export const MAIL_SERVICE = Symbol('MAIL_SERVICE');

export interface OutboundEmail {
  companyId: string;
  to: string;
  subject: string;
  html: string;
  /** Nadpisuje nazwę nadawcy (`from.name`) skonfigurowaną w Ustawienia → E-mail dla TEGO e-maila (np. "Veres Meble") — patrz `Notification.senderNameOverride`. Adres e-mail nadawcy (`from.email`) NIE jest nadpisywany — pozostaje zweryfikowaną domeną firmy (SPF/DKIM), zmienia się tylko widoczna nazwa. */
  senderNameOverride?: string;
}

export type SendEmailResult = { ok: true } | { ok: false; error: string };

/**
 * Port (DECISIONS.md "Wybór stacku technologicznego" — `IMailService`
 * planowany od początku, Nodemailer w MVP, wymiana na SES/SendGrid bez
 * zmiany logiki biznesowej). Wzorzec identyczny jak `IStorageService`
 * (`storage/storage.interface.ts`) — kod domenowy zna wyłącznie ten
 * interfejs. Implementacja NIGDY nie rzuca — wołający nie musi owijać
 * w try/catch, tylko sprawdzić `result.ok`.
 */
export interface IMailService {
  send(email: OutboundEmail): Promise<SendEmailResult>;
  /**
   * Fundament „Fresh Install" — e-maile cyklu życia konta (potwierdzenie
   * adresu, reset hasła), wysyłane PRZED tym, zanim odbiorca ma jakikolwiek
   * dostęp do panelu — patrz doc-comment `MailService.sendPlatformEmail`.
   * Część portu (nie tylko `MailService`) — `AccountRecoveryService` zna
   * WYŁĄCZNIE `IMailService`/`MAIL_SERVICE`, tak jak reszta kodu domenowego.
   */
  sendPlatformEmail(email: { to: string; subject: string; html: string }): Promise<SendEmailResult>;
}
