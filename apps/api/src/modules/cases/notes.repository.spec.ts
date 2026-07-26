import { PrismaService } from '../../prisma/prisma.service';
import { NotesRepository } from './notes.repository';

describe('NotesRepository', () => {
  let prisma: { note: { create: jest.Mock; findMany: jest.Mock } };
  let repository: NotesRepository;

  beforeEach(() => {
    prisma = { note: { create: jest.fn(), findMany: jest.fn() } };
    repository = new NotesRepository(prisma as unknown as PrismaService);
  });

  it('create() zapisuje caseId/userId/content', async () => {
    prisma.note.create.mockResolvedValue({});
    await repository.create('case-1', 'user-1', 'Trescs notatki');
    expect(prisma.note.create).toHaveBeenCalledWith({ data: { caseId: 'case-1', userId: 'user-1', content: 'Trescs notatki' } });
  });

  it('findByCaseId() sortuje od najnowszej', async () => {
    prisma.note.findMany.mockResolvedValue([]);
    await repository.findByCaseId('case-1');
    expect(prisma.note.findMany).toHaveBeenCalledWith({ where: { caseId: 'case-1' }, orderBy: { createdAt: 'desc' } });
  });
});
