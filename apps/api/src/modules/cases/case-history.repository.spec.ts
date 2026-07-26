import { CaseHistoryAction, CaseStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CaseHistoryRepository } from './case-history.repository';

describe('CaseHistoryRepository', () => {
  let prisma: { caseHistory: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock } };
  let repository: CaseHistoryRepository;

  beforeEach(() => {
    prisma = { caseHistory: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() } };
    repository = new CaseHistoryRepository(prisma as unknown as PrismaService);
  });

  it('addEntry() dowiązuje caseId do wpisu', async () => {
    prisma.caseHistory.create.mockResolvedValue({});
    await repository.addEntry('case-1', { action: CaseHistoryAction.CaseCreated, newValue: 'Nowa' });
    expect(prisma.caseHistory.create).toHaveBeenCalledWith({ data: { action: CaseHistoryAction.CaseCreated, newValue: 'Nowa', caseId: 'case-1' } });
  });

  it('findByCaseId() sortuje chronologicznie rosnąco', async () => {
    prisma.caseHistory.findMany.mockResolvedValue([]);
    await repository.findByCaseId('case-1');
    expect(prisma.caseHistory.findMany).toHaveBeenCalledWith({ where: { caseId: 'case-1' }, orderBy: { createdAt: 'asc' } });
  });

  it('findLastStatusBeforeWaiting() szuka najnowszego wpisu z newValue=OczekiwanieNaKlienta, BEZ filtra po action', async () => {
    prisma.caseHistory.findFirst.mockResolvedValue({ previousValue: CaseStatus.WyslanaDoProducenta });
    const result = await repository.findLastStatusBeforeWaiting('case-1');
    expect(prisma.caseHistory.findFirst).toHaveBeenCalledWith({
      where: { caseId: 'case-1', newValue: CaseStatus.OczekiwanieNaKlienta },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toBe(CaseStatus.WyslanaDoProducenta);
  });

  it('findLastStatusBeforeWaiting() zwraca null, gdy brak takiego wpisu', async () => {
    prisma.caseHistory.findFirst.mockResolvedValue(null);
    expect(await repository.findLastStatusBeforeWaiting('case-1')).toBeNull();
  });
});
