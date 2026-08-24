import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { NotificationStatus } from '@prisma/client';
import {
  MAX_NOTIFICATION_ATTEMPTS,
  NotificationsRepository,
} from '../modules/notifications/notifications.repository';
import { IMailService, MAIL_SERVICE } from './mail.interface';

const DISPATCH_INTERVAL_MS = parseInt(process.env.NOTIFICATION_DISPATCH_INTERVAL_MS ?? '10000', 10);
const BATCH_SIZE = 20;

/**
 * Jedyna ścieżka faktycznej wysyłki `Notification` (EVENTS.md §11.2) — celowo
 * NIE w handlerze zdarzenia: `InMemoryEventBus.publish()` jest `await`-owany
 * przez wołające serwisy domenowe (`CasesService` itp.), więc realna wysyłka
 * SMTP/HTTP w handlerze zablokowałaby odpowiedź API na każdą operację, która
 * wyzwala powiadomienie. Zamiast tego: `createNotificationFromTemplate`
 * zostaje szybkim, wyłącznie-bazodanowym `INSERT`-em (bez zmian), a ten
 * cykliczny dispatcher odpytuje `Pending`/`Failed` co
 * `NOTIFICATION_DISPATCH_INTERVAL_MS` (domyślnie 10s) i faktycznie wysyła —
 * e-mail dociera zwykle w ciągu kilkunastu sekund od zdarzenia, nie
 * natychmiast; to świadomy kompromis, nie przeoczenie.
 */
@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);
  private running = false;

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    @Inject(MAIL_SERVICE) private readonly mailService: IMailService,
    private readonly config: ConfigService,
  ) {}

  @Interval(DISPATCH_INTERVAL_MS)
  async dispatchDue(): Promise<void> {
    // Testy jednostkowe nie potrzebują tła odpytującego bazę; ScheduleModule
    // i tak by tego nie uruchomił poza pełnym kontekstem Nest, ale to dodatkowe
    // zabezpieczenie, gdyby kiedyś jednak wystartował.
    if (this.config.get<string>('app.nodeEnv') === 'test') return;
    // Zapobiega nakładaniu się przebiegów, gdyby jeden cykl trwał dłużej niż interwał.
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.notificationsRepository.findDueForDispatch(BATCH_SIZE);
      for (const notification of due) {
        if (!notification.recipientEmail) continue; // NOTIFICATIONS.md §8 — już Failed od razu przy tworzeniu, nic do zrobienia
        const result = await this.mailService.send({
          companyId: notification.companyId,
          to: notification.recipientEmail,
          subject: notification.subject ?? '(bez tematu)',
          html: notification.body,
          senderNameOverride: notification.senderNameOverride ?? undefined,
        });

        if (result.ok) {
          await this.notificationsRepository.updateStatus(notification.id, {
            status: NotificationStatus.Sent,
            sentAt: new Date(),
            failureReason: null,
          });
        } else {
          const attempts = notification.attempts + 1;
          await this.notificationsRepository.updateStatus(notification.id, {
            status: NotificationStatus.Failed,
            failureReason: result.error,
            attempts,
          });
          if (attempts >= MAX_NOTIFICATION_ATTEMPTS) {
            this.logger.warn(
              `Powiadomienie ${notification.id} osiągnęło limit prób (${MAX_NOTIFICATION_ATTEMPTS}) — zaprzestano ponawiania. Ostatni błąd: ${result.error}`,
            );
          }
        }
      }
    } finally {
      this.running = false;
    }
  }
}
