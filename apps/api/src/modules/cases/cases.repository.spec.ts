import { ComplaintType, Decision, SubmissionMode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CasesRepository } from './cases.repository';

const WITH_ITEMS = {
  items: { include: { product: { select: { brandId: true } } } },
  reportedByPartnerCompany: { select: { name: true } },
  _count: { select: { messages: { where: { direction: 'Inbound', readAt: null } } } },
};

describe('CasesRepository', () => {
  let prisma: {
    case: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let repository: CasesRepository;

  beforeEach(() => {
    prisma = {
      case: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    repository = new CasesRepository(prisma as unknown as PrismaService);
  });

  it('findAllForCompany() filtruje po companyId, dołącza pozycje, sortuje od najnowszej', async () => {
    prisma.case.findMany.mockResolvedValue([]);
    await repository.findAllForCompany('company-1');
    expect(prisma.case.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
      include: WITH_ITEMS,
      orderBy: { createdAt: 'desc' },
    });
  });

  it('search() filtruje po companyId i częściowym dopasowaniu caseNumber', async () => {
    prisma.case.findMany.mockResolvedValue([]);
    await repository.search('company-1', 'RMA/2026');
    expect(prisma.case.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1', caseNumber: { contains: 'RMA/2026', mode: 'insensitive' } },
      include: WITH_ITEMS,
      take: 50,
    });
  });

  it('findById() filtruje po companyId i dołącza pozycje (IDOR — patrz audyt bezpieczeństwa)', async () => {
    prisma.case.findFirst.mockResolvedValue(null);
    await repository.findById('case-1', 'company-1');
    expect(prisma.case.findFirst).toHaveBeenCalledWith({
      where: { id: 'case-1', companyId: 'company-1' },
      include: WITH_ITEMS,
    });
  });

  it('countActiveByOwner() wyklucza statusy końcowe (kody dostarczone przez wołającego)', async () => {
    prisma.case.count.mockResolvedValue(0);
    await repository.countActiveByOwner('user-1', ['Zakonczona']);
    expect(prisma.case.count).toHaveBeenCalledWith({
      where: { ownerId: 'user-1', status: { notIn: ['Zakonczona'] } },
    });
  });

  it('countCreatedInYear() filtruje po companyId i przedziale dat całego roku', async () => {
    prisma.case.count.mockResolvedValue(3);
    await repository.countCreatedInYear('company-1', 2026);
    expect(prisma.case.count).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        createdAt: { gte: new Date(Date.UTC(2026, 0, 1)), lt: new Date(Date.UTC(2027, 0, 1)) },
      },
    });
  });

  it('create() dowiązuje companyId/caseNumber i tworzy zagnieżdżone CaseItem', async () => {
    prisma.case.create.mockResolvedValue({});
    await repository.create('company-1', 'RMA/2026/00001', {
      status: 'Nowa',
      customerId: 'customer-1',
      complaintType: ComplaintType.Warranty,
      submissionMode: SubmissionMode.PrzezSklep,
      requestedResolution: 'Naprawa',
      description: 'Opis usterki',
      items: [{ productId: 'product-1', description: 'Rysa na obudowie' }],
    });
    const call = prisma.case.create.mock.calls[0][0];
    expect(call.data.companyId).toBe('company-1');
    expect(call.data.caseNumber).toBe('RMA/2026/00001');
    expect(call.data.items.create).toEqual([
      { productId: 'product-1', description: 'Rysa na obudowie' },
    ]);
  });

  it('update() przekazuje wyłącznie dozwolone pola (requestedResolution/description/priority)', async () => {
    prisma.case.update.mockResolvedValue({});
    await repository.update('case-1', { description: 'Nowy opis' });
    expect(prisma.case.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { description: 'Nowy opis' },
      include: WITH_ITEMS,
    });
  });

  it('updateStatus() zapisuje status i przekazane znaczniki czasu/nextAction w jednym wywołaniu', async () => {
    prisma.case.update.mockResolvedValue({});
    const closedAt = new Date('2026-01-01');
    await repository.updateStatus('case-1', 'Zakonczona', { closedAt, nextAction: null });
    expect(prisma.case.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { status: 'Zakonczona', closedAt, nextAction: null },
      include: WITH_ITEMS,
    });
  });

  it('setDecision() zapisuje decision/decisionByUserId/decisionAt/requiresManagerApproval', async () => {
    prisma.case.update.mockResolvedValue({});
    await repository.setDecision('case-1', Decision.ZwrotSrodkow, 'user-1', true, undefined, {
      decisionIsPositive: true,
    });
    const call = prisma.case.update.mock.calls[0][0];
    expect(call.data.decision).toBe(Decision.ZwrotSrodkow);
    expect(call.data.decisionByUserId).toBe('user-1');
    expect(call.data.requiresManagerApproval).toBe(true);
    expect(call.data.decisionAt).toBeInstanceOf(Date);
    expect(call.data.nextAction).toBeUndefined();
  });

  it('setDecision() aktualizuje nextAction, gdy podane (WORKFLOW.md — po decyzji podpowiedź ma się zmienić)', async () => {
    prisma.case.update.mockResolvedValue({});
    await repository.setDecision(
      'case-1',
      Decision.ZwrotSrodkow,
      'user-1',
      true,
      'Zmień status na „Realizacja decyzji”',
      {
        decisionIsPositive: true,
      },
    );
    const call = prisma.case.update.mock.calls[0][0];
    expect(call.data.nextAction).toBe('Zmień status na „Realizacja decyzji”');
  });

  it('assignOwner() zapisuje wyłącznie ownerId', async () => {
    prisma.case.update.mockResolvedValue({});
    await repository.assignOwner('case-1', 'user-2');
    expect(prisma.case.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { ownerId: 'user-2' },
      include: WITH_ITEMS,
    });
  });

  it('create()/update()/updateStatus()/setDecision()/assignOwner() używają PRZEKAZANEGO klienta transakcji, nie this.prisma, gdy podany', async () => {
    const tx = {
      case: { create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) },
    };
    await repository.create(
      'company-1',
      'RMA/2026/00002',
      {
        status: 'Nowa',
        customerId: 'c-1',
        complaintType: ComplaintType.Warranty,
        submissionMode: SubmissionMode.PrzezSklep,
        requestedResolution: 'X',
        description: 'Y',
        items: [],
      },
      tx as never,
    );
    await repository.assignOwner('case-1', 'user-2', tx as never);
    expect(tx.case.create).toHaveBeenCalledTimes(1);
    expect(tx.case.update).toHaveBeenCalledTimes(1);
    expect(prisma.case.create).not.toHaveBeenCalled();
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  describe('findByIdForUpdate', () => {
    it('blokuje wiersz (SELECT ... FOR UPDATE) i zwraca null, jeśli wiersz nie istnieje — BEZ dodatkowego odczytu', async () => {
      const tx = { $queryRaw: jest.fn().mockResolvedValue([]), case: { findFirst: jest.fn() } };
      const result = await repository.findByIdForUpdate('brak', 'company-1', tx as never);
      expect(result).toBeNull();
      expect(tx.case.findFirst).not.toHaveBeenCalled();
    });

    it('po udanej blokadzie odczytuje pełny rekord z pozycjami (filtrowany po companyId), przez TEN SAM klient transakcji', async () => {
      const caseRow = { id: 'case-1' };
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'case-1' }]),
        case: { findFirst: jest.fn().mockResolvedValue(caseRow) },
      };
      const result = await repository.findByIdForUpdate('case-1', 'company-1', tx as never);
      expect(tx.case.findFirst).toHaveBeenCalledWith({
        where: { id: 'case-1', companyId: 'company-1' },
        include: WITH_ITEMS,
      });
      expect(result).toBe(caseRow);
    });
  });
});
