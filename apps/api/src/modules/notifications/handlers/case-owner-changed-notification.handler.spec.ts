import { NotificationChannel, NotificationRecipientType } from '@prisma/client';
import { CasesService } from '../../cases/cases.service';
import { IdempotencyService } from '../../../events/idempotency.service';
import { DomainEvent } from '../../../events/domain-event.base';
import { EVENT_NAMES } from '../../../events/event-names.const';
import { CaseOwnerChangedPayload } from '../../../events/contracts/case.events';
import { NotificationsService } from '../notifications.service';
import { CaseOwnerChangedNotificationHandler } from './case-owner-changed-notification.handler';

function buildEvent(): DomainEvent<CaseOwnerChangedPayload> {
  return new DomainEvent({
    eventName: EVENT_NAMES.CASE_OWNER_CHANGED,
    companyId: 'company-1',
    aggregateType: 'Case',
    aggregateId: 'case-1',
    actorUserId: 'user-1',
    correlationId: 'correlation-1',
    payload: { previousOwnerId: null, newOwnerId: 'user-2', caseHistoryId: 'history-1' },
  });
}

describe('CaseOwnerChangedNotificationHandler', () => {
  let notificationsService: jest.Mocked<Pick<NotificationsService, 'createNotificationFromTemplate'>>;
  let casesService: jest.Mocked<Pick<CasesService, 'findById'>>;
  let idempotencyService: jest.Mocked<Pick<IdempotencyService, 'tryMarkProcessed'>>;
  let handler: CaseOwnerChangedNotificationHandler;

  beforeEach(() => {
    notificationsService = { createNotificationFromTemplate: jest.fn() };
    casesService = { findById: jest.fn().mockResolvedValue({ id: 'case-1', companyId: 'company-1', caseNumber: 'RMA/2026/00001' }) };
    idempotencyService = { tryMarkProcessed: jest.fn().mockResolvedValue(true) };

    handler = new CaseOwnerChangedNotificationHandler(
      notificationsService as unknown as NotificationsService,
      casesService as unknown as CasesService,
      idempotencyService as unknown as IdempotencyService,
    );
  });

  it('nie robi NIC, gdy zdarzenie już przetworzone', async () => {
    idempotencyService.tryMarkProcessed.mockResolvedValue(false);
    await handler.handle(buildEvent());
    expect(casesService.findById).not.toHaveBeenCalled();
  });

  it('tworzy powiadomienie System do NOWEGO opiekuna z code=case.owner_changed.employee (luka NOTIFICATIONS.md §3, patrz raport)', async () => {
    await handler.handle(buildEvent());

    expect(notificationsService.createNotificationFromTemplate).toHaveBeenCalledWith({
      companyId: 'company-1',
      code: 'case.owner_changed.employee',
      channel: NotificationChannel.System,
      recipientType: NotificationRecipientType.Employee,
      recipientUserId: 'user-2',
      relatedCaseId: 'case-1',
      variables: { caseNumber: 'RMA/2026/00001' },
    });
  });
});
