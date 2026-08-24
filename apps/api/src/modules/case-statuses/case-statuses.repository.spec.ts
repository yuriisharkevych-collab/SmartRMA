import { PrismaService } from '../../prisma/prisma.service';
import { CaseStatusesRepository } from './case-statuses.repository';

describe('CaseStatusesRepository', () => {
  let prisma: {
    caseStatusDefinition: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      aggregate: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    case: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let repository: CaseStatusesRepository;

  beforeEach(() => {
    prisma = {
      caseStatusDefinition: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      case: { count: jest.fn() },
      $transaction: jest.fn((work) => work(prisma)),
    };
    repository = new CaseStatusesRepository(prisma as unknown as PrismaService);
  });

  it('findAllForCompany() filtruje po companyId, sortuje po order', async () => {
    prisma.caseStatusDefinition.findMany.mockResolvedValue([]);
    await repository.findAllForCompany('company-1');
    expect(prisma.caseStatusDefinition.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
      orderBy: { order: 'asc' },
    });
  });

  it('findActiveForCompany() dodatkowo filtruje active:true', async () => {
    prisma.caseStatusDefinition.findMany.mockResolvedValue([]);
    await repository.findActiveForCompany('company-1');
    expect(prisma.caseStatusDefinition.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1', active: true },
      orderBy: { order: 'asc' },
    });
  });

  it('findById() filtruje po companyId (IDOR — findFirst nie findUnique)', async () => {
    prisma.caseStatusDefinition.findFirst.mockResolvedValue(null);
    await repository.findById('status-1', 'company-1');
    expect(prisma.caseStatusDefinition.findFirst).toHaveBeenCalledWith({
      where: { id: 'status-1', companyId: 'company-1' },
    });
  });

  it('findByCode() filtruje po companyId', async () => {
    prisma.caseStatusDefinition.findFirst.mockResolvedValue(null);
    await repository.findByCode('Nowa', 'company-1');
    expect(prisma.caseStatusDefinition.findFirst).toHaveBeenCalledWith({
      where: { code: 'Nowa', companyId: 'company-1' },
    });
  });

  it('create() dowiązuje companyId', async () => {
    prisma.caseStatusDefinition.create.mockResolvedValue({});
    await repository.create('company-1', { code: 'X', label: 'X', order: 1 } as never);
    expect(prisma.caseStatusDefinition.create).toHaveBeenCalledWith({
      data: { code: 'X', label: 'X', order: 1, companyId: 'company-1' },
    });
  });

  it('countCasesUsingCode() liczy sprawy z dokładnie tym kodem statusu w tej firmie', async () => {
    prisma.case.count.mockResolvedValue(2);
    const result = await repository.countCasesUsingCode('Nowa', 'company-1');
    expect(prisma.case.count).toHaveBeenCalledWith({
      where: { companyId: 'company-1', status: 'Nowa' },
    });
    expect(result).toBe(2);
  });
});
