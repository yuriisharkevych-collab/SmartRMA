import { CaseOriginType, DocumentStatus, PartnershipStatus } from '@prisma/client';
import { AuditRepository } from '../audit/audit.repository';
import { CaseStatusesService } from '../case-statuses/case-statuses.service';
import { CasesRepository } from '../cases/cases.repository';
import { CasesService } from '../cases/cases.service';
import { CompaniesService } from '../companies/companies.service';
import { CustomersService } from '../customers/customers.service';
import { DocumentsRepository } from '../documents/documents.repository';
import { DocumentsService } from '../documents/documents.service';
import { PartnershipsService } from '../partnerships/partnerships.service';
import { ProductsService } from '../products/products.service';
import { IStorageService } from '../../storage/storage.interface';
import { CaseHandoffRepository } from './case-handoff.repository';
import { CaseHandoffService } from './case-handoff.service';

function buildOriginCase(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'origin-case-1',
    companyId: 'shop-1',
    caseNumber: 'RMA/2026/00001',
    customerId: 'customer-1',
    complaintType: 'Warranty',
    source: 'SklepStacjonarny',
    requestedResolution: 'Naprawa',
    description: 'Opis usterki.',
    customerStatement: null,
    items: [
      {
        id: 'item-1',
        productId: 'product-1',
        description: 'Rozdarcie.',
        serialNumber: 'SN-1',
        frameNumber: null,
        purchaseDate: null,
        purchaseProofNumber: 'PAR-1',
      },
    ],
    ...overrides,
  };
}

