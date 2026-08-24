export interface ResolvedSender {
  name: string;
  email: string;
}

export interface TransportMessage {
  to: string;
  subject: string;
  html: string;
}

/** Implementacja pojedynczego dostawcy — `MailService` wybiera i wywołuje, sam nigdy nie rzuca (kontrakt `IMailService`), więc transporty mogą rzucać swobodnie, `MailService` je łapie. */
export interface MailTransport {
  send(message: TransportMessage, from: ResolvedSender): Promise<void>;
}
