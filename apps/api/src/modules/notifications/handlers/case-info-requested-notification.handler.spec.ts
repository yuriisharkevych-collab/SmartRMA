import { NotificationChannel, NotificationRecipientType } from '@prisma/client';
import { CaseInfoRequestedPayload } from '../../../events/contracts/case.events';
import { DomainEvent } from '../../../events/domain-event.base';
import { EVENT_NAMES } from '../../../events/event-names.const';
import { IdempotencyService } from '../../../events/idempotency.service';
import { CasesService } from '../../cases/cases.service';
import { CustomersService } from '../../customers/customers.service';
import { NotificationsService } from '../notifications.service';
import { CaseInfoRequestedNotificationHandler } from './case-info-requested-notification.handler';

function buildEvent(): DomainEvent<CaseInfoRequestedPayload> {
  return new DomainEvent({
    eventName: EVENT_NAMES.CASE_INFO_REQUESTED,
    companyId: 'company-1',
    aggregateType: 'Case',
    aggregateId: 'case-1',
    actorUserId: 'user-1',
    correlationId: 'correlation-1',
    payload: {
      requestedItems: ['Dowód zakupu', 'Zdjęcie uszkodzenia'],
      messageText: 'Prosimy o dosłanie brakujących dokumentów.',
      caseHistoryId: 'history-1',
    },
  });
}

describe('CaseInfoRequestedNotificationHandler', () => {
  let notificationsService: jest.Mocked<
    Pick<NotificationsService, 'createNotificationFromTemplate'>
  >;
  let casesService: jest.Mocked<Pick<CasesService, 'findById'>>;
  let customersService: jest.Mocked<Pick<CustomersService, 'findById'>>;
  let idempotencyService: jest.Mocked<Pick<IdempotencyService, 'tryMarkProcessed'>>;
  let handler: CaseInfoRequestedNotificationHandler;

  beforeEach(() => {
    notificationsService = { createNotificationFromTemplate: jest.fn() };
    casesService = {
      findById: jest
        .fn()
        .mockResolvedValue({
          id: 'case-1',
          companyId: 'company-1',
          caseNumber: 'RMA/2026/00001',
          customerId: 'customer-1',
        }),
    };
    customersService = {
      findById: jest.fn().mockResolvedValue({ id: 'customer-1', email: 'klient@przyklad.pl' }),
    };
    idempotencyService = { tryMarkProcessed: jest.fn().mockResolvedValue(true) };

    handler = new CaseInfoRequestedNotificationHandler(
      notificationsService as unknown as NotificationsService,
      casesService as unknown as CasesService,
      customersService as unknown as CustomersService,
      idempotencyService as unknown as IdempotencyService,
    );
  });

  it('nie robi NIC, gdy zdarzenie już przetworzone (idempotencja)', async () => {
    idempotencyService.tryMarkProcessed.mockResolvedValue(false);
    await handler.handle(buildEvent());
    expect(casesService.findById).not.toHaveBeenCalled();
  });

  it('tworzy powiadomienie Email do klienta z code=case.info_requested.customer, łącząc requestedItems w jeden string', async () => {
    await handler.handle(buildEvent());

    expect(notificationsService.createNotificationFromTemplate).toHaveBeenCalledWith({
      companyId: 'company-1',
      code: 'case.info_requested.customer',
      channel: NotificationChannel.Email,
      recipientType: NotificationRecipientType.Customer,
      recipientEmail: 'klient@przyklad.pl',
      relatedCaseId: 'case-1',
      variables: {
        caseNumber: 'RMA/2026/00001',
        requestedItems: 'Dowód zakupu, Zdjęcie uszkodzenia',
        messageText: 'Prosimy o dosłanie brakujących dokumentów.',
      },
    });
  });

  it('nie wysyła e-maila (recipientEmail=undefined), gdy klient nie ma adresu e-mail', async () => {
    customersService.findById.mockResolvedValue({ id: 'customer-1', email: null } as never);
    await handler.handle(buildEvent());
    expect(notificationsService.createNotificationFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: undefined }),
    );
  });
});
