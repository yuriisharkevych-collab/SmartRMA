import { NotFoundException } from '@nestjs/common';
import { Document, DocumentCategory, DocumentStatus, DocumentType, DocumentVisibility } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditRepository } from '../audit/audit.repository';
import { CasesService } from '../cases/cases.service';
import { CaseEntity } from '../cases/entities/case.entity';
import { IEventBus } from '../../events/event-bus.interface';
import { EVENT_NAMES } from '../../events/event-names.const';
import { DocumentsRepository } from './documents.repository';
import { DocumentsService } from './documents.service';

const TX_MARKER = { __tx: true } as const;

function buildCase(overrides: Partial<CaseEntity> = {}): CaseEntity {
  return {
    id: 'case-1',
    companyId: 'company-1',
    shopId: null,
    caseNumber: 'RMA/2026/00001',
    customerId: 'customer-1',
    ownerId: null,
    items: [{ id: 'item-1', caseId: 'case-1', orderItemId: null, productId: 'product-1', manufacturerId: null, description: 'Rysa', quantity: 1 }],
    ...overrides,
  } as unknown as CaseEntity;
}

function buildDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 'document-1',
    caseId: 'case-1',
    caseItemId: null,
    fileName: 'zdjecie.jpg',
    fileType: DocumentType.JPG,
    mimeType: 'image/jpeg',
    fileSize: 2048,
    storagePath: '/tmp/zdjecie.jpg',
    category: DocumentCategory.Photo,
    visibility: DocumentVisibility.Internal,
    status: DocumentStatus.Aktywny,
    uploadedById: 'user-1',
    uploadedAt: new Date('2026-01-01'),
    version: 1,
    ...overrides,
  } as Document;
}

