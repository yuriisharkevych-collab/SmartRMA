import { CaseStatusesService } from '../../case-statuses/case-statuses.service';
import { CasesService } from '../../cases/cases.service';
import { CompaniesService } from '../../companies/companies.service';
import { DomainEvent } from '../../../events/domain-event.base';
import { IdempotencyService } from '../../../events/idempotency.service';
import { CaseHandoffRepository } from '../case-handoff.repository';
import { CaseHandoffPartnerUpdateHandler } from './case-handoff-partner-update.handler';

function buildEvent(payload: Record<string, unknown>) {
  return {
    eventId: 'event-1',
    companyId: 'distributor-1',
    aggregateId: 'target-case-1',
    payload,
  } as unknown as DomainEvent<never>;
}

describe('CaseHandoffPartnerUpdateHandler', () => {
  let caseHandoffRepository: jest.Mocked<Pick<CaseHandoffRepository, 'findByTargetCaseId'>>;
  let casesService: jest.Mocked<Pick<CasesService, 'appendCaseHistory'>>;
  let caseStatusesService: jest.Mocked<Pick<CaseStatusesService, 'findByCode'>>;
  let companiesService: jest.Mocked<Pick<CompaniesService, 'findById'>>;
  let idempotencyService: jest.Mocked<Pick<IdempotencyService, 'tryMarkProcessed'>>;
  let handler: CaseHandoffPartnerUpdateHandler;

  beforeEach(() => {
    caseHandoffRepository = { findByTargetCaseId: jest.fn() };
    casesService = { appendCaseHistory: jest.fn() };
    caseStatusesService = { findByCode: jest.fn() };
    companiesService = { findById: jest.fn().mockResolvedValue({ name: 'Producent XYZ' }) };
    idempotencyService = { tryMarkProcessed: jest.fn().mockResolvedValue(true) };

    handler = new CaseHandoffPartnerUpdateHandler(
      caseHandoffRepository as unknown as CaseHandoffRepository,
      casesService as unknown as CasesService,
      caseStatusesService as unknown as CaseStatusesService,
      companiesService as unknown as CompaniesService,
      idempotencyService as unknown as IdempotencyService,
    );
  });

  describe('handleStatusChanged', () => {
    it('nic nie robi, gdy zmieniona sprawa nie jest CELEM żadnego CaseHandoff', async () => {
      caseHandoffRepository.findByTargetCaseId.mockResolvedValue(null);
      await handler.handleStatusChanged(buildEvent({ newStatus: 'Przyjeta' }));
      expect(casesService.appendCaseHistory).not.toHaveBeenCalled();
    });

    it('dokleja HandoffPartnerUpdate do sprawy ŹRÓDŁOWEJ, gdy zmieniona sprawa JEST celem przekazania', async () => {
      caseHandoffRepository.findByTargetCaseId.mockResolvedValue({
        originCaseId: 'origin-case-1',
      } as never);
      caseStatusesService.findByCode.mockResolvedValue({ label: 'Przyjęta' } as never);

      await handler.handleStatusChanged(buildEvent({ newStatus: 'Przyjeta' }));

      expect(casesService.appendCaseHistory).toHaveBeenCalledWith(
        'origin-case-1',
        expect.objectContaining({
          userId: null,
          action: 'HandoffPartnerUpdate',
          newValue: 'Status u partnera (Producent XYZ): Przyjęta',
          visibleForCustomer: false,
        }),
      );
    });

    it('idempotencja — pomija drugie przetworzenie tego samego eventId', async () => {
      idempotencyService.tryMarkProcessed.mockResolvedValue(false);
      await handler.handleStatusChanged(buildEvent({ newStatus: 'Przyjeta' }));
      expect(caseHandoffRepository.findByTargetCaseId).not.toHaveBeenCalled();
      expect(casesService.appendCaseHistory).not.toHaveBeenCalled();
    });

    it('Faza 6 (trasy wieloetapowe) — łańcuch Sklep→Dystrybutor→Producent: zmiana u Producenta dokleja HandoffPartnerUpdate do OBU przodków (Dystrybutora i Sklepu)', async () => {
      // target-case-1 (Producent) jest celem przekazania od dystrybutor-case-1, które z kolei
      // jest celem przekazania od shop-case-1 — pętla musi przejść przez OBA ogniwa.
      caseHandoffRepository.findByTargetCaseId.mockImplementation((caseId: string) => {
        if (caseId === 'target-case-1')
          return Promise.resolve({ originCaseId: 'dystrybutor-case-1' } as never);
        if (caseId === 'dystrybutor-case-1')
          return Promise.resolve({ originCaseId: 'shop-case-1' } as never);
        return Promise.resolve(null);
      });
      caseStatusesService.findByCode.mockResolvedValue({ label: 'Decyzja pozytywna' } as never);

      await handler.handleStatusChanged(buildEvent({ newStatus: 'DecyzjaPozytywna' }));

      expect(casesService.appendCaseHistory).toHaveBeenCalledTimes(2);
      expect(casesService.appendCaseHistory).toHaveBeenNthCalledWith(
        1,
        'dystrybutor-case-1',
        expect.objectContaining({
          action: 'HandoffPartnerUpdate',
          newValue: 'Status u partnera (Producent XYZ): Decyzja pozytywna',
        }),
      );
      expect(casesService.appendCaseHistory).toHaveBeenNthCalledWith(
        2,
        'shop-case-1',
        expect.objectContaining({
          action: 'HandoffPartnerUpdate',
          newValue: 'Status u partnera (Producent XYZ): Decyzja pozytywna',
        }),
      );
    });
  });

  describe('handleDecisionSet', () => {
    it('nic nie robi, gdy zmieniona sprawa nie jest CELEM żadnego CaseHandoff', async () => {
      caseHandoffRepository.findByTargetCaseId.mockResolvedValue(null);
      await handler.handleDecisionSet(buildEvent({ decision: 'Repair' }));
      expect(casesService.appendCaseHistory).not.toHaveBeenCalled();
    });

    it('dokleja HandoffPartnerUpdate z decyzją partnera do sprawy źródłowej', async () => {
      caseHandoffRepository.findByTargetCaseId.mockResolvedValue({
        originCaseId: 'origin-case-1',
      } as never);

      await handler.handleDecisionSet(buildEvent({ decision: 'Repair' }));

      expect(casesService.appendCaseHistory).toHaveBeenCalledWith(
        'origin-case-1',
        expect.objectContaining({
          userId: null,
          action: 'HandoffPartnerUpdate',
          newValue: 'Decyzja partnera (Producent XYZ): Repair',
          visibleForCustomer: false,
        }),
      );
    });
  });
});
