import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationRecipientType } from '@prisma/client';
import { CaseStatusChangedPayload } from '../../../events/contracts/case.events';
import { DomainEventHandler } from '../../../events/decorators/domain-event-handler.decorator';
import { DomainEvent } from '../../../events/domain-event.base';
import { EVENT_NAMES } from '../../../events/event-names.const';
import { IdempotencyService } from '../../../events/idempotency.service';
import { CasesService } from '../../cases/cases.service';
import { CustomersService } from '../../customers/customers.service';
import { CASE_STATUS_NOTIFICATION_RULES } from '../case-status-notification.rules';
import { NotificationsService } from '../notifications.service';

const CANCELLATION_REASON_PREFIX = 'Powód anulowania: ';

/**
 * NOTIFICATIONS.md §3 — `case.status_changed.customer`/`case.ready_for_pickup.
 * customer`/`case.closed.customer`/`case.cancelled.customer`, dobór przez
 * `CASE_STATUS_NOTIFICATION_RULES` (transkrypcja WORKFLOW.md §7). Statusy
 * "Nie" (i `Nowa`/`OczekiwanieNaKlienta`, obsłużone przez inne zdarzenia)
 * mają `templateCode: null` — handler wtedy nic nie robi.
 */
@Injectable()
export class CaseStatusChangedNotificationHandler {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly casesService: CasesService,
    private readonly customersService: CustomersService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @DomainEventHandler(EVENT_NAMES.CASE_STATUS_CHANGED)
  async handle(event: DomainEvent<CaseStatusChangedPayload>): Promise<void> {
    const isFirst = await this.idempotencyService.tryMarkProcessed(event.eventId, CaseStatusChangedNotificationHandler.name);
    if (!isFirst) return;

    const rule = CASE_STATUS_NOTIFICATION_RULES[event.payload.newStatus];
    if (!rule.templateCode) return;

    const caseEntity = await this.casesService.findById(event.aggregateId);
    const customer = await this.customersService.findById(caseEntity.customerId);

    const variables: Record<string, string> = { caseNumber: caseEntity.caseNumber };
    if (rule.templateCode === 'case.status_changed.customer') {
      variables.statusLabel = rule.statusLabel;
    }
    if (rule.templateCode === 'case.cancelled.customer') {
      variables.reason = await this.resolveCancellationReason(caseEntity.id);
    }

    await this.notificationsService.createNotificationFromTemplate({
      companyId: caseEntity.companyId,
      code: rule.templateCode,
      channel: NotificationChannel.Email,
      recipientType: NotificationRecipientType.Customer,
      recipientEmail: customer.email ?? undefined,
      relatedCaseId: caseEntity.id,
      variables,
    });
  }

  /**
   * Powód anulowania jest zapisywany jako `Note` (WORKFLOW.md §5: "Note lub
   * CaseHistory.newValue" — `CasesService.cancel()` wybrał wariant Note), NIE
   * w payloadzie `case.status_changed` — best-effort: najnowsza notatka
   * sprawy. To rozwiązanie NIE jest wprost udokumentowane (NOTIFICATIONS.md
   * nie opisuje, skąd handler ma wziąć `reason`) — patrz raport końcowy.
   */
  private async resolveCancellationReason(caseId: string): Promise<string> {
    const notes = await this.casesService.findNotes(caseId);
    const latest = notes[0]?.content ?? '';
    return latest.startsWith(CANCELLATION_REASON_PREFIX) ? latest.slice(CANCELLATION_REASON_PREFIX.length) : latest || 'Brak podanego powodu';
  }
}
