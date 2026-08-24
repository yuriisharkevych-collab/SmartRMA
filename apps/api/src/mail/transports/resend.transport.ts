import { MailTransport, ResolvedSender, TransportMessage } from './mail-transport.interface';

const RESEND_API_URL = 'https://api.resend.com/emails';

/** `EmailProvider.Resend` — natywny `fetch` (Node 18+), bez dodatkowej zależności SDK. */
export class ResendTransport implements MailTransport {
  constructor(private readonly apiKey: string) {}

  async send(message: TransportMessage, from: ResolvedSender): Promise<void> {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${from.name} <${from.email}>`,
        to: [message.to],
        subject: message.subject,
        html: message.html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend API error ${response.status}: ${body}`);
    }
  }
}
