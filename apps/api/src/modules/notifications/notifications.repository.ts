import { Injectable } from '@nestjs/common';
import {
  Notification,
  NotificationChannel,
  NotificationRecipientType,
  NotificationStatus,
  NotificationTemplate,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaClientLike = Prisma.TransactionClient | PrismaService;

/** `NotificationDispatcherService` (`mail/`) przestaje ponawiać po tylu nieudanych próbach wysyłki (EVENTS.md §11.2 — "Failed z liczbą prób poniżej limitu"). */
export const MAX_NOTIFICATION_ATTEMPTS = 5;

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

  /** `companyId` obowiązkowy — bez niego powiadomienia (treść/adres odbiorcy) wysłane w kontekście sprawy innej firmy dałoby się odczytać, znając samo UUID sprawy (IDOR, patrz audyt bezpieczeństwa). */
  findAllForCase(relatedCaseId: string, companyId: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { relatedCaseId, companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findAllForCompany(companyId: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** "Moje powiadomienia" (`recipientType=Employee`) — dzwoneczek w UI, NOTIFICATIONS.md §1. */
  findAllForUser(recipientUserId: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { recipientUserId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Bez `companyId` — WYŁĄCZNIE dla odczytów zasobu osobistego już zawężonego po `recipientUserId` (patrz `NotificationsService.getMyNotification`/`markAsRead`). Widok administracyjny (`GET /notifications/:id`) używa `findByIdForCompany`. */
  findById(id: string): Promise<Notification | null> {
    return this.prisma.notification.findUnique({ where: { id } });
  }

  /** `companyId` obowiązkowy dla widoku administracyjnego `GET /notifications/:id` — bez tego dałoby się odczytać treść/adres odbiorcy powiadomienia innej firmy, znając samo UUID (IDOR, patrz audyt bezpieczeństwa). */
  findByIdForCompany(id: string, companyId: string): Promise<Notification | null> {
    return this.prisma.notification.findFirst({ where: { id, companyId } });
  }

  findTemplatesForCompany(companyId: string): Promise<NotificationTemplate[]> {
    return this.prisma.notificationTemplate.findMany({
      where: { OR: [{ companyId: null }, { companyId }] },
    });
  }

  /** Widoczność jak `findTemplatesForCompany` (globalny LUB własny firmy) — `NotificationsService.updateTemplate` odrzuca globalne (`companyId=null`) osobno, ten endpoint nie ma ich edytować. */
  findTemplateByIdForCompany(id: string, companyId: string): Promise<NotificationTemplate | null> {
    return this.prisma.notificationTemplate.findFirst({
      where: { id, OR: [{ companyId: null }, { companyId }] },
    });
  }

  /**
   * NOTIFICATIONS.md §2.2 — najpierw szablon per-firma, jeśli brak: globalny
   * (`companyId=null`). Tylko `active=true` — flaga istnieje właśnie po to,
   * żeby wyłączyć szablon bez usuwania go (nieopisane wprost jako reguła
   * rozwiązywania, ale to jedyny sensowny cel pola `active` w tym kontekście).
   */
  async resolveTemplate(
    companyId: string,
    code: string,
    channel: NotificationChannel,
  ): Promise<NotificationTemplate | null> {
    const companyTemplate = await this.prisma.notificationTemplate.findFirst({
      where: { companyId, code, channel, active: true },
    });
    if (companyTemplate) return companyTemplate;
    return this.prisma.notificationTemplate.findFirst({
      where: { companyId: null, code, channel, active: true },
    });
  }

  /**
   * Fundament „Fresh Install" — szablony CYKLU ŻYCIA KONTA
   * (`account.emailVerification` itd.), wołane z `AccountRecoveryService`/
   * `CompaniesService.signup`, gdzie WYŁĄCZNIE globalny wariant ma sens:
   * nie ma jeszcze `companyId` (nowa firma) albo w ogóle go nie będzie
   * (`PlatformAdmin`). Druga połowa `resolveTemplate` wyżej, wydzielona —
   * bez fałszywego `companyId` przekazywanego tam "na siłę".
   */
  findGlobalTemplate(
    code: string,
    channel: NotificationChannel,
  ): Promise<NotificationTemplate | null> {
    return this.prisma.notificationTemplate.findFirst({
      where: { companyId: null, code, channel, active: true },
    });
  }

  createTemplate(
    companyId: string | null,
    data: {
      code: string;
      channel: NotificationChannel;
      subject?: string;
      bodyTemplate: string;
      variables: string[];
    },
    client: PrismaClientLike = this.prisma,
  ): Promise<NotificationTemplate> {
    return client.notificationTemplate.create({ data: { ...data, companyId } });
  }

  updateTemplate(
    id: string,
    data: Partial<{
      subject: string | null;
      bodyTemplate: string;
      variables: string[];
      active: boolean;
    }>,
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
      senderNameOverride?: string;
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
    return client.notification.update({
      where: { id },
      data: { status: NotificationStatus.Read, readAt: new Date() },
    });
  }

  /** Naturalna idempotencja (EVENTS.md §8.2 mechanizm 1) — `where: status != Read` sprawia, że powtórne wywołanie nie znajduje nic do zaktualizowania. */
  async markAllAsReadForUser(
    recipientUserId: string,
    client: PrismaClientLike = this.prisma,
  ): Promise<number> {
    const result = await client.notification.updateMany({
      where: { recipientUserId, status: { not: NotificationStatus.Read } },
      data: { status: NotificationStatus.Read, readAt: new Date() },
    });
    return result.count;
  }

  /**
   * `NotificationDispatcherService` — EVENTS.md §11.2, jedyna ścieżka
   * faktycznej wysyłki (nie tylko odzyskiwanie, patrz doc-comment
   * `NotificationsService.createNotificationFromTemplate`). `Pending` = nigdy
   * nieprzetworzone; `Failed` z `attempts < MAX_NOTIFICATION_ATTEMPTS` = do
   * ponowienia. Sortowanie po `createdAt` — starsze najpierw.
   *
   * POPRAWKA (Etap 1 — znaleziona przy prawdziwym teście e-maili): wiersze
   * bez `recipientEmail` (`status=Failed` ustawiane OD RAZU przy tworzeniu w
   * `createNotificationFromTemplate`, `attempts` NIGDY nie rośnie — dispatcher
   * jawnie je pomija przez `continue`, patrz ten plik) BEZ tego filtra
   * pasowały do warunku `Failed AND attempts<MAX` w nieskończoność. Gdy takich
   * "zombie" wierszy uzbierało się `BATCH_SIZE` (20) — co w tej instalacji
   * faktycznie się zdarzyło po kilku dniach testów — `take: limit` wypełniał
   * się CAŁKOWICIE nimi w KAŻDYM cyklu (sortowanie od najstarszych), więc
   * żadna PRAWDZIWA, nowsza sprawa do wysłania nigdy nie trafiała do partii —
   * zaobserwowane na żywo: e-maile wisiały w `Pending` bez końca mimo
   * poprawnej konfiguracji poczty. `recipientEmail: { not: null }` wyklucza
   * te wiersze u ŹRÓDŁA — mają i tak nic do zrobienia (nie da się wysłać
   * e-maila bez adresu), więc nie powinny NIGDY były być "due".
   */
  findDueForDispatch(
    limit: number,
    client: PrismaClientLike = this.prisma,
  ): Promise<Notification[]> {
    return client.notification.findMany({
      where: {
        channel: NotificationChannel.Email,
        recipientEmail: { not: null },
        OR: [
          { status: NotificationStatus.Pending },
          { status: NotificationStatus.Failed, attempts: { lt: MAX_NOTIFICATION_ATTEMPTS } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  updateStatus(
    id: string,
    data: {
      status: NotificationStatus;
      sentAt?: Date;
      failureReason?: string | null;
      attempts?: number;
    },
    client: PrismaClientLike = this.prisma,
  ): Promise<Notification> {
    return client.notification.update({ where: { id }, data });
  }

  /** `cases.delete` (RBAC.md §5, jedyny hard-delete w aplikacji) — na wyraźne żądanie właściciela, wyłącznie dla usuwania spraw testowych. */
  deleteAllForCase(
    caseId: string,
    client: PrismaClientLike = this.prisma,
  ): Promise<Prisma.BatchPayload> {
    return client.notification.deleteMany({ where: { relatedCaseId: caseId } });
  }
}
