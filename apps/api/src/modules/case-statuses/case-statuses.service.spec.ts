import { NotFoundException } from '@nestjs/common';
import { PortalStage } from '@prisma/client';
import { CaseStatusesRepository } from './case-statuses.repository';
import { CaseStatusesService } from './case-statuses.service';

function buildStatus(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'status-1',
    companyId: 'company-1',
    code: 'Nowa',
    label: 'Nowa',
    description: null,
    order: 1,
    active: true,
    isFinal: false,
    isDefaultForNew: false,
    requiresConfirmation: false,
    requiredCheck: null,
    portalStage: PortalStage.Zgloszona,
    defaultNextAction: null,
    notifyCustomerTemplateCode: null,
    isSystem: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('CaseStatusesService', () => {
  let repository: jest.Mocked<CaseStatusesRepository>;
  let service: CaseStatusesService;

  beforeEach(() => {
    repository = {
      findAllForCompany: jest.fn(),
      findActiveForCompany: jest.fn(),
      findById: jest.fn(),
      findByCode: jest.fn(),
      countCodesWithPrefix: jest.fn(),
      maxOrder: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateOrder: jest.fn(),
      runInTransaction: jest.fn(),
      countCasesUsingCode: jest.fn(),
    } as unknown as jest.Mocked<CaseStatusesRepository>;
    service = new CaseStatusesService(repository);
  });

  describe('create', () => {
    it('generuje kod PascalCase bez polskich znaków ze `label`, gdy brak kolizji', async () => {
      repository.countCodesWithPrefix.mockResolvedValue(0);
      repository.maxOrder.mockResolvedValue({ _max: { order: 3 } });
      repository.create.mockResolvedValue(
        buildStatus({
          code: 'OczekujemyNaCzesci',
          label: 'Oczekujemy na części',
          order: 4,
          isSystem: false,
        }),
      );

      await service.create('company-1', { label: 'Oczekujemy na części' });

      expect(repository.countCodesWithPrefix).toHaveBeenCalledWith(
        'OczekujemyNaCzesci',
        'company-1',
      );
      expect(repository.create).toHaveBeenCalledWith(
        'company-1',
        expect.objectContaining({
          code: 'OczekujemyNaCzesci',
          label: 'Oczekujemy na części',
          order: 4,
          active: true,
          isFinal: false,
          isDefaultForNew: false,
          requiresConfirmation: false,
          requiredCheck: null,
          portalStage: PortalStage.WTrakcie,
          isSystem: false,
        }),
      );
    });

    it('doklejeuje liczbowy sufiks do kodu przy kolizji nazwy', async () => {
      repository.countCodesWithPrefix.mockResolvedValue(1);
      repository.maxOrder.mockResolvedValue({ _max: { order: null } });
      repository.create.mockResolvedValue(buildStatus({ code: 'Nowa2' }));

      await service.create('company-1', { label: 'Nowa' });

      expect(repository.create).toHaveBeenCalledWith(
        'company-1',
        expect.objectContaining({ code: 'Nowa2', order: 1 }),
      );
    });

    it('respektuje `isFinal` przekazane w DTO', async () => {
      repository.countCodesWithPrefix.mockResolvedValue(0);
      repository.maxOrder.mockResolvedValue({ _max: { order: 5 } });
      repository.create.mockResolvedValue(buildStatus({ isFinal: true }));

      await service.create('company-1', { label: 'Zamknięte specjalnie', isFinal: true });

      expect(repository.create).toHaveBeenCalledWith(
        'company-1',
        expect.objectContaining({ isFinal: true }),
      );
    });
  });

  describe('update — dezaktywacja (CASE-015)', () => {
    it('blokuje dezaktywację, gdy status nie-finalny jest używany przez aktywną sprawę', async () => {
      repository.findById.mockResolvedValue(buildStatus({ isFinal: false, active: true }));
      repository.countCasesUsingCode.mockResolvedValue(3);

      await expect(
        service.update('status-1', 'company-1', { active: false }),
      ).rejects.toMatchObject({
        code: 'CASE-015',
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('pozwala dezaktywować status nie-finalny, gdy nie jest używany przez żadną sprawę', async () => {
      repository.findById.mockResolvedValue(buildStatus({ isFinal: false, active: true }));
      repository.countCasesUsingCode.mockResolvedValue(0);
      repository.update.mockResolvedValue(buildStatus({ active: false }));

      await service.update('status-1', 'company-1', { active: false });

      expect(repository.update).toHaveBeenCalledWith('status-1', { active: false });
    });

    it('pozwala dezaktywować status FINALNY bez sprawdzania użycia (sprawy w nim są z definicji zamknięte)', async () => {
      repository.findById.mockResolvedValue(buildStatus({ isFinal: true, active: true }));
      repository.update.mockResolvedValue(buildStatus({ isFinal: true, active: false }));

      await service.update('status-1', 'company-1', { active: false });

      expect(repository.countCasesUsingCode).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalledWith('status-1', { active: false });
    });

    it('rzuca 404, gdy status nie należy do tej firmy (IDOR)', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(
        service.update('status-1', 'company-2', { active: false }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update — pozostałe pola', () => {
    it('aktualizuje label/description/order/isFinal bez wywoływania guardu dezaktywacji', async () => {
      repository.findById.mockResolvedValue(buildStatus());
      repository.update.mockResolvedValue(buildStatus({ label: 'Nowa nazwa' }));

      await service.update('status-1', 'company-1', { label: 'Nowa nazwa', order: 2 });

      expect(repository.countCasesUsingCode).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalledWith('status-1', { label: 'Nowa nazwa', order: 2 });
    });
  });

  describe('reorder', () => {
    it('rzuca 404, gdy którekolwiek id nie należy do tej firmy (IDOR)', async () => {
      repository.findAllForCompany.mockResolvedValue([buildStatus({ id: 'status-1' })] as never);

      await expect(
        service.reorder('company-1', { statusIds: ['status-1', 'status-obcej-firmy'] }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.runInTransaction).not.toHaveBeenCalled();
    });

    it('zapisuje kolejność jako indeks (1-based) dla każdego przekazanego id', async () => {
      repository.findAllForCompany.mockResolvedValue([
        buildStatus({ id: 'a' }),
        buildStatus({ id: 'b' }),
      ] as never);
      repository.runInTransaction.mockImplementation(async (work) => work({} as never));

      await service.reorder('company-1', { statusIds: ['b', 'a'] });

      expect(repository.updateOrder).toHaveBeenNthCalledWith(1, 'b', 1, {});
      expect(repository.updateOrder).toHaveBeenNthCalledWith(2, 'a', 2, {});
    });
  });
});
