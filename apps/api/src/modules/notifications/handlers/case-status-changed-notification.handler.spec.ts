import { NotificationChannel } from '@prisma/client';
import { CaseStatusesService } from '../../case-statuses/case-statuses.service';
import { CasesService } from '../../cases/cases.service';
import { CustomersService } from '../../customers/customers.service';
import { IdempotencyService } from '../../../events/idempotency.service';
import { DomainEvent } from '../../../events/domain-event.base';
import { EVENT_NAMES } from '../../../events/event-names.const';
import { CaseStatusChangedPayload } from '../../../events/contracts/case.events';
import { NotificationsService } from '../notifications.service';
import { CaseStatusChangedNotificationHandler } from './case-status-changed-notification.handler';

/** Katalog minimalny — tylko pola, których dotyka handler. */
const STATUS_ROWS: Record<string, { label: string; notifyCustomerTemplateCode: string | null }> = {
  Przyjeta: { label: 'Przyjęta', notifyCustomerTemplateCode: null },
  PrzekazanaDoProducenta: {
    label: 'Przekazana do producenta / dystrybutora',
    notifyCustomerTemplateCode: 'case.sent_to_manufacturer.customer',
  },
  DecyzjaPozytywna: {
    label: 'Decyzja pozytywna – oczekujemy na realizację',
    notifyCustomerTemplateCode: 'case.status_changed.customer',
  },
  TowarWrocilZSerwisu: {
    label: 'Towar wrócił z serwisu – oczekuje na odbiór',
    notifyCustomerTemplateCode: 'case.ready_for_pickup.customer',
  },
  Zakonczona: { label: 'Zakończona', notifyCustomerTemplateCode: 'case.closed.customer' },
};

function buildEvent(
  newStatus: string,
  overrides: Partial<CaseStatusChangedPayload> = {},
): DomainEvent<CaseStatusChangedPayload> {
  return new DomainEvent({
    eventName: EVENT_NAMES.CASE_STATUS_CHANGED,
    companyId: 'company-1',
    aggregateType: 'Case',
    aggregateId: 'case-1',
    actorUserId: 'user-1',
    correlationId: 'correlation-1',
    payload: {
      previousStatus: 'Przyjeta',
      newStatus,
      complaintType: 'Warranty',
      caseHistoryId: 'history-1',
      notifyCustomer: true,
      ...overrides,
    } as CaseStatusChangedPayload,
  });
}

