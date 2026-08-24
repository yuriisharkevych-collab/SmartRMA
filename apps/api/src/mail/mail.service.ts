import { Injectable, Logger } from '@nestjs/common';
import { EmailProvider } from '@prisma/client';
import { EncryptionService } from '../crypto/encryption.service';
import { CompaniesService } from '../modules/companies/companies.service';
import { CompanySettingsService } from '../modules/company-settings/company-settings.service';
import { wrapEmailHtml } from './email-template.util';
import { IMailService, OutboundEmail, SendEmailResult } from './mail.interface';
import { MailTransport } from './transports/mail-transport.interface';
import { ResendTransport } from './transports/resend.transport';
import { SmtpTransport } from './transports/smtp.transport';

/**
 * Implementacja `IMailService` (port, `mail.interface.ts`) — Nodemailer dla
 * `Smtp`/`Microsoft365`/`GoogleWorkspace` (identyczny protokół, różny tylko
 * host/port skonfigurowany przez administratora), natywny `fetch` do Resend
 * dla `Resend`. NIGDY nie rzuca (kontrakt portu) — brak/niekompletna
 * konfiguracja i błąd transportu kończą się tak samo, `{ok:false, error}`.
 */
@Injectable()
export class MailService implements IMailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly companySettingsService: CompanySettingsService,
    private readonly companiesService: CompaniesService,
    private readonly encryption: EncryptionService,
  ) {}

  async send(email: OutboundEmail): Promise<SendEmailResult> {
    try {
      const built = await this.buildTransport(email.companyId);
      if (!built) return { ok: false, error: 'Brak konfiguracji e-mail (Ustawienia → E-mail).' };

      // `email.html` to w praktyce czysty tekst (`NotificationsService.renderTemplate` nie generuje
      // znaczników) — opakowanie w minimalny, spójny układ HTML robimy TU, jednym miejscem dla
      // wszystkich 9 szablonów, zamiast wysyłać gołą treść bez nagłówka/stopki/nazwy firmy.
      const company = await this.companiesService.findById(email.companyId);
      const html = wrapEmailHtml(
        {
          name: company.name,
          address: company.address,
          phone: company.phone,
          email: company.email,
        },
        email.html,
      );

      // Marka (np. Veres Meble) nadpisuje WIDOCZNĄ nazwę nadawcy — adres e-mail
      // zostaje ten skonfigurowany w Ustawienia → E-mail (zweryfikowana domena,
      // SPF/DKIM), patrz komentarz przy `OutboundEmail.senderNameOverride`.
      const from = email.senderNameOverride
        ? { ...built.from, name: email.senderNameOverride }
        : built.from;
      await built.transport.send({ to: email.to, subject: email.subject, html }, from);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Wysyłka e-mail nieudana (companyId=${email.companyId}, to=${email.to}): ${message}`,
      );
      return { ok: false, error: message };
    }
  }

  private async buildTransport(
    companyId: string,
  ): Promise<{ transport: MailTransport; from: { name: string; email: string } } | null> {
    const settings = await this.companySettingsService.getEmailSettingsForSending(companyId);
    if (!settings || !settings.senderName || !settings.senderEmail) return null;

    const from = { name: settings.senderName, email: settings.senderEmail };

    if (settings.provider === EmailProvider.Resend) {
      if (!settings.resendApiKeyEncrypted) return null;
      return {
        transport: new ResendTransport(this.encryption.decrypt(settings.resendApiKeyEncrypted)),
        from,
      };
    }

    // Smtp | Microsoft365 | GoogleWorkspace — identyczny transport SMTP, różni się tylko host/port.
    if (
      !settings.smtpHost ||
      !settings.smtpPort ||
      !settings.smtpUsername ||
      !settings.smtpPasswordEncrypted
    ) {
      return null;
    }
    return {
      transport: new SmtpTransport({
        host: settings.smtpHost,
        port: settings.smtpPort,
        username: settings.smtpUsername,
        password: this.encryption.decrypt(settings.smtpPasswordEncrypted),
        encryption: settings.smtpEncryption,
      }),
      from,
    };
  }
}
