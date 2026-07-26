import {
  CaseHistoryAction,
  CasePriority,
  CaseStatus,
  ComplaintSource,
  ComplaintType,
  Decision,
  MessageChannel,
  MessageDirection,
  SenderType,
  SubmissionMode,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditRepository } from '../audit/audit.repository';
import { CompaniesService } from '../companies/companies.service';
import { CustomersService } from '../customers/customers.service';
import { IEventBus } from '../../events/event-bus.interface';
import { EVENT_NAMES } from '../../events/event-names.const';
import { OrdersService } from '../orders/orders.service';
import { ProductsService } from '../products/products.service';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { UsersService } from '../users/users.service';
import { CaseHistoryRepository } from './case-history.repository';
import { CasesRepository } from './cases.repository';
import { CasesService } from './cases.service';
import { CaseWithItems } from './mappers/case.mapper';
import { MessagesRepository } from './messages.repository';
import { NotesRepository } from './notes.repository';

/** Marker unikalny per test — pozwala sprawdzić, że repozytoria dostają DOKŁADNIE ten `tx`, którym `$transaction` wywołał callback (nie `this.prisma`). */
const TX_MARKER = { __tx: true } as const;

function buildCase(overrides: Partial<CaseWithItems> = {}): CaseWithItems {
  return {
    id: 'case-1',
    companyId: 'company-1',
    shopId: null,
    caseNumber: 'RMA/2026/00001',
    customerId: 'customer-1',
    ownerId: null,
    complaintType: ComplaintType.Warranty,
    submissionMode: SubmissionMode.PrzezSklep,
    source: ComplaintSource.SklepStacjonarny,
    requestedResolution: 'Naprawa',
    description: 'Opis usterki',
    customerStatement: null,
    status: CaseStatus.Nowa,
    priority: CasePriority.Normalny,
    decision: null,
    decisionAt: null,
    decisionByUserId: null,
    nextAction: null,
    nextActionDueDate: null,
    requiresManagerApproval: false,
    isException: false,
    deliveryAddress: null,
    courierRequested: false,
    preparationFeeAccepted: false,
    clientPortalEnabled: false,
    clientAccessCodeHash: null,
    clientAccessTokenHash: null,
    clientAccessTokenUsed: false,
    clientLastLoginAt: null,
    createdAt: new Date('2026-01-01'),
    closedAt: null,
    cancelledAt: null,
    archivedAt: null,
    items: [{ id: 'item-1', caseId: 'case-1', orderItemId: null, productId: 'product-1', manufacturerId: null, description: 'Rysa', quantity: 1 }],
    ...overrides,
  } as unknown as CaseWithItems;
}

