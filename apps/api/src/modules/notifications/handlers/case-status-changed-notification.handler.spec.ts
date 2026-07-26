import { CaseStatus, NotificationChannel } from '@prisma/client';
import { CasesService } from '../../cases/cases.service';
import { CustomersService } from '../../customers/customers.service';
import { IdempotencyService } from '../../../events/idempotency.service';
import { DomainEvent } from '../../../events/domain-event.base';
import { EVENT_NAMES } from '../../../events/event-names.const';
import { CaseStatusChangedPayload } from '../../../events/contracts/case.events';
import { NotificationsService } from '../notifications.service';
import { CaseStatusChangedNotificationHandler } from './case-status-changed-notification.handler';

function buildEvent(newStatus: CaseStatus): DomainEvent<CaseStatusChangedPayload> {
  return new DomainEvent({
    eventName: EVENT_NAMES.CASE_STATUS_CHANGED,
    companyId: 'company-1',
    aggregateType: 'Case',
    aggregateId: 'case-1',
    actorUserId: 'user-1',
    correlationId: 'correlation-1',
    payload: { previousStatus: CaseStatus.Weryfikacja, newStatus, complaintType: 'Warranty', automatic: false, caseHistoryId: 'history-1' } as CaseStatusChangedPayload,
  });
}

describe('CaseStatusChangedNotificationHandler', () => {
  let notificationsService: jest.Mocked<Pick<NotificationsService, 'createNotificationFromTemplate'>>;
  let casesService: jest.Mocked<Pick<CasesService, 'findById' | 'findNotes'>>;
  let customersService: jest.Mocked<Pick<CustomersService, 'findById'>>;
  let idempotencyService: jest.Mocked<Pick<IdempotencyService, 'tryMarkProcessed'>>;
  let handler: CaseStatusChangedNotificationHandler;

  beforeEach(() => {
    notificationsService = { createNotificationFromTemplate: jest.fn() };
    casesService = {
      findById: jest.fn().mockResolvedValue({ id: 'case-1', companyId: 'company-1', caseNumber: 'RMA/2026/00001', customerId: 'customer-1' }),
      findNotes: jest.fn().mockResolvedValue([]),
    };
    customersService = { findById: jest.fn().mockResolvedValue({ id: 'customer-1', email: 'jan@example.com' }) };
    idempotencyService = { tryMarkProcessed: jest.fn().mockResolvedValue(true) };

    handler = new CaseStatusChangedNotificationHandler(
      notificationsService as unknown as NotificationsService,
      casesService as unknown as CasesService,
      customersService as unknown as CustomersService,
      idempotencyService as unknown as IdempotencyService,
    );
  });

  it('nie robi NIC, gdy zdarzenie już przetworzone', async () => {
    idempotencyService.tryMarkProcessed.mockResolvedValue(false);
    await handler.handle(buildEvent(CaseStatus.GotowaDoOdbioru));
    expect(casesService.findById).not.toHaveBeenCalled();
  });

  it('nie tworzy powiadomienia dla statusu oznaczonego "Nie" w WORKFLOW.md §7 (np. Przyjeta)', async () => {
    await handler.handle(buildEvent(CaseStatus.Przyjeta));
    expect(casesService.findById).not.toHaveBeenCalled();
    expect(notificationsService.createNotificationFromTemplate).not.toHaveBeenCalled();
  });

  it('WyslanaDoProducenta → szablon generyczny case.status_changed.customer ze statusLabel', async () => {
    await handler.handle(buildEvent(CaseStatus.WyslanaDoProducenta));
    expect(notificationsService.createNotificationFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'case.status_changed.customer', variables: { caseNumber: 'RMA/2026/00001', statusLabel: 'W trakcie rozpatrywania' } }),
    );
  });

  it('GotowaDoOdbioru → szablon dedykowany case.ready_for_pickup.customer, bez statusLabel', async () => {
    await handler.handle(buildEvent(CaseStatus.GotowaDoOdbioru));
    expect(notificationsService.createNotificationFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'case.ready_for_pickup.customer', variables: { caseNumber: 'RMA/2026/00001' } }),
    );
  });

  it('Zamknieta → szablon case.closed.customer', async () => {
    await handler.handle(buildEvent(CaseStatus.Zamknieta));
    expect(notificationsService.createNotificationFromTemplate).toHaveBeenCalledWith(expect.objectContaining({ code: 'case.closed.customer' }));
  });

  it('Anulowana → szablon case.cancelled.customer z powodem wyciągniętym z najnowszej Note ("Powód anulowania: ...")', async () => {
    casesService.findNotes.mockResolvedValue([{ id: 'note-1', caseId: 'case-1', userId: 'user-1', content: 'Powód anulowania: Klient zrezygnował', createdAt: new Date() }] as never);

    await handler.handle(buildEvent(CaseStatus.Anulowana));

    expect(notificationsService.createNotificationFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'case.cancelled.customer', variables: { caseNumber: 'RMA/2026/00001', reason: 'Klient zrezygnował' } }),
    );
  });

  it('Anulowana bez żadnej Note → reason="Brak podanego powodu" (best-effort, nieudokumentowane wprost)', async () => {
    casesService.findNotes.mockResolvedValue([]);
    await handler.handle(buildEvent(CaseStatus.Anulowana));
    expect(notificationsService.createNotificationFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { caseNumber: 'RMA/2026/00001', reason: 'Brak podanego powodu' } }),
    );
  });

  it('przekazuje kanał Email i e-mail klienta jako recipientEmail', async () => {
    await handler.handle(buildEvent(CaseStatus.Zamknieta));
    const call = notificationsService.createNotificationFromTemplate.mock.calls[0][0];
    expect(call.channel).toBe(NotificationChannel.Email);
    expect(call.recipientEmail).toBe('jan@example.com');
  });
});
