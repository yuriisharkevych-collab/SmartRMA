import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationRecipientType,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { NotificationTemplateEntity } from './entities/notification-template.entity';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationMapper } from './mappers/notification.mapper';
import { NotificationsRepository } from './notifications.repository';

/**
 * NOTIFICATIONS.md §2.3 — podstawianie proste, bez logiki warunkowej/pętli; placeholder bez
 * dopasowanej zmiennej zostaje w tekście (ułatwia debugowanie brakującej zmiennej zamiast
 * cichego pustego pola). Eksportowana (nie tylko lokalna) — `AccountRecoveryService`
 * (Fundament „Fresh Install") reużywa ją do renderowania szablonów `account.*`, które
 * omijają `createNotificationFromTemplate`/`Notification` (patrz jej doc-comment).
 */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => variables[key] ?? match);
}

export interface CreateNotificationParams {
  companyId: string;
  code: string;
  channel: NotificationChannel;
  recipientType: NotificationRecipientType;
  recipientUserId?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  recipientManufacturerId?: string;
  relatedCaseId?: string;
  /** Nadpisuje nazwę nadawcy e-mail dla TEGO powiadomienia (np. "Veres Meble") — patrz komentarz przy `Case.notificationSenderName`/`Notification.senderNameOverride` w schemacie. `undefined` = zachowanie bez zmian (nazwa firmy z Ustawienia → E-mail). */
  senderNameOverride?: string;
  variables: Record<string, string>;
}