describe('CasesService', () => {
  let prisma: jest.Mocked<Pick<PrismaService, '$transaction'>>;
  let casesRepository: jest.Mocked<
    Pick<CasesRepository, 'findAllForCompany' | 'search' | 'findById' | 'findByIdForUpdate' | 'countCreatedInYear' | 'create' | 'update' | 'updateStatus' | 'setDecision' | 'assignOwner'>
  >;
  let caseHistoryRepository: jest.Mocked<Pick<CaseHistoryRepository, 'addEntry' | 'findByCaseId' | 'findLastStatusBeforeWaiting'>>;
  let notesRepository: jest.Mocked<Pick<NotesRepository, 'create' | 'findByCaseId'>>;
  let messagesRepository: jest.Mocked<Pick<MessagesRepository, 'create' | 'findByCaseId'>>;
  let auditRepository: jest.Mocked<Pick<AuditRepository, 'create'>>;
  let customersService: jest.Mocked<Pick<CustomersService, 'findById'>>;
  let companiesService: jest.Mocked<Pick<CompaniesService, 'findShopById'>>;
  let productsService: jest.Mocked<Pick<ProductsService, 'findById'>>;
  let ordersService: jest.Mocked<Pick<OrdersService, 'findOrderItemById'>>;
  let usersService: jest.Mocked<Pick<UsersService, 'findById'>>;
  let eventBus: jest.Mocked<IEventBus>;
  let service: CasesService;

  beforeEach(() => {
    prisma = { $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(TX_MARKER)) };
    casesRepository = {
      findAllForCompany: jest.fn(),
      search: jest.fn(),
      findById: jest.fn(),
      findByIdForUpdate: jest.fn(),
      countCreatedInYear: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      setDecision: jest.fn(),
      assignOwner: jest.fn(),
    };
    caseHistoryRepository = {
      addEntry: jest.fn().mockResolvedValue({ id: 'history-1' }),
      findByCaseId: jest.fn(),
      findLastStatusBeforeWaiting: jest.fn().mockResolvedValue(null),
    };
    notesRepository = { create: jest.fn().mockResolvedValue({ id: 'note-1' }), findByCaseId: jest.fn() };
    messagesRepository = { create: jest.fn(), findByCaseId: jest.fn() };
    auditRepository = { create: jest.fn() };
    customersService = { findById: jest.fn().mockResolvedValue({ id: 'customer-1' }) };
    companiesService = { findShopById: jest.fn().mockResolvedValue({ id: 'shop-1' }) };
    productsService = { findById: jest.fn().mockResolvedValue({ id: 'product-1' }) };
    ordersService = { findOrderItemById: jest.fn().mockResolvedValue({ id: 'order-item-1' }) };
    usersService = { findById: jest.fn().mockResolvedValue({ id: 'user-2' }) };
    eventBus = { publish: jest.fn(), publishAll: jest.fn() };

    service = new CasesService(
      prisma as unknown as PrismaService,
      casesRepository as unknown as CasesRepository,
      caseHistoryRepository as unknown as CaseHistoryRepository,
      notesRepository as unknown as NotesRepository,
      messagesRepository as unknown as MessagesRepository,
      auditRepository as unknown as AuditRepository,
      customersService as unknown as CustomersService,
      companiesService as unknown as CompaniesService,
      productsService as unknown as ProductsService,
      ordersService as unknown as OrdersService,
      usersService as unknown as UsersService,
      eventBus,
    );
  });

  const createDto = {
    customerId: 'customer-1',
    complaintType: ComplaintType.Warranty,
    requestedResolution: 'Naprawa',
    description: 'Opis usterki',
    items: [{ productId: 'product-1', description: 'Rysa' }],
  };

  describe('findById', () => {
    it('rzuca CASE-012, gdy sprawa nie istnieje (odczyt zwykły, bez blokady)', async () => {
      casesRepository.findById.mockResolvedValue(null);
      await expect(service.findById('brak')).rejects.toMatchObject({ code: 'CASE-012' });
      expect(casesRepository.findByIdForUpdate).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('rzuca CASE-007, gdy BezposrednioDoProducenta łączy się ze StatutoryWarranty (BR-097)', async () => {
      await expect(
        service.create('company-1', { ...createDto, complaintType: ComplaintType.StatutoryWarranty, submissionMode: SubmissionMode.BezposrednioDoProducenta }, 'user-1'),
      ).rejects.toMatchObject({ code: 'CASE-007' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rzuca VALIDATION-001, gdy brak description poza ścieżką monitorowaną (BR-105)', async () => {
      await expect(service.create('company-1', { ...createDto, description: '' }, 'user-1')).rejects.toMatchObject({ code: 'VALIDATION-001' });
    });

    it('weryfikuje ownerId, gdy podane — 404, gdy użytkownik nie istnieje', async () => {
      usersService.findById.mockRejectedValue(new Error('not found'));
      await expect(service.create('company-1', { ...createDto, ownerId: 'brak' }, 'user-1')).rejects.toThrow();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('weryfikuje istnienie customerId/product/orderItem PRZED transakcją — 404, gdy klient nie istnieje', async () => {
      customersService.findById.mockRejectedValue(new Error('not found'));
      await expect(service.create('company-1', createDto, 'user-1')).rejects.toThrow();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('tworzy sprawę WEWNĄTRZ jednej transakcji (Case+CaseHistory+AuditLog), potem publikuje case.created', async () => {
      const caseRecord = buildCase();
      casesRepository.create.mockResolvedValue(caseRecord);

      const result = await service.create('company-1', createDto, 'user-1');

      expect(result.id).toBe('case-1');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(casesRepository.create).toHaveBeenCalledWith('company-1', expect.any(String), expect.any(Object), TX_MARKER);
      expect(caseHistoryRepository.addEntry).toHaveBeenCalledWith('case-1', expect.objectContaining({ action: CaseHistoryAction.CaseCreated }), TX_MARKER);
      expect(auditRepository.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'CASE_CREATED' }), TX_MARKER);
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.CASE_CREATED);
    });

    it('CASE-013 — rzuca po wyczerpaniu retry na kolizję numeru sprawy (P2002), każda próba to osobna transakcja', async () => {
      const conflict = Object.assign(new Error('unique'), { code: 'P2002' });
      casesRepository.create.mockRejectedValue(conflict);
      await expect(service.create('company-1', createDto, 'user-1')).rejects.toMatchObject({ code: 'CASE-013' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    });
  });

  describe('update', () => {
    it('CASE-008 — rzuca, gdy sprawa jest w statusie końcowym (odczytana pod blokadą)', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: CaseStatus.Zamknieta }));
      await expect(service.update('case-1', { priority: CasePriority.Wysoki }, 'user-1')).rejects.toMatchObject({ code: 'CASE-008' });
    });

    it('zapisuje CaseHistory(PriorityChanged) wewnątrz tej samej transakcji, gdy priority się zmienia', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ priority: CasePriority.Normalny }));
      casesRepository.update.mockResolvedValue(buildCase({ priority: CasePriority.Wysoki }));

      await service.update('case-1', { priority: CasePriority.Wysoki }, 'user-1');

      expect(casesRepository.update).toHaveBeenCalledWith('case-1', { priority: CasePriority.Wysoki }, TX_MARKER);
      expect(caseHistoryRepository.addEntry).toHaveBeenCalledWith('case-1', expect.objectContaining({ action: CaseHistoryAction.PriorityChanged }), TX_MARKER);
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.CASE_UPDATED);
    });

    it('NIE zapisuje audytu/zdarzenia, gdy nic się nie zmieniło', async () => {
      const before = buildCase();
      casesRepository.findByIdForUpdate.mockResolvedValue(before);
      casesRepository.update.mockResolvedValue(before);

      await service.update('case-1', { description: before.description }, 'user-1');

      expect(auditRepository.create).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });
  });

  describe('changeStatus', () => {
    it('CASE-001 — rzuca dla przejścia nieosiągalnego z bieżącego statusu (odczyt pod blokadą)', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: CaseStatus.Nowa }));
      await expect(service.changeStatus('case-1', CaseStatus.Zamknieta, 'user-1', [PERMISSIONS.CASES_STATUS_CHANGE])).rejects.toMatchObject({ code: 'CASE-001' });
    });

    it('RBAC-001 — rzuca, gdy brak DOKŁADNEGO uprawnienia wymaganego dla TEGO przejścia', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: CaseStatus.Nowa }));
      await expect(service.changeStatus('case-1', CaseStatus.Przyjeta, 'user-1', [PERMISSIONS.CASES_CANCEL])).rejects.toMatchObject({ code: 'RBAC-001' });
    });

    it('CASE-009 — rzuca przy próbie przejścia w RealizacjaDecyzji bez ustawionej decyzji', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: CaseStatus.OczekiwanieNaDecyzjeProducenta, decision: null }));
      await expect(
        service.changeStatus('case-1', CaseStatus.RealizacjaDecyzji, 'user-1', [PERMISSIONS.CASES_DECISION_SET]),
      ).rejects.toMatchObject({ code: 'CASE-009' });
    });

    it('legalne przejście: cały zapis (status+CaseHistory+AuditLog) dzieje się w JEDNEJ transakcji pod blokadą wiersza', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: CaseStatus.Nowa }));
      casesRepository.updateStatus.mockResolvedValue(buildCase({ status: CaseStatus.Przyjeta }));

      await service.changeStatus('case-1', CaseStatus.Przyjeta, 'user-1', [PERMISSIONS.CASES_STATUS_CHANGE]);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(casesRepository.findByIdForUpdate).toHaveBeenCalledWith('case-1', TX_MARKER);
      expect(casesRepository.updateStatus).toHaveBeenCalledWith('case-1', CaseStatus.Przyjeta, expect.any(Object), TX_MARKER);
      expect(caseHistoryRepository.addEntry).toHaveBeenCalledWith(
        'case-1',
        expect.objectContaining({ action: CaseHistoryAction.StatusChanged, previousValue: CaseStatus.Nowa, newValue: CaseStatus.Przyjeta }),
        TX_MARKER,
      );
      expect(auditRepository.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'CASE_STATUS_CHANGED' }), TX_MARKER);
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.CASE_STATUS_CHANGED);
    });

    it('przejście do Zamknieta zapisuje CaseHistoryAction.CaseClosed (nie generyczny StatusChanged) i ustawia closedAt', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: CaseStatus.GotowaDoOdbioru }));
      casesRepository.updateStatus.mockResolvedValue(buildCase({ status: CaseStatus.Zamknieta }));

      await service.changeStatus('case-1', CaseStatus.Zamknieta, 'user-1', [PERMISSIONS.CASES_STATUS_CHANGE]);

      expect(caseHistoryRepository.addEntry).toHaveBeenCalledWith('case-1', expect.objectContaining({ action: CaseHistoryAction.CaseClosed }), TX_MARKER);
      expect(casesRepository.updateStatus).toHaveBeenCalledWith('case-1', CaseStatus.Zamknieta, expect.objectContaining({ closedAt: expect.any(Date) }), TX_MARKER);
    });
  });

  describe('cancel', () => {
    it('CASE-011 — rzuca bez powodu', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: CaseStatus.Nowa }));
      await expect(service.cancel('case-1', '', 'user-1', [PERMISSIONS.CASES_CANCEL])).rejects.toMatchObject({ code: 'CASE-011' });
    });

    it('z powodem: zapisuje Note z powodem ORAZ CaseHistory(CaseCancelled), wewnątrz tej samej transakcji', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: CaseStatus.Nowa }));
      casesRepository.updateStatus.mockResolvedValue(buildCase({ status: CaseStatus.Anulowana }));

      await service.cancel('case-1', 'Klient zrezygnował', 'user-1', [PERMISSIONS.CASES_CANCEL]);

      expect(notesRepository.create).toHaveBeenCalledWith('case-1', 'user-1', expect.stringContaining('Klient zrezygnował'), TX_MARKER);
      expect(caseHistoryRepository.addEntry).toHaveBeenCalledWith('case-1', expect.objectContaining({ action: CaseHistoryAction.CaseCancelled }), TX_MARKER);
    });

    it('IDEMPOTENTNE — jeśli sprawa jest już Anulowana, zwraca ją bez zmian: brak CASE-001, brak audytu, brak zdarzenia', async () => {
      const alreadyCancelled = buildCase({ status: CaseStatus.Anulowana });
      casesRepository.findByIdForUpdate.mockResolvedValue(alreadyCancelled);

      const result = await service.cancel('case-1', 'powtórne żądanie', 'user-1', [PERMISSIONS.CASES_CANCEL]);

      expect(result.status).toBe(CaseStatus.Anulowana);
      expect(casesRepository.updateStatus).not.toHaveBeenCalled();
      expect(auditRepository.create).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });
  });

  describe('archive', () => {
    it('IDEMPOTENTNE — jeśli sprawa jest już Zarchiwizowana, zwraca ją bez zmian', async () => {
      const alreadyArchived = buildCase({ status: CaseStatus.Zarchiwizowana });
      casesRepository.findByIdForUpdate.mockResolvedValue(alreadyArchived);

      const result = await service.archive('case-1', 'user-1', [PERMISSIONS.CASES_ARCHIVE]);

      expect(result.status).toBe(CaseStatus.Zarchiwizowana);
      expect(casesRepository.updateStatus).not.toHaveBeenCalled();
      expect(auditRepository.create).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('z Zamknieta: legalne, zapisuje CaseArchived i publikuje case.status_changed', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: CaseStatus.Zamknieta }));
      casesRepository.updateStatus.mockResolvedValue(buildCase({ status: CaseStatus.Zarchiwizowana }));

      const result = await service.archive('case-1', 'user-1', [PERMISSIONS.CASES_ARCHIVE]);

      expect(result.status).toBe(CaseStatus.Zarchiwizowana);
      expect(caseHistoryRepository.addEntry).toHaveBeenCalledWith('case-1', expect.objectContaining({ action: CaseHistoryAction.CaseArchived }), TX_MARKER);
    });
  });

  describe('setDecision', () => {
    it('CASE-010 — rzuca przy próbie ustawienia ZwrotSrodkow bez cases.decision.approve', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: CaseStatus.OczekiwanieNaDecyzjeProducenta }));
      await expect(
        service.setDecision('case-1', Decision.ZwrotSrodkow, 'user-1', [PERMISSIONS.CASES_DECISION_SET]),
      ).rejects.toMatchObject({ code: 'CASE-010' });
    });

    it('CASE-010 — rzuca dla ścieżki rękojmi (OczekiwanieNaDecyzjeKierownika) bez approve', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: CaseStatus.OczekiwanieNaDecyzjeKierownika, complaintType: ComplaintType.StatutoryWarranty }));
      await expect(
        service.setDecision('case-1', Decision.Naprawa, 'user-1', [PERMISSIONS.CASES_DECISION_SET]),
      ).rejects.toMatchObject({ code: 'CASE-010' });
    });

    it('ustawia decision pod blokadą wiersza, requiresManagerApproval=true dla ZwrotSrodkow, publikuje case.decision_set', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: CaseStatus.OczekiwanieNaDecyzjeProducenta }));
      casesRepository.setDecision.mockResolvedValue(buildCase({ status: CaseStatus.OczekiwanieNaDecyzjeProducenta, decision: Decision.ZwrotSrodkow }));

      await service.setDecision('case-1', Decision.ZwrotSrodkow, 'user-1', [PERMISSIONS.CASES_DECISION_APPROVE]);

      expect(casesRepository.findByIdForUpdate).toHaveBeenCalledWith('case-1', TX_MARKER);
      expect(casesRepository.setDecision).toHaveBeenCalledWith('case-1', Decision.ZwrotSrodkow, 'user-1', true, TX_MARKER);
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.CASE_DECISION_SET);
      expect(published.payload).toMatchObject({ decision: Decision.ZwrotSrodkow, requiresManagerApproval: true });
    });
  });

  describe('assignOwner', () => {
    it('weryfikuje istnienie ownerId PRZED transakcją — propaguje błąd, gdy użytkownik nie istnieje', async () => {
      usersService.findById.mockRejectedValue(new Error('not found'));
      await expect(service.assignOwner('case-1', 'brak', 'user-1')).rejects.toThrow();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('CASE-008 — rzuca dla sprawy w statusie końcowym', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: CaseStatus.Anulowana }));
      await expect(service.assignOwner('case-1', 'user-2', 'user-1')).rejects.toMatchObject({ code: 'CASE-008' });
    });

    it('zapisuje CaseHistory(OwnerChanged, visibleForCustomer=false — BR-104) i publikuje case.owner_changed', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ ownerId: null }));
      casesRepository.assignOwner.mockResolvedValue(buildCase({ ownerId: 'user-2' }));

      await service.assignOwner('case-1', 'user-2', 'user-1');

      expect(usersService.findById).toHaveBeenCalledWith('user-2');
      expect(caseHistoryRepository.addEntry).toHaveBeenCalledWith(
        'case-1',
        expect.objectContaining({ action: CaseHistoryAction.OwnerChanged, visibleForCustomer: false }),
        TX_MARKER,
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.CASE_OWNER_CHANGED);
      expect(published.payload).toMatchObject({ previousOwnerId: null, newOwnerId: 'user-2' });
    });
  });

  describe('addNote', () => {
    it('CASE-008 — rzuca dla sprawy w statusie końcowym', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: CaseStatus.Zarchiwizowana }));
      await expect(service.addNote('case-1', 'user-1', 'Tresc')).rejects.toMatchObject({ code: 'CASE-008' });
    });

    it('zapisuje Note, CaseHistory(NoteAdded) i publikuje case.note_added', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase());
      await service.addNote('case-1', 'user-1', 'Tresc notatki');

      expect(notesRepository.create).toHaveBeenCalledWith('case-1', 'user-1', 'Tresc notatki', TX_MARKER);
      expect(caseHistoryRepository.addEntry).toHaveBeenCalledWith('case-1', expect.objectContaining({ action: CaseHistoryAction.NoteAdded, visibleForCustomer: false }), TX_MARKER);
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.CASE_NOTE_ADDED);
      expect(published.payload).toMatchObject({ noteId: 'note-1' });
    });
  });

  describe('sendMessage', () => {
    it('CASE-008 — rzuca dla sprawy w statusie końcowym', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: CaseStatus.Zamknieta }));
      await expect(service.sendMessage('case-1', 'user-1', { channel: MessageChannel.Email, content: 'Tresc' })).rejects.toMatchObject({ code: 'CASE-008' });
    });

    it('wymusza senderType=Employee/direction=Outbound i publikuje case.message_added', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase());
      messagesRepository.create.mockResolvedValue({
        id: 'message-1',
        caseId: 'case-1',
        senderType: SenderType.Employee,
        senderUserId: 'user-1',
        direction: MessageDirection.Outbound,
        channel: MessageChannel.Email,
        subject: null,
        content: 'Tresc',
        sentAt: new Date(),
        readAt: null,
      });

      await service.sendMessage('case-1', 'user-1', { channel: MessageChannel.Email, content: 'Tresc' });

      expect(messagesRepository.create).toHaveBeenCalledWith(
        'case-1',
        expect.objectContaining({ senderType: SenderType.Employee, direction: MessageDirection.Outbound }),
        TX_MARKER,
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.CASE_MESSAGE_ADDED);
    });
  });

  describe('Blokada współbieżności (proxy jednostkowy)', () => {
    it('każda mutacja pojedynczej sprawy przechodzi przez findByIdForUpdate (blokada wiersza) wewnątrz $transaction, nigdy przez zwykły findById', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: CaseStatus.Nowa }));
      casesRepository.updateStatus.mockResolvedValue(buildCase({ status: CaseStatus.Przyjeta }));

      await service.changeStatus('case-1', CaseStatus.Przyjeta, 'user-1', [PERMISSIONS.CASES_STATUS_CHANGE]);

      expect(casesRepository.findByIdForUpdate).toHaveBeenCalledWith('case-1', TX_MARKER);
      expect(casesRepository.findById).not.toHaveBeenCalled();
    });
  });
});
