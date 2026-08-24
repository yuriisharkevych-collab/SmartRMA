import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationRecipientType } from '@prisma/client';
import { CaseStatusChangedPayload } from '../../../events/contracts/case.events';
import { DomainEventHandler } from '../../../events/decorators/domain-event-handler.decorator';
import { DomainEvent } from '../../../events/domain-event.base';
import { EVENT_NAMES } from '../../../events/event-names.const';
import { IdempotencyService } from '../../../events/idempotency.service';
import { CaseStatusesService } from '../../case-statuses/case-statuses.service';
import { CasesService } from '../../cases/cases.service';
import { CustomersService } from '../../customers/customers.service';
import { NotificationsService } from '../notifications.service';

const CANCELLATION_REASON_PREFIX = 'Powód anulowania: ';

/** Szablony, których treść trafia RÓWNIEŻ jako wiadomość w Portalu Klienta (nie tylko e-mail) — właściciel wskazał wprost te dwa momenty: zamknięcie sprawy i towar gotowy do odbioru (`case.cancelled.customer`/`case.status_changed.customer`/`case.sent_to_manufacturer.customer` celowo NIE są tu, nie było o nie proszone). */
const TEMPLATE_CODES_MIRRORED_TO_PORTAL = new Set([
  'case.closed.customer',
  'case.ready_for_pickup.customer',
]);

/**
 * NOTIFICATIONS.md §3 — `case.status_changed.customer`/`case.sent_to_manufacturer.
 * customer`/`case.ready_for_pickup.customer`/`case.closed.customer`/
 * `case.cancelled.customer`. Status Workflow Refactor — dobór szablonu NIE
 * jest już przez hardcodowany `Record<CaseStatus,...>` (dawny
 * `CASE_STATUS_NOTIFICATION_RULES`, usunięty), tylko przez pole
 * `CaseStatusDefinition.notifyCustomerTemplateCode` na wierszu statusu
 * docelowego — admin decyduje o tym per status w Ustawienia → Statusy
 * reklamacji, brak wiersza/pusty kod = bezpieczny domyślny brak e-maila.
 * Anulowanie (`payload.cancelled`) zawsze nadpisuje na `case.cancelled.customer`
 * niezależnie od tego, co skonfigurowano na docelowym statusie (zawsze
 * "Zakończona") — inaczej klient dostałby "Reklamacja zakończona" zamiast
 * informacji o anulowaniu.
 */
@Injectable()
export class CaseStatusChangedNotificationHandler {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly casesService: CasesService,
    private readonly customersService: CustomersService,
    private readonly caseStatusesService: CaseStatusesService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @DomainEventHandler(EVENT_NAMES.CASE_STATUS_CHANGED)
  async handle(event: DomainEvent<CaseStatusChangedPayload>): Promise<void> {
    const isFirst = await this.idempotencyService.tryMarkProcessed(
      event.eventId,
      CaseStatusChangedNotificationHandler.name,
    );
    if (!isFirst) return;
    if (!event.payload.notifyCustomer) return;

    const statusDef = await this.caseStatusesService.findByCode(
      event.payload.newStatus,
      event.companyId,
    );
    const templateCode = event.payload.cancelled
      ? 'case.cancelled.customer'
      : statusDef?.notifyCustomerTemplateCode;
    if (!templateCode) return;

    const caseEntity = await this.casesService.findById(event.aggregateId, event.companyId);
    const customer = await this.customersService.findById(caseEntity.customerId, event.companyId);

    const variables: Record<string, string> = { caseNumber: caseEntity.caseNumber };
    if (templateCode === 'case.status_changed.customer') {
      variables.statusLabel = statusDef?.label ?? event.payload.newStatus;
    }
    if (templateCode === 'case.cancelled.customer') {
      variables.reason = await this.resolveCancellationReason(caseEntity.id, event.companyId);
    }

    const notification = await this.notificationsService.createNotificationFromTemplate({
      companyId: caseEntity.companyId,
      code: templateCode,
      channel: NotificationChannel.Email,
      recipientType: NotificationRecipientType.Customer,
      recipientEmail: customer.email ?? undefined,
      relatedCaseId: caseEntity.id,
      senderNameOverride: caseEntity.notificationSenderName ?? undefined,
      variables,
    });

    // Zamknięcie sprawy i "towar gotowy do odbioru" — dokładnie ta sama
    // treść co e-mail trafia też do Portalu Klienta jako wiadomość, żeby
    // klient widział ją nawet bez otwierania skrzynki (patrz
    // `TEMPLATE_CODES_MIRRORED_TO_PORTAL` — świadomie NIE każdy status,
    // tylko te dwa, o które poprosił właściciel).
    if (TEMPLATE_CODES_MIRRORED_TO_PORTAL.has(templateCode) && notification) {
      await this.casesService.appendSystemMessage(
        caseEntity.id,
        caseEntity.companyId,
        notification.body,
      );
    }
  }

  /**
   * Powód anulowania jest zapisywany jako `Note` (`CasesService.cancel()`
   * → `performTransition`), NIE w payloadzie `case.status_changed` —
   * best-effort: najnowsza notatka sprawy. To rozwiązanie NIE jest wprost
   * udokumentowane (NOTIFICATIONS.md nie opisuje, skąd handler ma wziąć
   * `reason`) — patrz raport końcowy.
   */
  private async resolveCancellationReason(caseId: string, companyId: string): Promise<string> {
    const notes = await this.casesService.findNotes(caseId, companyId);
    const latest = notes[0]?.content ?? '';
    return latest.startsWith(CANCELLATION_REASON_PREFIX)
      ? latest.slice(CANCELLATION_REASON_PREFIX.length)
      : latest || 'Brak podanego powodu';
  }
}
