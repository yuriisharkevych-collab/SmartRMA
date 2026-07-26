import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationRecipientType } from '@prisma/client';
import { CaseOwnerChangedPayload } from '../../../events/contracts/case.events';
import { DomainEventHandler } from '../../../events/decorators/domain-event-handler.decorator';
import { DomainEvent } from '../../../events/domain-event.base';
import { EVENT_NAMES } from '../../../events/event-names.const';
import { IdempotencyService } from '../../../events/idempotency.service';
import { CasesService } from '../../cases/cases.service';
import { NotificationsService } from '../notifications.service';

/**
 * WORKFLOW.md §6 poz. 17 wprost wymaga: "Notification systemowe do nowego
 * opiekuna ('przypisano Ci sprawę')" po zmianie `Case.ownerId`. UWAGA:
 * `NOTIFICATIONS.md` §3 (katalog szablonów) NIE wymienia żadnego kodu dla
 * tego zdarzenia — luka między dwoma dokumentami, patrz raport końcowy.
 * Kod `case.owner_changed.employee` użyty tu zgodnie z ustaloną konwencją
 * `{obszar}.{zdarzenie}.{odbiorca}` (NOTIFICATIONS.md §2.1), nie jest to
 * nowy mechanizm — tylko kolejna wartość dla już istniejącego,
 * generycznego systemu rozwiązywania szablonów po `code`.
 */
@Injectable()
export class CaseOwnerChangedNotificationHandler {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly casesService: CasesService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @DomainEventHandler(EVENT_NAMES.CASE_OWNER_CHANGED)
  async handle(event: DomainEvent<CaseOwnerChangedPayload>): Promise<void> {
    const isFirst = await this.idempotencyService.tryMarkProcessed(event.eventId, CaseOwnerChangedNotificationHandler.name);
    if (!isFirst) return;

    const caseEntity = await this.casesService.findById(event.aggregateId);

    await this.notificationsService.createNotificationFromTemplate({
      companyId: caseEntity.companyId,
      code: 'case.owner_changed.employee',
      channel: NotificationChannel.System,
      recipientType: NotificationRecipientType.Employee,
      recipientUserId: event.payload.newOwnerId,
      relatedCaseId: caseEntity.id,
      variables: { caseNumber: caseEntity.caseNumber },
    });
  }
}
