import { Injectable } from '@nestjs/common';
import { Notification, NotificationChannel, NotificationRecipientType, NotificationStatus, NotificationTemplate, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaClientLike = Prisma.TransactionClient | PrismaService;

/**
 * Czyste operacje na danych. `createTemplate`/`updateTemplate`/`create`
 * zawężone do jawnych typów (nie `Prisma.NotificationTemplateUncheckedCreateInput`/
 * `UpdateInput` wprost) — ten sam błąd naprawiony w Zadaniu 14 dla
 * `ProductsRepository`. Metody mutujące przyjmują opcjonalny `client`
 * (domyślnie `this.prisma`) — wzorzec transakcyjny z `CasesRepository`/
 * `AuditRepository` (Zadanie 16), choć tu rzadziej potrzebny (handlery
 * zdarzeń tworzą wyłącznie pojedynczy wiersz `Notification`, bez
 * towarzyszącego `CaseHistory`/`AuditLog` — patrz `NotificationsService`).
 */
@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllForCase(relatedCaseId: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({ where: { relatedCaseId }, orderBy: { createdAt: 'desc' } });
  }

  findAllForCompany(companyId: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  /** "Moje powiadomienia" (`recipientType=Employee`) — dzwoneczek w UI, NOTIFICATIONS.md §1. */
  findAllForUser(recipientUserId: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({ where: { recipientUserId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  findById(id: string): Promise<Notification | null> {
    return this.prisma.notification.findUnique({ where: { id } });
  }

  findTemplatesForCompany(companyId: string): Promise<NotificationTemplate[]> {
    return this.prisma.notificationTemplate.findMany({ where: { OR: [{ companyId: null }, { companyId }] } });
  }

  findTemplateById(id: string): Promise<NotificationTemplate | null> {
    return this.prisma.notificationTemplate.findUnique({ where: { id } });
  }

  /**
   * NOTIFICATIONS.md §2.2 — najpierw szablon per-firma, jeśli brak: globalny
   * (`companyId=null`). Tylko `active=true` — flaga istnieje właśnie po to,
   * żeby wyłączyć szablon bez usuwania go (nieopisane wprost jako reguła
   * rozwiązywania, ale to jedyny sensowny cel pola `active` w tym kontekście).
   */
  async resolveTemplate(companyId: string, code: string, channel: NotificationChannel): Promise<NotificationTemplate | null> {
    const companyTemplate = await this.prisma.notificationTemplate.findFirst({ where: { companyId, code, channel, active: true } });
    if (companyTemplate) return companyTemplate;
    return this.prisma.notificationTemplate.findFirst({ where: { companyId: null, code, channel, active: true } });
  }

  createTemplate(
    companyId: string | null,
    data: { code: string; channel: NotificationChannel; subject?: string; bodyTemplate: string; variables: string[] },
    client: PrismaClientLike = this.prisma,
  ): Promise<NotificationTemplate> {
    return client.notificationTemplate.create({ data: { ...data, companyId } });
  }

  updateTemplate(
    id: string,
    data: Partial<{ subject: string | null; bodyTemplate: string; variables: string[]; active: boolean }>,
    client: PrismaClientLike = this.prisma,
  ): Promise<NotificationTemplate> {
    return client.notificationTemplate.update({ where: { id }, data });
  }

  create(
    data: {
      companyId: string;
      templateId?: string;
      channel: NotificationChannel;
      recipientType: NotificationRecipientType;
      recipientUserId?: string;
      recipientManufacturerId?: string;
      recipientEmail?: string;
      recipientPhone?: string;
      relatedCaseId?: string;
      subject?: string;
      body: string;
      status?: NotificationStatus;
      failureReason?: string;
    },
    client: PrismaClientLike = this.prisma,
  ): Promise<Notification> {
    return client.notification.create({ data });
  }

  markAsRead(id: string, client: PrismaClientLike = this.prisma): Promise<Notification> {
    return client.notification.update({ where: { id }, data: { status: NotificationStatus.Read, readAt: new Date() } });
  }

  /** Naturalna idempotencja (EVENTS.md §8.2 mechanizm 1) — `where: status != Read` sprawia, że powtórne wywołanie nie znajduje nic do zaktualizowania. */
  async markAllAsReadForUser(recipientUserId: string, client: PrismaClientLike = this.prisma): Promise<number> {
    const result = await client.notification.updateMany({
      where: { recipientUserId, status: { not: NotificationStatus.Read } },
      data: { status: NotificationStatus.Read, readAt: new Date() },
    });
    return result.count;
  }
}
