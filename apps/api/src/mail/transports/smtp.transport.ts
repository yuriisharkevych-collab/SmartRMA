import { createTransport } from 'nodemailer';
import { SmtpEncryption } from '@prisma/client';
import { MailTransport, ResolvedSender, TransportMessage } from './mail-transport.interface';

export interface SmtpTransportConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: SmtpEncryption;
}

/** Wspólny transport dla `EmailProvider.Smtp`/`Microsoft365`/`GoogleWorkspace` — u wszystkich trzech identyczny protokół SMTP, różni się wyłącznie host/port, które administrator wpisuje w Ustawienia → E-mail. */
export class SmtpTransport implements MailTransport {
  constructor(private readonly config: SmtpTransportConfig) {}

  async send(message: TransportMessage, from: ResolvedSender): Promise<void> {
    const transporter = createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.encryption === SmtpEncryption.Ssl,
      requireTLS: this.config.encryption === SmtpEncryption.Tls,
      auth: { user: this.config.username, pass: this.config.password },
    });
    await transporter.sendMail({
      from: `"${from.name}" <${from.email}>`,
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
  }
}