describe('CaseHandoffService', () => {
  let caseHandoffRepository: jest.Mocked<
    Pick<
      CaseHandoffRepository,
      'findByOriginCaseId' | 'findByTargetCaseId' | 'create' | 'findOrCreateTargetProduct'
    >
  >;
  let casesService: jest.Mocked<Pick<CasesService, 'findById' | 'create' | 'appendCaseHistory'>>;
  let casesRepository: jest.Mocked<Pick<CasesRepository, 'findByIdTrusted' | 'setOriginType'>>;
  let partnershipsService: jest.Mocked<Pick<PartnershipsService, 'assertActiveForShopWithBrand'>>;
  let customersService: jest.Mocked<Pick<CustomersService, 'findById' | 'findOrCreatePublic'>>;
  let productsService: jest.Mocked<Pick<ProductsService, 'findById' | 'findBrandById'>>;
  let companiesService: jest.Mocked<Pick<CompaniesService, 'findById'>>;
  let caseStatusesService: jest.Mocked<Pick<CaseStatusesService, 'findByCode'>>;
  let auditRepository: jest.Mocked<Pick<AuditRepository, 'create'>>;
  let documentsRepository: jest.Mocked<Pick<DocumentsRepository, 'findAllForCase'>>;
  let documentsService: jest.Mocked<Pick<DocumentsService, 'uploadDocument'>>;
  let storageService: jest.Mocked<Pick<IStorageService, 'copy'>>;
  let service: CaseHandoffService;

  beforeEach(() => {
    caseHandoffRepository = {
      findByOriginCaseId: jest.fn(),
      findByTargetCaseId: jest.fn(),
      create: jest.fn(),
      findOrCreateTargetProduct: jest.fn(),
    };
    casesService = { findById: jest.fn(), create: jest.fn(), appendCaseHistory: jest.fn() };
    casesRepository = { findByIdTrusted: jest.fn(), setOriginType: jest.fn() };
    partnershipsService = { assertActiveForShopWithBrand: jest.fn() };
    customersService = { findById: jest.fn(), findOrCreatePublic: jest.fn() };
    productsService = { findById: jest.fn(), findBrandById: jest.fn() };
    companiesService = { findById: jest.fn() };
    caseStatusesService = { findByCode: jest.fn() };
    auditRepository = { create: jest.fn() };
    documentsRepository = { findAllForCase: jest.fn().mockResolvedValue([]) };
    documentsService = { uploadDocument: jest.fn() };
    storageService = { copy: jest.fn() };

    service = new CaseHandoffService(
      caseHandoffRepository as unknown as CaseHandoffRepository,
      casesService as unknown as CasesService,
      casesRepository as unknown as CasesRepository,
      partnershipsService as unknown as PartnershipsService,
      customersService as unknown as CustomersService,
      productsService as unknown as ProductsService,
      companiesService as unknown as CompaniesService,
      caseStatusesService as unknown as CaseStatusesService,
      auditRepository as unknown as AuditRepository,
      documentsRepository as unknown as DocumentsRepository,
      documentsService as unknown as DocumentsService,
      storageService as unknown as IStorageService,
    );
  });

  describe('sendToPartner', () => {
    const dto = { partnershipId: 'partnership-1', brandId: 'brand-1' };

    it('PARTNERSHIP-006 — rzuca, gdy sprawa została już przekazana', async () => {
      casesService.findById.mockResolvedValue(buildOriginCase() as never);
      caseHandoffRepository.findByOriginCaseId.mockResolvedValue({ id: 'handoff-1' } as never);

      await expect(
        service.sendToPartner('origin-case-1', 'shop-1', 'user-1', dto),
      ).rejects.toMatchObject({
        code: 'PARTNERSHIP-006',
      });
      expect(partnershipsService.assertActiveForShopWithBrand).not.toHaveBeenCalled();
    });

    it('tworzy sprawę w tenancie partnera, ustawia originType=PartnerB2B, łączy CaseHandoff i dokleja historię po obu stronach', async () => {
      casesService.findById.mockResolvedValue(buildOriginCase() as never);
      caseHandoffRepository.findByOriginCaseId.mockResolvedValue(null);
      partnershipsService.assertActiveForShopWithBrand.mockResolvedValue({
        id: 'partnership-1',
        shopCompanyId: 'shop-1',
        distributorCompanyId: 'distributor-1',
        status: PartnershipStatus.Active,
      } as never);
      productsService.findBrandById.mockResolvedValue({
        id: 'brand-1',
        manufacturerId: 'manufacturer-target-1',
      } as never);
      customersService.findById.mockResolvedValue({
        id: 'customer-1',
        firstName: 'Anna',
        lastName: 'Kowalska',
        phone: '600100200',
        email: 'anna@example.com',
        address: null,
        city: null,
        postalCode: null,
      } as never);
      customersService.findOrCreatePublic.mockResolvedValue({ id: 'customer-target-1' } as never);
      productsService.findById.mockResolvedValue({ id: 'product-1', name: 'Sofa XL' } as never);
      caseHandoffRepository.findOrCreateTargetProduct.mockResolvedValue({
        id: 'product-target-1',
      } as never);
      casesService.create.mockResolvedValue({
        id: 'target-case-1',
        caseNumber: 'RMA/2026/00099',
      } as never);
      companiesService.findById.mockImplementation((id: string) =>
        Promise.resolve({ id, name: id === 'shop-1' ? 'DAWIDAM' : 'TekstylPro' } as never),
      );
      caseHandoffRepository.create.mockResolvedValue({ id: 'handoff-1' } as never);

      const result = await service.sendToPartner('origin-case-1', 'shop-1', 'user-1', dto);

      expect(partnershipsService.assertActiveForShopWithBrand).toHaveBeenCalledWith(
        'partnership-1',
        'shop-1',
        'brand-1',
      );
      expect(casesService.create).toHaveBeenCalledWith(
        'distributor-1',
        expect.objectContaining({
          customerId: 'customer-target-1',
          items: [
            expect.objectContaining({
              productId: 'product-target-1',
              manufacturerId: 'manufacturer-target-1',
            }),
          ],
        }),
        null,
      );
      expect(casesRepository.setOriginType).toHaveBeenCalledWith(
        'target-case-1',
        CaseOriginType.PartnerB2B,
      );
      expect(caseHandoffRepository.create).toHaveBeenCalledWith({
        originCaseId: 'origin-case-1',
        originCompanyId: 'shop-1',
        targetCaseId: 'target-case-1',
        targetCompanyId: 'distributor-1',
        partnershipId: 'partnership-1',
        createdByUserId: 'user-1',
      });
      expect(casesService.appendCaseHistory).toHaveBeenCalledWith(
        'origin-case-1',
        expect.objectContaining({ action: 'HandoffSent', userId: 'user-1' }),
      );
      expect(casesService.appendCaseHistory).toHaveBeenCalledWith(
        'target-case-1',
        expect.objectContaining({ action: 'HandoffSent', userId: null }),
      );
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'shop-1',
          action: 'CASE_HANDOFF_SENT',
          entityType: 'CaseHandoff',
        }),
      );
      expect(result).toEqual({ targetCaseNumber: 'RMA/2026/00099' });
    });

    it('kopiuje aktywne dokumenty oryginalnej sprawy do nowej sprawy partnera, pomija dokumenty status=Bledny', async () => {
      casesService.findById.mockResolvedValue(buildOriginCase() as never);
      caseHandoffRepository.findByOriginCaseId.mockResolvedValue(null);
      partnershipsService.assertActiveForShopWithBrand.mockResolvedValue({
        id: 'partnership-1',
        shopCompanyId: 'shop-1',
        distributorCompanyId: 'distributor-1',
        status: PartnershipStatus.Active,
      } as never);
      productsService.findBrandById.mockResolvedValue({
        id: 'brand-1',
        manufacturerId: 'manufacturer-target-1',
      } as never);
      customersService.findById.mockResolvedValue({
        id: 'customer-1',
        firstName: 'Anna',
        lastName: 'Kowalska',
        phone: '600100200',
        email: 'anna@example.com',
        address: null,
        city: null,
        postalCode: null,
      } as never);
      customersService.findOrCreatePublic.mockResolvedValue({ id: 'customer-target-1' } as never);
      productsService.findById.mockResolvedValue({ id: 'product-1', name: 'Sofa XL' } as never);
      caseHandoffRepository.findOrCreateTargetProduct.mockResolvedValue({
        id: 'product-target-1',
      } as never);
      casesService.create.mockResolvedValue({
        id: 'target-case-1',
        caseNumber: 'RMA/2026/00099',
      } as never);
      companiesService.findById.mockImplementation((id: string) =>
        Promise.resolve({ id, name: id === 'shop-1' ? 'DAWIDAM' : 'TekstylPro' } as never),
      );
      caseHandoffRepository.create.mockResolvedValue({ id: 'handoff-1' } as never);
      documentsRepository.findAllForCase.mockResolvedValue([
        {
          id: 'doc-1',
          storagePath: 'shop-1/origin-case-1/uuid-zdjecie.jpg',
          fileName: 'zdjecie.jpg',
          fileType: 'JPG',
          mimeType: 'image/jpeg',
          category: 'Photo',
          visibility: 'Public',
          status: DocumentStatus.Aktywny,
        },
        {
          id: 'doc-2',
          storagePath: 'shop-1/origin-case-1/uuid-blad.jpg',
          fileName: 'blad.jpg',
          fileType: 'JPG',
          mimeType: 'image/jpeg',
          category: 'Photo',
          visibility: 'Public',
          status: DocumentStatus.Bledny,
        },
      ] as never);
      storageService.copy.mockResolvedValue({
        storagePath: 'distributor-1/target-case-1/uuid-zdjecie.jpg',
        fileName: 'zdjecie.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1234,
      });

      await service.sendToPartner('origin-case-1', 'shop-1', 'user-1', dto);

      expect(storageService.copy).toHaveBeenCalledTimes(1);
      expect(storageService.copy).toHaveBeenCalledWith(
        'shop-1/origin-case-1/uuid-zdjecie.jpg',
        'distributor-1',
        'target-case-1',
        'zdjecie.jpg',
        'image/jpeg',
      );
      expect(documentsService.uploadDocument).toHaveBeenCalledTimes(1);
      expect(documentsService.uploadDocument).toHaveBeenCalledWith(
        'target-case-1',
        null,
        'distributor-1',
        expect.objectContaining({
          storagePath: 'distributor-1/target-case-1/uuid-zdjecie.jpg',
          fileName: 'zdjecie.jpg',
        }),
      );
    });
  });

  describe('getThread', () => {
    it('zwraca null, gdy sprawa nie jest stroną żadnego CaseHandoff', async () => {
      casesService.findById.mockResolvedValue({} as never);
      caseHandoffRepository.findByOriginCaseId.mockResolvedValue(null);
      caseHandoffRepository.findByTargetCaseId.mockResolvedValue(null);

      expect(await service.getThread('case-1', 'company-1')).toBeNull();
    });

    it('"sentTo" — sprawa jest ŹRÓDŁEM przekazania (wąski widok sprawy partnera, bez notatek/wiadomości/pełnych danych klienta)', async () => {
      casesService.findById.mockResolvedValue({} as never);
      caseHandoffRepository.findByOriginCaseId.mockResolvedValue({
        targetCaseId: 'target-case-1',
        targetCompanyId: 'distributor-1',
        createdAt: new Date('2026-01-01'),
      } as never);
      caseHandoffRepository.findByTargetCaseId.mockResolvedValue(null);
      casesRepository.findByIdTrusted.mockResolvedValue({
        caseNumber: 'RMA/2026/00099',
        status: 'Przyjeta',
        decision: null,
        statusChangedAt: new Date('2026-01-02'),
      } as never);
      companiesService.findById.mockResolvedValue({ name: 'TekstylPro' } as never);
      caseStatusesService.findByCode.mockResolvedValue({ label: 'Przyjęta' } as never);

      const result = await service.getThread('origin-case-1', 'shop-1');

      expect(result).toEqual({
        receivedFrom: null,
        sentTo: {
          companyName: 'TekstylPro',
          caseNumber: 'RMA/2026/00099',
          status: 'Przyjeta',
          statusLabel: 'Przyjęta',
          decision: null,
          updatedAt: new Date('2026-01-02'),
          createdAt: new Date('2026-01-01'),
        },
      });
    });

    it('"receivedFrom" — sprawa jest CELEM przekazania (widok od strony partnera)', async () => {
      casesService.findById.mockResolvedValue({} as never);
      caseHandoffRepository.findByOriginCaseId.mockResolvedValue(null);
      caseHandoffRepository.findByTargetCaseId.mockResolvedValue({
        originCaseId: 'origin-case-1',
        originCompanyId: 'shop-1',
        createdAt: new Date('2026-01-01'),
      } as never);
      casesRepository.findByIdTrusted.mockResolvedValue({
        caseNumber: 'RMA/2026/00001',
        status: 'Nowa',
        decision: null,
        statusChangedAt: new Date('2026-01-01'),
      } as never);
      companiesService.findById.mockResolvedValue({ name: 'DAWIDAM' } as never);
      caseStatusesService.findByCode.mockResolvedValue({ label: 'Nowa' } as never);

      const result = await service.getThread('target-case-1', 'distributor-1');

      expect(result?.sentTo).toBeNull();
      expect(result?.receivedFrom?.companyName).toBe('DAWIDAM');
    });

    it('sprawa "w środku" łańcucha (Dystrybutor) — pokazuje OBA kierunki naraz', async () => {
      casesService.findById.mockResolvedValue({} as never);
      caseHandoffRepository.findByOriginCaseId.mockResolvedValue({
        targetCaseId: 'producent-case-1',
        targetCompanyId: 'producent-1',
        createdAt: new Date('2026-01-03'),
      } as never);
      caseHandoffRepository.findByTargetCaseId.mockResolvedValue({
        originCaseId: 'shop-case-1',
        originCompanyId: 'shop-1',
        createdAt: new Date('2026-01-01'),
      } as never);
      casesRepository.findByIdTrusted.mockImplementation((id: string) =>
        Promise.resolve(
          id === 'producent-case-1'
            ? ({
                caseNumber: 'RMA/2026/00050',
                status: 'Nowa',
                decision: null,
                statusChangedAt: new Date('2026-01-03'),
              } as never)
            : ({
                caseNumber: 'RMA/2026/00001',
                status: 'Przyjeta',
                decision: null,
                statusChangedAt: new Date('2026-01-02'),
              } as never),
        ),
      );
      companiesService.findById.mockImplementation((id: string) =>
        Promise.resolve({ name: id === 'producent-1' ? 'Producent' : 'DAWIDAM' } as never),
      );
      caseStatusesService.findByCode.mockResolvedValue({ label: 'label' } as never);

      const result = await service.getThread('dystrybutor-case-1', 'dystrybutor-1');

      expect(result?.sentTo?.companyName).toBe('Producent');
      expect(result?.receivedFrom?.companyName).toBe('DAWIDAM');
    });
  });
});