describe('CaseStatusChangedNotificationHandler', () => {
  let notificationsService: jest.Mocked<
    Pick<NotificationsService, 'createNotificationFromTemplate'>
  >;
  let casesService: jest.Mocked<
    Pick<CasesService, 'findById' | 'findNotes' | 'appendSystemMessage'>
  >;
  let customersService: jest.Mocked<Pick<CustomersService, 'findById'>>;
  let caseStatusesService: jest.Mocked<Pick<CaseStatusesService, 'findByCode'>>;
  let idempotencyService: jest.Mocked<Pick<IdempotencyService, 'tryMarkProcessed'>>;
  let handler: CaseStatusChangedNotificationHandler;

  beforeEach(() => {
    notificationsService = {
      createNotificationFromTemplate: jest
        .fn()
        .mockResolvedValue({ id: 'notification-1', body: 'Treść wiadomości', subject: 'Temat' }),
    };
    casesService = {
      findById: jest
        .fn()
        .mockResolvedValue({
          id: 'case-1',
          companyId: 'company-1',
          caseNumber: 'RMA/2026/00001',
          customerId: 'customer-1',
        }),
      findNotes: jest.fn().mockResolvedValue([]),
      appendSystemMessage: jest.fn().mockResolvedValue(undefined),
    };
    customersService = {
      findById: jest.fn().mockResolvedValue({ id: 'customer-1', email: 'jan@example.com' }),
    };
    caseStatusesService = {
      findByCode: jest
        .fn()
        .mockImplementation((code: string) => Promise.resolve(STATUS_ROWS[code] ?? null)),
    };
    idempotencyService = { tryMarkProcessed: jest.fn().mockResolvedValue(true) };

    handler = new CaseStatusChangedNotificationHandler(
      notificationsService as unknown as NotificationsService,
      casesService as unknown as CasesService,
      customersService as unknown as CustomersService,
      caseStatusesService as unknown as CaseStatusesService,
      idempotencyService as unknown as IdempotencyService,
    );
  });

  it('nie robi NIC, gdy zdarzenie już przetworzone', async () => {
    idempotencyService.tryMarkProcessed.mockResolvedValue(false);
    await handler.handle(buildEvent('TowarWrocilZSerwisu'));
    expect(casesService.findById).not.toHaveBeenCalled();
  });

  it('nie tworzy powiadomienia dla statusu bez notifyCustomerTemplateCode (np. Przyjęta)', async () => {
    await handler.handle(buildEvent('Przyjeta'));
    expect(casesService.findById).not.toHaveBeenCalled();
    expect(notificationsService.createNotificationFromTemplate).not.toHaveBeenCalled();
  });

  it('nie tworzy powiadomienia, gdy pracownik świadomie zrezygnował (notifyCustomer=false), mimo że status ma szablon', async () => {
    await handler.handle(buildEvent('TowarWrocilZSerwisu', { notifyCustomer: false }));
    expect(casesService.findById).not.toHaveBeenCalled();
    expect(notificationsService.createNotificationFromTemplate).not.toHaveBeenCalled();
  });

  it('status nieznany/usunięty z katalogu (findByCode zwraca null) → brak powiadomienia (bezpieczny domyślny brak e-maila)', async () => {
    await handler.handle(buildEvent('NieznanyStatus'));
    expect(notificationsService.createNotificationFromTemplate).not.toHaveBeenCalled();
  });

  it('PrzekazanaDoProducenta → szablon dedykowany case.sent_to_manufacturer.customer, bez statusLabel', async () => {
    await handler.handle(buildEvent('PrzekazanaDoProducenta'));
    expect(notificationsService.createNotificationFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'case.sent_to_manufacturer.customer',
        variables: { caseNumber: 'RMA/2026/00001' },
      }),
    );
  });

  it('DecyzjaPozytywna → szablon generyczny case.status_changed.customer z etykietą statusu wziętą z katalogu', async () => {
    await handler.handle(buildEvent('DecyzjaPozytywna'));
    expect(notificationsService.createNotificationFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'case.status_changed.customer',
        variables: {
          caseNumber: 'RMA/2026/00001',
          statusLabel: 'Decyzja pozytywna – oczekujemy na realizację',
        },
      }),
    );
  });

  it('TowarWrocilZSerwisu → szablon dedykowany case.ready_for_pickup.customer, bez statusLabel', async () => {
    await handler.handle(buildEvent('TowarWrocilZSerwisu'));
    expect(notificationsService.createNotificationFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'case.ready_for_pickup.customer',
        variables: { caseNumber: 'RMA/2026/00001' },
      }),
    );
  });

  it('Zakończona (zwykłe zamknięcie) → szablon case.closed.customer', async () => {
    await handler.handle(buildEvent('Zakonczona'));
    expect(notificationsService.createNotificationFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'case.closed.customer' }),
    );
  });

  it('Zakończona (zwykłe zamknięcie) → treść e-maila trafia też jako wiadomość systemowa w Portalu Klienta', async () => {
    await handler.handle(buildEvent('Zakonczona'));
    expect(casesService.appendSystemMessage).toHaveBeenCalledWith(
      'case-1',
      'company-1',
      'Treść wiadomości',
    );
  });

  it('anulowanie (case.cancelled.customer) → BEZ wiadomości systemowej w Portalu (tylko zamknięcie i gotowość do odbioru)', async () => {
    casesService.findNotes.mockResolvedValue([]);
    await handler.handle(buildEvent('Zakonczona', { cancelled: true }));
    expect(casesService.appendSystemMessage).not.toHaveBeenCalled();
  });

  it('TowarWrocilZSerwisu (gotowe do odbioru) → treść e-maila trafia też jako wiadomość systemowa w Portalu Klienta', async () => {
    await handler.handle(buildEvent('TowarWrocilZSerwisu'));
    expect(casesService.appendSystemMessage).toHaveBeenCalledWith(
      'case-1',
      'company-1',
      'Treść wiadomości',
    );
  });

  it('statusy inne niż zamknięcie (np. PrzekazanaDoProducenta) → BEZ wiadomości systemowej w Portalu', async () => {
    await handler.handle(buildEvent('PrzekazanaDoProducenta'));
    expect(casesService.appendSystemMessage).not.toHaveBeenCalled();
  });

  it('Zakończona + cancelled=true (anulowanie) → szablon case.cancelled.customer z powodem wyciągniętym z najnowszej Note ("Powód anulowania: ...")', async () => {
    casesService.findNotes.mockResolvedValue([
      {
        id: 'note-1',
        caseId: 'case-1',
        userId: 'user-1',
        content: 'Powód anulowania: Klient zrezygnował',
        createdAt: new Date(),
      },
    ] as never);

    await handler.handle(buildEvent('Zakonczona', { cancelled: true }));

    expect(notificationsService.createNotificationFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'case.cancelled.customer',
        variables: { caseNumber: 'RMA/2026/00001', reason: 'Klient zrezygnował' },
      }),
    );
  });

  it('anulowanie bez żadnej Note → reason="Brak podanego powodu" (best-effort, nieudokumentowane wprost)', async () => {
    casesService.findNotes.mockResolvedValue([]);
    await handler.handle(buildEvent('Zakonczona', { cancelled: true }));
    expect(notificationsService.createNotificationFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { caseNumber: 'RMA/2026/00001', reason: 'Brak podanego powodu' },
      }),
    );
  });

  it('przekazuje kanał Email i e-mail klienta jako recipientEmail', async () => {
    await handler.handle(buildEvent('Zakonczona'));
    const call = notificationsService.createNotificationFromTemplate.mock.calls[0][0];
    expect(call.channel).toBe(NotificationChannel.Email);
    expect(call.recipientEmail).toBe('jan@example.com');
  });
});