describe('DocumentsService', () => {
  let prisma: jest.Mocked<Pick<PrismaService, '$transaction'>>;
  let documentsRepository: jest.Mocked<Pick<DocumentsRepository, 'findAllForCase' | 'findById' | 'create' | 'markInvalid'>>;
  let auditRepository: jest.Mocked<Pick<AuditRepository, 'create'>>;
  let casesService: jest.Mocked<Pick<CasesService, 'findById' | 'appendCaseHistory'>>;
  let eventBus: jest.Mocked<IEventBus>;
  let service: DocumentsService;

  beforeEach(() => {
    prisma = { $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(TX_MARKER)) };
    documentsRepository = { findAllForCase: jest.fn(), findById: jest.fn(), create: jest.fn(), markInvalid: jest.fn() };
    auditRepository = { create: jest.fn() };
    casesService = {
      findById: jest.fn().mockResolvedValue(buildCase()),
      appendCaseHistory: jest.fn().mockResolvedValue({ id: 'history-1' }),
    };
    eventBus = { publish: jest.fn(), publishAll: jest.fn() };

    service = new DocumentsService(
      prisma as unknown as PrismaService,
      documentsRepository as unknown as DocumentsRepository,
      auditRepository as unknown as AuditRepository,
      casesService as unknown as CasesService,
      eventBus,
    );
  });

  const uploadDto = { fileName: 'zdjecie.jpg', fileType: DocumentType.JPG, mimeType: 'image/jpeg', fileSize: 2048, storagePath: '/tmp/zdjecie.jpg' };

  describe('listDocuments / getDocument', () => {
    it('propaguje błąd, gdy sprawa nie istnieje', async () => {
      casesService.findById.mockRejectedValue(new NotFoundException());
      await expect(service.listDocuments('case-1', 'company-1')).rejects.toThrow(NotFoundException);
      expect(documentsRepository.findAllForCase).not.toHaveBeenCalled();
    });

    it('rzuca NotFoundException, gdy sprawa należy do INNEJ firmy (izolacja dzierżawy, BR-086)', async () => {
      casesService.findById.mockResolvedValue(buildCase({ companyId: 'company-2' }));
      await expect(service.listDocuments('case-1', 'company-1')).rejects.toThrow(NotFoundException);
    });

    it('getDocument() rzuca NotFoundException, gdy dokument należy do INNEJ sprawy niż w URL', async () => {
      documentsRepository.findById.mockResolvedValue(buildDocument({ caseId: 'case-2' }));
      await expect(service.getDocument('case-1', 'document-1', 'company-1')).rejects.toThrow(NotFoundException);
    });

    it('getDocument() zwraca dokument, gdy sprawa i companyId się zgadzają', async () => {
      documentsRepository.findById.mockResolvedValue(buildDocument());
      const result = await service.getDocument('case-1', 'document-1', 'company-1');
      expect(result.id).toBe('document-1');
    });
  });

  describe('uploadDocument', () => {
    it('rzuca NotFoundException, gdy caseItemId nie należy do tej sprawy', async () => {
      await expect(service.uploadDocument('case-1', 'user-1', 'company-1', { ...uploadDto, caseItemId: 'brak' })).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('zapisuje Document+CaseHistory(DocumentAdded)+AuditLog w JEDNEJ transakcji, publikuje document.uploaded PO commicie', async () => {
      const document = buildDocument();
      documentsRepository.create.mockResolvedValue(document);

      const result = await service.uploadDocument('case-1', 'user-1', 'company-1', uploadDto);

      expect(result.id).toBe('document-1');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(documentsRepository.create).toHaveBeenCalledWith('case-1', 'user-1', uploadDto, TX_MARKER);
      expect(casesService.appendCaseHistory).toHaveBeenCalledWith(
        'case-1',
        expect.objectContaining({ action: 'DocumentAdded', visibleForCustomer: false }),
        TX_MARKER,
      );
      expect(auditRepository.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'DOCUMENT_UPLOADED', companyId: 'company-1' }), TX_MARKER);

      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.DOCUMENT_UPLOADED);
      expect(published.payload).toMatchObject({ documentId: 'document-1', caseItemId: null, category: DocumentCategory.Photo, visibility: DocumentVisibility.Internal, fileType: DocumentType.JPG });
    });

    it('visibleForCustomer=true w CaseHistory, gdy Document.visibility=Public (BR-079/BR-080)', async () => {
      documentsRepository.create.mockResolvedValue(buildDocument({ visibility: DocumentVisibility.Public }));
      await service.uploadDocument('case-1', 'user-1', 'company-1', { ...uploadDto, visibility: DocumentVisibility.Public });
      expect(casesService.appendCaseHistory).toHaveBeenCalledWith('case-1', expect.objectContaining({ visibleForCustomer: true }), TX_MARKER);
    });
  });

  describe('markInvalid', () => {
    it('rzuca NotFoundException, gdy dokument należy do innej sprawy', async () => {
      documentsRepository.findById.mockResolvedValue(buildDocument({ caseId: 'case-2' }));
      await expect(service.markInvalid('case-1', 'document-1', 'company-1', 'user-1', 'uszkodzony plik')).rejects.toThrow(NotFoundException);
    });

    it('IDEMPOTENTNE — jeśli dokument jest już Bledny, zwraca go bez zmian: brak Audit/CaseHistory/zdarzenia', async () => {
      documentsRepository.findById.mockResolvedValue(buildDocument({ status: DocumentStatus.Bledny }));

      const result = await service.markInvalid('case-1', 'document-1', 'company-1', 'user-1', 'ponowne zgłoszenie');

      expect(result.status).toBe(DocumentStatus.Bledny);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(auditRepository.create).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('oznacza dokument jako błędny w JEDNEJ transakcji (Document+CaseHistory+AuditLog), publikuje document.marked_invalid PO commicie', async () => {
      documentsRepository.findById.mockResolvedValue(buildDocument({ status: DocumentStatus.Aktywny }));
      documentsRepository.markInvalid.mockResolvedValue(buildDocument({ status: DocumentStatus.Bledny }));

      const result = await service.markInvalid('case-1', 'document-1', 'company-1', 'user-1', 'uszkodzony plik');

      expect(result.status).toBe(DocumentStatus.Bledny);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(documentsRepository.markInvalid).toHaveBeenCalledWith('document-1', TX_MARKER);
      expect(casesService.appendCaseHistory).toHaveBeenCalledWith(
        'case-1',
        expect.objectContaining({ action: 'DocumentMarkedInvalid', newValue: 'uszkodzony plik' }),
        TX_MARKER,
      );
      expect(auditRepository.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'DOCUMENT_MARKED_INVALID' }), TX_MARKER);

      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.DOCUMENT_MARKED_INVALID);
      expect(published.payload).toMatchObject({ documentId: 'document-1', reason: 'uszkodzony plik' });
    });
  });
});
