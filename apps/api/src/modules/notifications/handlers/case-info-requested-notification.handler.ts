import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationRecipientType } from '@prisma/client';
import { CaseInfoRequestedPayload } from '../../../events/contracts/case.events';
import { DomainEventHandler } from '../../../events/decorators/domain-event-handler.decorator';
import { DomainEvent } from '../../../events/domain-event.base';
import { EVENT_NAMES } from '../../../events/event-names.const';
import { IdempotencyService } from '../../../events/idempotency.service';
import { CasesService } from '../../cases/cases.service';
import { CustomersService } from '../../customers/customers.service';
import { NotificationsService } from '../notifications.service';

/**
 * `case.info_requested.customer` — przejście w `OczekiwanieNaKlienta` publikuje
 * `case.info_requested` zamiast `case.status_changed` (patrz komentarz w
 * `case-status-notification.rules.ts`), więc obsługa "Prośba o uzupełnienie
 * danych" żyje w osobnym handlerze, nie w `CaseStatusChangedNotificationHandler`.
 * Wcześniej ten handler NIE istniał — `cases.infoRequest.send` nie wysyłał
 * żadnego powiadomienia do klienta mimo `WORKFLOW.md §7` ("Powiadom klienta?
 * Tak"); domknięte przy module Ustawienia (edytowalny szablon tej wiadomości).
 */
@Injectable()
export class CaseInfoRequestedNotificationHandler {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly casesService: CasesService,
    private readonly customersService: CustomersService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @DomainEventHandler(EVENT_NAMES.CASE_INFO_REQUESTED)
  async handle(event: DomainEvent<CaseInfoRequestedPayload>): Promise<void> {
    const isFirst = await this.idempotencyService.tryMarkProcessed(
      event.eventId,
      CaseInfoRequestedNotificationHandler.name,
    );
    if (!isFirst) return;

    const caseEntity = await this.casesService.findById(event.aggregateId, event.companyId);
    const customer = await this.customersService.findById(caseEntity.customerId, event.companyId);

    await this.notificationsService.createNotificationFromTemplate({
      companyId: caseEntity.companyId,
      code: 'case.info_requested.customer',
      channel: NotificationChannel.Email,
      recipientType: NotificationRecipientType.Customer,
      recipientEmail: customer.email ?? undefined,
      relatedCaseId: caseEntity.id,
      senderNameOverride: caseEntity.notificationSenderName ?? undefined,
      variables: {
        caseNumber: caseEntity.caseNumber,
        requestedItems: event.payload.requestedItems.join(', '),
        messageText: event.payload.messageText,
      },
    });
  }
}
