import { PrismaService } from '../../prisma/prisma.service';
import { CaseItemsRepository } from './case-items.repository';

describe('CaseItemsRepository', () => {
  let prisma: { caseItem: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock } };
  let repository: CaseItemsRepository;

  beforeEach(() => {
    prisma = { caseItem: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() } };
    repository = new CaseItemsRepository(prisma as unknown as PrismaService);
  });

  it('findByCaseId() filtruje po caseId', async () => {
    prisma.caseItem.findMany.mockResolvedValue([]);
    await repository.findByCaseId('case-1');
    expect(prisma.caseItem.findMany).toHaveBeenCalledWith({ where: { caseId: 'case-1' } });
  });

  it('findById() odpytuje po id', async () => {
    prisma.caseItem.findUnique.mockResolvedValue(null);
    await repository.findById('item-1');
    expect(prisma.caseItem.findUnique).toHaveBeenCalledWith({ where: { id: 'item-1' } });
  });

  it('updateManufacturer() aktualizuje WYŁĄCZNIE manufacturerId (BR-072)', async () => {
    prisma.caseItem.update.mockResolvedValue({});
    await repository.updateManufacturer('item-1', 'manufacturer-1');
    expect(prisma.caseItem.update).toHaveBeenCalledWith({ where: { id: 'item-1' }, data: { manufacturerId: 'manufacturer-1' } });
  });
});
