import { NotificationChannel, NotificationRecipientType } from '@prisma/client';
import { CasesService } from '../../cases/cases.service';
import { CustomersService } from '../../customers/customers.service';
import { IdempotencyService } from '../../../events/idempotency.service';
import { DomainEvent } from '../../../events/domain-event.base';
import { EVENT_NAMES } from '../../../events/event-names.const';
import { CaseCreatedPayload } from '../../../events/contracts/case.events';
import { ProductsService } from '../../products/products.service';
import { NotificationsService } from '../notifications.service';
import { CaseCreatedNotificationHandler } from './case-created-notification.handler';

function buildEvent(overrides: Partial<CaseCreatedPayload> = {}): DomainEvent<CaseCreatedPayload> {
  return new DomainEvent({
    eventName: EVENT_NAMES.CASE_CREATED,
    companyId: 'company-1',
    aggregateType: 'Case',
    aggregateId: 'case-1',
    actorUserId: 'user-1',
    correlationId: 'correlation-1',
    payload: { caseNumber: 'RMA/2026/00001', complaintType: 'Warranty', submissionMode: 'PrzezSklep', source: 'SklepStacjonarny', customerId: 'customer-1', ownerId: null, itemCount: 1, caseHistoryId: 'history-1', ...overrides } as CaseCreatedPayload,
  });
}

describe('CaseCreatedNotificationHandler', () => {
  let notificationsService: jest.Mocked<Pick<NotificationsService, 'createNotificationFromTemplate'>>;
  let casesService: jest.Mocked<Pick<CasesService, 'findById'>>;
  let customersService: jest.Mocked<Pick<CustomersService, 'findById'>>;
  let productsService: jest.Mocked<Pick<ProductsService, 'findById'>>;
  let idempotencyService: jest.Mocked<Pick<IdempotencyService, 'tryMarkProcessed'>>;
  let handler: CaseCreatedNotificationHandler;

  beforeEach(() => {
    notificationsService = { createNotificationFromTemplate: jest.fn() };
    casesService = { findById: jest.fn() };
    customersService = { findById: jest.fn().mockResolvedValue({ id: 'customer-1', firstName: 'Jan', lastName: 'Kowalski', email: 'jan@example.com' }) };
    productsService = { findById: jest.fn().mockResolvedValue({ id: 'product-1', name: 'Rower X' }) };
    idempotencyService = { tryMarkProcessed: jest.fn().mockResolvedValue(true) };

    handler = new CaseCreatedNotificationHandler(
      notificationsService as unknown as NotificationsService,
      casesService as unknown as CasesService,
      customersService as unknown as CustomersService,
      productsService as unknown as ProductsService,
      idempotencyService as unknown as IdempotencyService,
    );
  });

  it('nie robi NIC, gdy zdarzenie już przetworzone (idempotencja po eventId)', async () => {
    idempotencyService.tryMarkProcessed.mockResolvedValue(false);
    await handler.handle(buildEvent());
    expect(casesService.findById).not.toHaveBeenCalled();
    expect(notificationsService.createNotificationFromTemplate).not.toHaveBeenCalled();
  });

  it('nie tworzy powiadomienia, gdy clientPortalEnabled=false (NOTIFICATIONS.md §3)', async () => {
    casesService.findById.mockResolvedValue({ id: 'case-1', companyId: 'company-1', clientPortalEnabled: false, items: [] } as never);
    await handler.handle(buildEvent());
    expect(notificationsService.createNotificationFromTemplate).not.toHaveBeenCalled();
  });

  it('tworzy powiadomienie case.created.customer z poprawnymi zmiennymi, gdy clientPortalEnabled=true', async () => {
    casesService.findById.mockResolvedValue({
      id: 'case-1',
      companyId: 'company-1',
      caseNumber: 'RMA/2026/00001',
      clientPortalEnabled: true,
      items: [{ id: 'item-1', productId: 'product-1' }],
    } as never);

    await handler.handle(buildEvent());

    expect(notificationsService.createNotificationFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        code: 'case.created.customer',
        channel: NotificationChannel.Email,
        recipientType: NotificationRecipientType.Customer,
        recipientEmail: 'jan@example.com',
        relatedCaseId: 'case-1',
        variables: { caseNumber: 'RMA/2026/00001', customerName: 'Jan Kowalski', productModel: 'Rower X' },
      }),
    );
  });
});
