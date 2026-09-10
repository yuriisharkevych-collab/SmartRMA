import { PrismaService } from '../../prisma/prisma.service';
import { CaseHandoffRepository } from './case-handoff.repository';

describe('CaseHandoffRepository', () => {
  let prisma: { caseHandoff: { deleteMany: jest.Mock } };
  let repository: CaseHandoffRepository;

  beforeEach(() => {
    prisma = { caseHandoff: { deleteMany: jest.fn() } };
    repository = new CaseHandoffRepository(prisma as unknown as PrismaService);
  });

  describe('deleteAllForCase (cases.delete / hardDelete)', () => {
    it('usuwa łącznik, gdy sprawa jest ŹRÓDŁEM (originCaseId) przekazania — nie zakłada wyłącznie tego kierunku, ale pokrywa go', async () => {
      prisma.caseHandoff.deleteMany.mockResolvedValue({ count: 1 });
      await repository.deleteAllForCase('case-1');
      expect(prisma.caseHandoff.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ originCaseId: 'case-1' }, { targetCaseId: 'case-1' }] },
      });
    });

    it('to samo zapytanie pasuje też, gdy sprawa jest CELEM (targetCaseId) przekazania — jeden warunek OR obsługuje oba kierunki naraz', async () => {
      // Ten sam `where` co wyżej trafia zarówno wiersz, gdzie usuwana sprawa jest
      // `originCaseId`, jak i wiersz, gdzie jest `targetCaseId` — dowód, że
      // implementacja NIE zakłada, że wystarczy obsłużyć tylko `originCaseId`.
      prisma.caseHandoff.deleteMany.mockResolvedValue({ count: 1 });
      await repository.deleteAllForCase('case-2');
      const call = prisma.caseHandoff.deleteMany.mock.calls[0][0];
      expect(call.where.OR).toContainEqual({ originCaseId: 'case-2' });
      expect(call.where.OR).toContainEqual({ targetCaseId: 'case-2' });
    });

    it('brak dopasowanego wiersza (sprawa bez żadnego przekazania) jest bezpiecznym no-opem — `deleteMany`, nie `delete`', async () => {
      prisma.caseHandoff.deleteMany.mockResolvedValue({ count: 0 });
      await expect(repository.deleteAllForCase('case-bez-handoffu')).resolves.toEqual({
        count: 0,
      });
    });

    it('woła WYŁĄCZNIE `caseHandoff.deleteMany` — nigdy `case.deleteMany`/`case.delete` (druga sprawa nie może zostać usunięta stąd)', async () => {
      const fullPrisma = {
        caseHandoff: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        case: { deleteMany: jest.fn(), delete: jest.fn() },
      };
      const repo = new CaseHandoffRepository(fullPrisma as unknown as PrismaService);
      await repo.deleteAllForCase('case-1');
      expect(fullPrisma.case.deleteMany).not.toHaveBeenCalled();
      expect(fullPrisma.case.delete).not.toHaveBeenCalled();
    });

    it('przyjmuje przekazany klient transakcyjny (`tx`) zamiast domyślnego `this.prisma` — ten sam wzorzec co inne `deleteAllForCase` w `hardDelete`', async () => {
      const tx = { caseHandoff: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) } };
      await repository.deleteAllForCase('case-1', tx as never);
      expect(tx.caseHandoff.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.caseHandoff.deleteMany).not.toHaveBeenCalled();
    });
  });
});
