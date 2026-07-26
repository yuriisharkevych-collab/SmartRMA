import { DocumentStatus, DocumentType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentsRepository } from './documents.repository';

describe('DocumentsRepository', () => {
  let prisma: { document: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock } };
  let repository: DocumentsRepository;

  beforeEach(() => {
    prisma = { document: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() } };
    repository = new DocumentsRepository(prisma as unknown as PrismaService);
  });

  it('findAllForCase() filtruje po caseId i sortuje od najnowszego uploadu', async () => {
    prisma.document.findMany.mockResolvedValue([]);
    await repository.findAllForCase('case-1');
    expect(prisma.document.findMany).toHaveBeenCalledWith({ where: { caseId: 'case-1' }, orderBy: { uploadedAt: 'desc' } });
  });

  it('findById() odpytuje po id', async () => {
    prisma.document.findUnique.mockResolvedValue(null);
    await repository.findById('document-1');
    expect(prisma.document.findUnique).toHaveBeenCalledWith({ where: { id: 'document-1' } });
  });

  it('create() dowiązuje caseId/uploadedById do danych dokumentu', async () => {
    prisma.document.create.mockResolvedValue({});
    await repository.create('case-1', 'user-1', { fileName: 'zdjecie.jpg', fileType: DocumentType.JPG, mimeType: 'image/jpeg', fileSize: 1024, storagePath: '/tmp/zdjecie.jpg' });
    expect(prisma.document.create).toHaveBeenCalledWith({
      data: { fileName: 'zdjecie.jpg', fileType: DocumentType.JPG, mimeType: 'image/jpeg', fileSize: 1024, storagePath: '/tmp/zdjecie.jpg', caseId: 'case-1', uploadedById: 'user-1' },
    });
  });

  it('markInvalid() zapisuje WYŁĄCZNIE status=Bledny (BR-020, bez delete)', async () => {
    prisma.document.update.mockResolvedValue({});
    await repository.markInvalid('document-1');
    expect(prisma.document.update).toHaveBeenCalledWith({ where: { id: 'document-1' }, data: { status: DocumentStatus.Bledny } });
  });

  it('create()/markInvalid() używają PRZEKAZANEGO klienta transakcji, nie this.prisma, gdy podany', async () => {
    const tx = { document: { create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) } };
    await repository.create('case-1', 'user-1', { fileName: 'a.pdf', fileType: DocumentType.PDF, mimeType: 'application/pdf', fileSize: 10, storagePath: '/a.pdf' }, tx as never);
    await repository.markInvalid('document-1', tx as never);
    expect(tx.document.create).toHaveBeenCalledTimes(1);
    expect(tx.document.update).toHaveBeenCalledTimes(1);
    expect(prisma.document.create).not.toHaveBeenCalled();
    expect(prisma.document.update).not.toHaveBeenCalled();
  });
});