/**
 * `createNotification()` z zakresu zadania to `createNotificationFromTemplate()`
 * poniżej — jedyny udokumentowany sposób powstania `Notification`
 * (NOTIFICATIONS.md §2: każde powiadomienie pochodzi z szablonu). Wołane
 * GŁÓWNIE przez handlery zdarzeń w `handlers/` — ten serwis sam nie zna
 * żadnego agregatu źródłowego (Case/Customer/...), tylko gotowe dane
 * odbiorcy jako parametry. Dwa udokumentowane wyjątki wołają bezpośrednio,
 * z pominięciem handlera: `IntakeService.submitComplaint` i
 * `CasesService.enablePortal` (moduł e-mail) — oba potrzebują wartości
 * dostępnej WYŁĄCZNIE w danym wywołaniu (świeżo wygenerowany, jednorazowy
 * kod dostępu), której nie da się bezpiecznie przenieść przez payload
 * zdarzenia bez trwałego przechowywania jawnego kodu.
 *
 * Faktyczna wysyłka (SMTP/Resend) NIE dzieje się tutaj — `Notification.status=Pending`
 * to koniec odpowiedzialności tej metody. Osobny `NotificationDispatcherService`
 * (`mail/`) cyklicznie odpytuje `Pending`/`Failed` i wywołuje `IMailService`
 * (EVENTS.md §11.2) — celowo NIE w handlerze zdarzenia, bo `InMemoryEventBus.publish()`
 * jest `await`-owany przez wołające serwisy domenowe (patrz `CasesService`),
 * więc realna wysyłka SMTP w handlerze zablokowałaby odpowiedź API. Wyjątek:
 * brak adresu odbiorcy dla kanału `Email` — wtedy `status=Failed` NATYCHMIAST,
 * zgodnie z NOTIFICATIONS.md §8 ("bez próby wysyłki na pusty adres").
 *
 * Brak audytu (`AuditLog`) — NOTIFICATIONS.md nigdzie go nie wymaga;
 * `AuditLog` rejestruje mutacje danych biznesowych (BR-088), nie
 * wewnętrzne efekty uboczne systemu powiadomień (EVENTS.md §9.2 krok 3
 * mówi to samo o awariach technicznych — tym bardziej o normalnym
 * tworzeniu). Zgodnie z zadaniem: "w przeciwnym razie nie dodawaj go
 * samodzielnie".
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly notificationsRepository: NotificationsRepository) {}

  async listNotifications(companyId: string): Promise<NotificationEntity[]> {
    return NotificationMapper.toEntityList(
      await this.notificationsRepository.findAllForCompany(companyId),
    );
  }

  async listForCase(caseId: string, companyId: string): Promise<NotificationEntity[]> {
    return NotificationMapper.toEntityList(
      await this.notificationsRepository.findAllForCase(caseId, companyId),
    );
  }

  async getNotification(id: string, companyId: string): Promise<NotificationEntity> {
    const notification = await this.notificationsRepository.findByIdForCompany(id, companyId);
    if (!notification) throw new NotFoundException();
    return NotificationMapper.toEntity(notification);
  }

  /** "Moje powiadomienia" — bez `notifications.view` (permission gates WYŁĄCZNIE historię wysłanych powiadomień CAŁEJ firmy, RBAC.md: "Przeglądanie historii wysłanych powiadomień", macierz ról ogranicza to do Administratora/Kierownika). Własne powiadomienia to zasób osobisty, wzorzec z `GET /companies/me`. */
  async listMyNotifications(recipientUserId: string): Promise<NotificationEntity[]> {
    return NotificationMapper.toEntityList(
      await this.notificationsRepository.findAllForUser(recipientUserId),
    );
  }

  async getMyNotification(recipientUserId: string, id: string): Promise<NotificationEntity> {
    const notification = await this.findNotificationOrThrow(id);
    if (notification.recipientUserId !== recipientUserId) throw new NotFoundException();
    return NotificationMapper.toEntity(notification);
  }

  /** Idempotentne — jeśli już `Read`, zwraca bez zmian (bez ponownego nadpisania `readAt`). */
  async markAsRead(recipientUserId: string, id: string): Promise<NotificationEntity> {
    const notification = await this.findNotificationOrThrow(id);
    if (notification.recipientUserId !== recipientUserId) throw new NotFoundException();
    if (notification.status === NotificationStatus.Read)
      return NotificationMapper.toEntity(notification);
    return NotificationMapper.toEntity(await this.notificationsRepository.markAsRead(id));
  }

  /** Naturalnie idempotentne (EVENTS.md §8.2 mechanizm 1) — `WHERE status != Read` w repozytorium. */
  async markAllAsRead(recipientUserId: string): Promise<{ updatedCount: number }> {
    const updatedCount = await this.notificationsRepository.markAllAsReadForUser(recipientUserId);
    return { updatedCount };
  }

  async listTemplates(companyId: string): Promise<NotificationTemplateEntity[]> {
    return NotificationMapper.templatesToEntities(
      await this.notificationsRepository.findTemplatesForCompany(companyId),
    );
  }

  /** `notifications.templates.manage`. Tworzy szablon PER FIRMA (nadpisanie globalnego, NOTIFICATIONS.md §2.2) — szablony globalne (`companyId=null`) to dane seeda, nie tworzone przez ten endpoint. */
  async createTemplate(
    companyId: string,
    dto: CreateTemplateDto,
  ): Promise<NotificationTemplateEntity> {
    return NotificationMapper.templateToEntity(
      await this.notificationsRepository.createTemplate(companyId, dto),
    );
  }

  /** Szablony globalne (`companyId=null`) są WIDOCZNE dla firmy (`findTemplateByIdForCompany`), ale NIE edytowalne tym endpointem — inaczej jedna firma mogłaby zmienić treść wiadomości wysyłanych przez WSZYSTKIE firmy (IDOR, patrz audyt bezpieczeństwa). Edycja globalnego = 404, tak samo jak "nie istnieje dla ciebie". */
  async updateTemplate(
    id: string,
    companyId: string,
    dto: UpdateTemplateDto,
  ): Promise<NotificationTemplateEntity> {
    const existing = await this.notificationsRepository.findTemplateByIdForCompany(id, companyId);
    if (!existing || existing.companyId === null) throw new NotFoundException();
    return NotificationMapper.templateToEntity(
      await this.notificationsRepository.updateTemplate(id, dto),
    );
  }

  /**
   * NOTIFICATIONS.md §2.2 (rozwiązanie szablonu) + §5 (odbiorca) + §8 (błędy).
   * Zwraca `null` (bez rzucania wyjątku), gdy brak szablonu — NOTIFICATION-002
   * nie blokuje operacji wyzwalającej (§8: "zdarzenie wyzwalające kończy się
   * sukcesem mimo to"); wołający (handler) już jest poza cyklem
   * żądanie/odpowiedź HTTP źródłowej operacji, więc nie ma czego zwrócić
   * klientowi — log ostrzeżenia jest jedyną właściwą reakcją.
   */
  async createNotificationFromTemplate(
    params: CreateNotificationParams,
  ): Promise<NotificationEntity | null> {
    const template = await this.notificationsRepository.resolveTemplate(
      params.companyId,
      params.code,
      params.channel,
    );
    if (!template) {
      this.logger.warn(
        `NOTIFICATION-002 — brak szablonu '${params.code}'/${params.channel} dla firmy ${params.companyId} (i brak globalnego) — powiadomienie pominięte.`,
      );
      return null;
    }

    const missingRecipient = params.channel === NotificationChannel.Email && !params.recipientEmail;

    const notification = await this.notificationsRepository.create({
      companyId: params.companyId,
      templateId: template.id,
      channel: params.channel,
      recipientType: params.recipientType,
      recipientUserId: params.recipientUserId,
      recipientEmail: params.recipientEmail,
      recipientPhone: params.recipientPhone,
      recipientManufacturerId: params.recipientManufacturerId,
      relatedCaseId: params.relatedCaseId,
      senderNameOverride: params.senderNameOverride,
      subject: template.subject ? renderTemplate(template.subject, params.variables) : undefined,
      body: renderTemplate(template.bodyTemplate, params.variables),
      status: missingRecipient ? NotificationStatus.Failed : undefined,
      failureReason: missingRecipient ? 'Brak adresu odbiorcy' : undefined,
    });

    return NotificationMapper.toEntity(notification);
  }

  /** `cases.delete` (RBAC.md §5, jedyny hard-delete w aplikacji) — wołane przez `CasesService.hardDelete` wewnątrz jego transakcji (`client` = `tx`). */
  deleteAllForCase(
    caseId: string,
    client?: Parameters<NotificationsRepository['deleteAllForCase']>[1],
  ): Promise<Prisma.BatchPayload> {
    return this.notificationsRepository.deleteAllForCase(caseId, client);
  }

  private async findNotificationOrThrow(id: string) {
    const notification = await this.notificationsRepository.findById(id);
    if (!notification) throw new NotFoundException();
    return notification;
  }
}
