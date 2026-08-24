import { CaseHistoryAction } from '@prisma/client';
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
    await repository.addEntry('case-1', {
      action: CaseHistoryAction.CaseCreated,
      newValue: 'Nowa',
    });
    expect(prisma.caseHistory.create).toHaveBeenCalledWith({
      data: { action: CaseHistoryAction.CaseCreated, newValue: 'Nowa', caseId: 'case-1' },
    });
  });

  it('findByCaseId() sortuje chronologicznie rosnąco i dołącza autora (imię/nazwisko)', async () => {
    prisma.caseHistory.findMany.mockResolvedValue([]);
    await repository.findByCaseId('case-1');
    expect(prisma.caseHistory.findMany).toHaveBeenCalledWith({
      where: { caseId: 'case-1' },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
  });
});
