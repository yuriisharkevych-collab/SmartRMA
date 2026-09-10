import {
  CaseHistoryAction,
  CasePriority,
  ComplaintSource,
  ComplaintType,
  Decision,
  DocumentCategory,
  DocumentStatus,
  MessageChannel,
  MessageDirection,
  PortalStage,
  SenderType,
  SubmissionMode,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditRepository } from '../audit/audit.repository';
import { CaseHandoffRepository } from '../case-handoff/case-handoff.repository';
import { CaseStatusesService } from '../case-statuses/case-statuses.service';
import { CompaniesService } from '../companies/companies.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { ContractorsService } from '../contractors/contractors.service';
import { PartnershipsService } from '../partnerships/partnerships.service';
import { CustomersService } from '../customers/customers.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IEventBus } from '../../events/event-bus.interface';
import { EVENT_NAMES } from '../../events/event-names.const';
import { OrdersService } from '../orders/orders.service';
import { ProductsService } from '../products/products.service';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { DocumentsRepository } from '../documents/documents.repository';
import { ManufacturersService } from '../manufacturers/manufacturers.service';
import { UsersService } from '../users/users.service';
import { CaseConsentRepository } from './case-consent.repository';
import { CaseHistoryRepository } from './case-history.repository';
import { CaseItemsRepository } from './case-items.repository';
import { CasesRepository } from './cases.repository';
import { CasesService } from './cases.service';
import { CaseWithItems } from './mappers/case.mapper';
import { MessagesRepository } from './messages.repository';
import { NotesRepository } from './notes.repository';

/** Marker unikalny per test — pozwala sprawdzić, że repozytoria dostają DOKŁADNIE ten `tx`, którym `$transaction` wywołał callback (nie `this.prisma`). */
const TX_MARKER = { __tx: true } as const;

/**
 * Katalog 9 domyślnych statusów firmy (Status Workflow Refactor) — odzwierciedla
 * DOKŁADNIE wiersze seedowane przez `backfill-case-statuses.ts`. `CasesService` nie zna
 * już żadnej tabeli przejść — jedyne metadane sterujące zachowaniem to te pola.
 */
type StatusRow = {
  id: string;
  companyId: string;
  code: string;
  label: string;
  description: string | null;
  order: number;
  active: boolean;
  isFinal: boolean;
  isDefaultForNew: boolean;
  requiresConfirmation: boolean;
  requiredCheck: string | null;
  portalStage: PortalStage;
  defaultNextAction: string | null;
  notifyCustomerTemplateCode: string | null;
  isSystem: boolean;
};

const STATUS_CATALOG: StatusRow[] = [
  {
    id: 's1',
    companyId: 'company-1',
    code: 'Nowa',
    label: 'Nowa',
    description: null,
    order: 1,
    active: true,
    isFinal: false,
    isDefaultForNew: true,
    requiresConfirmation: false,
    requiredCheck: null,
    portalStage: PortalStage.Zgloszona,
    defaultNextAction: null,
    notifyCustomerTemplateCode: null,
    isSystem: true,
  },
  {
    id: 's2',
    companyId: 'company-1',
    code: 'Przyjeta',
    label: 'Przyjęta',
    description: null,
    order: 2,
    active: true,
    isFinal: false,
    isDefaultForNew: false,
    requiresConfirmation: false,
    requiredCheck: null,
    portalStage: PortalStage.Przyjeta,
    defaultNextAction: null,
    notifyCustomerTemplateCode: null,
    isSystem: true,
  },
  {
    id: 's3',
    companyId: 'company-1',
    code: 'PrzekazanaDoProducenta',
    label: 'Przekazana do producenta / dystrybutora',
    description: null,
    order: 3,
    active: true,
    isFinal: false,
    isDefaultForNew: false,
    requiresConfirmation: false,
    requiredCheck: 'CASE-002',
    portalStage: PortalStage.WTrakcie,
    defaultNextAction: null,
    notifyCustomerTemplateCode: 'case.sent_to_manufacturer.customer',
    isSystem: true,
  },
  {
    id: 's4',
    companyId: 'company-1',
    code: 'DecyzjaPozytywna',
    label: 'Decyzja pozytywna – oczekujemy na realizację',
    description: null,
    order: 4,
    active: true,
    isFinal: false,
    isDefaultForNew: false,
    requiresConfirmation: false,
    requiredCheck: 'CASE-009',
    portalStage: PortalStage.Decyzja,
    defaultNextAction: null,
    notifyCustomerTemplateCode: 'case.status_changed.customer',
    isSystem: true,
  },
  {
    id: 's5',
    companyId: 'company-1',
    code: 'TowarWyslanyDoSerwisu',
    label: 'Towar wysłany do serwisu',
    description: null,
    order: 5,
    active: true,
    isFinal: false,
    isDefaultForNew: false,
    requiresConfirmation: false,
    requiredCheck: null,
    portalStage: PortalStage.Decyzja,
    defaultNextAction: null,
    notifyCustomerTemplateCode: null,
    isSystem: true,
  },
  {
    id: 's6',
    companyId: 'company-1',
    code: 'TowarWrocilZSerwisu',
    label: 'Towar wrócił z serwisu – oczekuje na odbiór',
    description: null,
    order: 6,
    active: true,
    isFinal: false,
    isDefaultForNew: false,
    requiresConfirmation: false,
    requiredCheck: null,
    portalStage: PortalStage.Zakonczona,
    defaultNextAction: null,
    notifyCustomerTemplateCode: 'case.ready_for_pickup.customer',
    isSystem: true,
  },
  {
    id: 's7',
    companyId: 'company-1',
    code: 'DecyzjaNegatywna',
    label: 'Decyzja negatywna',
    description: null,
    order: 7,
    active: true,
    isFinal: false,
    isDefaultForNew: false,
    requiresConfirmation: true,
    requiredCheck: 'CASE-009',
    portalStage: PortalStage.Decyzja,
    defaultNextAction: null,
    notifyCustomerTemplateCode: 'case.status_changed.customer',
    isSystem: true,
  },
  {
    id: 's8',
    companyId: 'company-1',
    code: 'Zakonczona',
    label: 'Zakończona',
    description: null,
    order: 8,
    active: true,
    isFinal: true,
    isDefaultForNew: false,
    requiresConfirmation: true,
    requiredCheck: null,
    portalStage: PortalStage.Zakonczona,
    defaultNextAction: null,
    notifyCustomerTemplateCode: 'case.closed.customer',
    isSystem: true,
  },
  {
    id: 's9',
    companyId: 'company-1',
    code: 'ReklamacjaPonownie',
    label: 'Reklamacja zgłoszona ponownie',
    description: null,
    order: 9,
    active: true,
    isFinal: false,
    isDefaultForNew: false,
    requiresConfirmation: true,
    requiredCheck: null,
    portalStage: PortalStage.WTrakcie,
    defaultNextAction: null,
    notifyCustomerTemplateCode: null,
    isSystem: true,
  },
];

/**
 * Pozycja Z przypisanym producentem — domyślny `buildCase()` ma
 * `manufacturerId: null`, przy którym kontrola CASE-002 słusznie się pomija
 * (nie ma czyich wymagań sprawdzać). Testy wymagań producenta muszą użyć tej
 * wersji, inaczej sprawdzałyby ścieżkę „brak producenta", a nie regułę.
 */
const ITEMS_WITH_MANUFACTURER = [
  {
    id: 'item-1',
    caseId: 'case-1',
    orderItemId: null,
    productId: 'product-1',
    manufacturerId: 'manufacturer-1',
    description: 'Rysa',
    quantity: 1,
  },
] as unknown as CaseWithItems['items'];

function buildCase(overrides: Partial<CaseWithItems> = {}): CaseWithItems {
  return {
    id: 'case-1',
    companyId: 'company-1',
    shopId: null,
    caseNumber: 'RMA/2026/00001',
    customerId: 'customer-1',
    ownerId: null,
    complaintType: ComplaintType.Warranty,
    submissionMode: SubmissionMode.PrzezSklep,
    source: ComplaintSource.SklepStacjonarny,
    requestedResolution: 'Naprawa',
    description: 'Opis usterki',
    customerStatement: null,
    status: 'Nowa',
    priority: CasePriority.Normalny,
    decision: null,
    decisionAt: null,
    decisionByUserId: null,
    decisionIsPositive: null,
    decisionContractorId: null,
    decisionJustification: null,
    decisionFulfillmentMethod: null,
    decisionManufacturerResponse: null,
    nextAction: null,
    nextActionDueDate: null,
    requiresManagerApproval: false,
    isException: false,
    deliveryAddress: null,
    courierRequested: false,
    preparationFeeAccepted: false,
    clientPortalEnabled: false,
    clientAccessCodeHash: null,
    clientAccessTokenHash: null,
    clientAccessTokenUsed: false,
    clientLastLoginAt: null,
    createdAt: new Date('2026-01-01'),
    closedAt: null,
    cancelledAt: null,
    archivedAt: null,
    items: [
      {
        id: 'item-1',
        caseId: 'case-1',
        orderItemId: null,
        productId: 'product-1',
        manufacturerId: null,
        description: 'Rysa',
        quantity: 1,
      },
    ],
    _count: { messages: 0 },
    ...overrides,
  } as unknown as CaseWithItems;
}

describe('CasesService', () => {
  // `jest.Mock` zamiast `jest.Mocked<Pick<PrismaService, '$transaction'>>` — `$transaction`
  // ma w typach Prismy dwie przeciążone sygnatury (tablica operacji / callback), których
  // `jest.Mocked` nie potrafi odwzorować. Atrapa i tak trafia do serwisu przez
  // `as unknown as PrismaService`, więc ścisły typ na deklaracji niczego nie chronił.
  let prisma: { $transaction: jest.Mock };
  let casesRepository: jest.Mocked<
    Pick<
      CasesRepository,
      | 'findAllForCompany'
      | 'search'
      | 'findById'
      | 'findByIdForUpdate'
      | 'findMaxSequenceInYear'
      | 'create'
      | 'update'
      | 'updateStatus'
      | 'setDecision'
      | 'assignOwner'
      | 'deleteLogisticsForCase'
      | 'hardDelete'
    >
  >;
  let caseStatusesService: jest.Mocked<
    Pick<CaseStatusesService, 'findActiveForCompany' | 'findActiveByCode' | 'findByCode'>
  >;
  let caseHistoryRepository: jest.Mocked<
    Pick<CaseHistoryRepository, 'addEntry' | 'findByCaseId' | 'deleteAllForCase'>
  >;
  let notesRepository: jest.Mocked<
    Pick<NotesRepository, 'create' | 'findByCaseId' | 'deleteAllForCase'>
  >;
  let messagesRepository: jest.Mocked<
    Pick<
      MessagesRepository,
      | 'create'
      | 'findByCaseId'
      | 'findByCaseIdWithDocuments'
      | 'markAllReadForCase'
      | 'deleteAllForCase'
    >
  >;
  let auditRepository: jest.Mocked<Pick<AuditRepository, 'create'>>;
  let customersService: jest.Mocked<Pick<CustomersService, 'findById'>>;
  let companiesService: jest.Mocked<Pick<CompaniesService, 'findShopById'>>;
  let productsService: jest.Mocked<
    Pick<ProductsService, 'findById' | 'searchProducts' | 'createProduct'>
  >;
  let ordersService: jest.Mocked<Pick<OrdersService, 'findOrderItemById'>>;
  let usersService: jest.Mocked<Pick<UsersService, 'findById'>>;
  let manufacturersService: jest.Mocked<
    Pick<
      ManufacturersService,
      'findById' | 'resolveRequirementsForItem' | 'resolveAttentionOverridesResolver'
    >
  >;
  let companySettingsService: jest.Mocked<Pick<CompanySettingsService, 'getSettings'>>;
  let contractorsService: jest.Mocked<Pick<ContractorsService, 'findById'>>;
  let partnershipsService: jest.Mocked<Pick<PartnershipsService, 'assertActiveShopPartner'>>;
  let caseItemsRepository: jest.Mocked<
    Pick<CaseItemsRepository, 'findByIdForCompany' | 'deleteAllForCase'>
  >;
  let caseConsentRepository: jest.Mocked<Pick<CaseConsentRepository, 'deleteAllForCase'>>;
  let documentsRepository: jest.Mocked<
    Pick<DocumentsRepository, 'findAllForCase' | 'findById' | 'deleteAllForCase'>
  >;
  let eventBus: jest.Mocked<IEventBus>;
  let notificationsService: jest.Mocked<
    Pick<NotificationsService, 'createNotificationFromTemplate' | 'deleteAllForCase'>
  >;
  let config: jest.Mocked<Pick<ConfigService, 'get'>>;
  let caseHandoffRepository: jest.Mocked<Pick<CaseHandoffRepository, 'deleteAllForCase'>>;
  let service: CasesService;

  beforeEach(() => {
    prisma = { $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(TX_MARKER)) };
    casesRepository = {
      findAllForCompany: jest.fn(),
      search: jest.fn(),
      findById: jest.fn(),
      findByIdForUpdate: jest.fn(),
      findMaxSequenceInYear: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      setDecision: jest.fn(),
      assignOwner: jest.fn(),
      deleteLogisticsForCase: jest.fn(),
      hardDelete: jest.fn(),
    };
    caseStatusesService = {
      findActiveForCompany: jest.fn().mockResolvedValue(STATUS_CATALOG),
      findActiveByCode: jest
        .fn()
        .mockImplementation((code: string) =>
          Promise.resolve(STATUS_CATALOG.find((s) => s.code === code && s.active) ?? null),
        ),
      findByCode: jest
        .fn()
        .mockImplementation((code: string) =>
          Promise.resolve(STATUS_CATALOG.find((s) => s.code === code) ?? null),
        ),
    };
    caseHistoryRepository = {
      addEntry: jest.fn().mockResolvedValue({ id: 'history-1' }),
      findByCaseId: jest.fn(),
      deleteAllForCase: jest.fn(),
    };
    notesRepository = {
      create: jest.fn().mockResolvedValue({ id: 'note-1' }),
      findByCaseId: jest.fn(),
      deleteAllForCase: jest.fn(),
    };
    messagesRepository = {
      create: jest.fn(),
      findByCaseId: jest.fn(),
      findByCaseIdWithDocuments: jest.fn(),
      markAllReadForCase: jest.fn(),
      deleteAllForCase: jest.fn(),
    };
    auditRepository = { create: jest.fn() };
    customersService = { findById: jest.fn().mockResolvedValue({ id: 'customer-1' }) };
    companiesService = { findShopById: jest.fn().mockResolvedValue({ id: 'shop-1' }) };
    productsService = {
      findById: jest.fn().mockResolvedValue({ id: 'product-1' }),
      searchProducts: jest.fn().mockResolvedValue([]),
      createProduct: jest
        .fn()
        .mockResolvedValue({ id: 'product-new-1', manufacturerId: 'manufacturer-1' }),
    };
    ordersService = { findOrderItemById: jest.fn().mockResolvedValue({ id: 'order-item-1' }) };
    usersService = { findById: jest.fn().mockResolvedValue({ id: 'user-2' }) };
    // Domyślnie producent NIC nie wymaga — poszczególne testy podmieniają to,
    // żeby sprawdzić CASE-004/005/006 i CASE-002.
    manufacturersService = {
      findById: jest.fn().mockResolvedValue({
        id: 'manufacturer-1',
        requiresSerialNumber: false,
        requiresFrameNumber: false,
        requiresProofOfPurchase: false,
        minPhotos: 0,
        requiresVideo: false,
      }),
      // Etap 3 — brak marki w tych testach (żaden nie ustawia `brandId`), więc
      // resolver ma się zachować DOKŁADNIE jak dawny `findById` wprost: deleguje
      // do niego, żeby istniejące `mockResolvedValueOnce`/`mockResolvedValue` na
      // `findById` per test nadal sterowały wynikiem bez zmian w tych testach.
      resolveRequirementsForItem: jest.fn(
        async (manufacturerId: string | null | undefined, _brandId, companyId: string) => {
          if (!manufacturerId) return null;
          return manufacturersService.findById(manufacturerId, companyId);
        },
      ),
      resolveAttentionOverridesResolver: jest.fn().mockResolvedValue(() => ({
        statusStaleDaysOverride: null,
        caseAgeStaleDaysOverride: null,
      })),
    };
    caseItemsRepository = {
      findByIdForCompany: jest.fn().mockResolvedValue({ id: 'item-1', caseId: 'case-1' }),
      deleteAllForCase: jest.fn(),
    };
    caseConsentRepository = { deleteAllForCase: jest.fn() };
    documentsRepository = {
      findAllForCase: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      deleteAllForCase: jest.fn(),
    };
    companySettingsService = {
      getSettings: jest.fn().mockResolvedValue({
        caseNumberPrefix: 'RMA',
        caseNumberPadding: 5,
        caseNumberResetYearly: true,
      }),
    };
    contractorsService = { findById: jest.fn().mockResolvedValue({ id: 'contractor-1' }) };
    partnershipsService = { assertActiveShopPartner: jest.fn().mockResolvedValue(undefined) };
    eventBus = { publish: jest.fn(), publishAll: jest.fn() };
    notificationsService = {
      createNotificationFromTemplate: jest.fn(),
      deleteAllForCase: jest.fn(),
    };
    config = { get: jest.fn().mockReturnValue(['http://localhost:5173']) };
    caseHandoffRepository = { deleteAllForCase: jest.fn() };

    service = new CasesService(
      prisma as unknown as PrismaService,
      casesRepository as unknown as CasesRepository,
      caseStatusesService as unknown as CaseStatusesService,
      caseHistoryRepository as unknown as CaseHistoryRepository,
      notesRepository as unknown as NotesRepository,
      messagesRepository as unknown as MessagesRepository,
      auditRepository as unknown as AuditRepository,
      customersService as unknown as CustomersService,
      companiesService as unknown as CompaniesService,
      productsService as unknown as ProductsService,
      ordersService as unknown as OrdersService,
      usersService as unknown as UsersService,
      manufacturersService as unknown as ManufacturersService,
      companySettingsService as unknown as CompanySettingsService,
      contractorsService as unknown as ContractorsService,
      partnershipsService as unknown as PartnershipsService,
      caseItemsRepository as unknown as CaseItemsRepository,
      caseConsentRepository as unknown as CaseConsentRepository,
      documentsRepository as unknown as DocumentsRepository,
      eventBus,
      notificationsService as unknown as NotificationsService,
      config as unknown as ConfigService,
      caseHandoffRepository as unknown as CaseHandoffRepository,
    );
  });

  const createDto = {
    customerId: 'customer-1',
    complaintType: ComplaintType.Warranty,
    requestedResolution: 'Naprawa',
    description: 'Opis usterki',
    items: [{ productId: 'product-1', description: 'Rysa' }],
  };

  /**
   * Wymagania producenta (`Manufacturer.requiresXxx`, `minPhotos`,
   * `requiresVideo`) muszą być egzekwowane PO STRONIE SERWERA — wcześniej
   * były tylko zapisywane w bazie i sprawdzane w formularzu, więc dało się
   * je ominąć wywołaniem API z pominięciem UI.
   */
  describe('wymagania producenta', () => {
    beforeEach(() => {
      productsService.findById.mockResolvedValue({
        id: 'product-1',
        manufacturerId: 'manufacturer-1',
      } as never);
    });

    it('CASE-004 — brak numeru seryjnego, gdy producent go wymaga', async () => {
      manufacturersService.findById.mockResolvedValue({
        requiresSerialNumber: true,
        requiresFrameNumber: false,
        requiresProofOfPurchase: false,
        minPhotos: 0,
        requiresVideo: false,
      } as never);

      await expect(service.create('company-1', createDto, 'user-1')).rejects.toMatchObject({
        code: 'CASE-004',
      });
      expect(casesRepository.create).not.toHaveBeenCalled();
    });

    it('CASE-005 — brak numeru ramy, gdy producent go wymaga', async () => {
      manufacturersService.findById.mockResolvedValue({
        requiresSerialNumber: false,
        requiresFrameNumber: true,
        requiresProofOfPurchase: false,
        minPhotos: 0,
        requiresVideo: false,
      } as never);

      await expect(service.create('company-1', createDto, 'user-1')).rejects.toMatchObject({
        code: 'CASE-005',
      });
    });

    it('CASE-006 — brak dowodu zakupu, gdy producent go wymaga', async () => {
      manufacturersService.findById.mockResolvedValue({
        requiresSerialNumber: false,
        requiresFrameNumber: false,
        requiresProofOfPurchase: true,
        minPhotos: 0,
        requiresVideo: false,
      } as never);

      await expect(service.create('company-1', createDto, 'user-1')).rejects.toMatchObject({
        code: 'CASE-006',
      });
    });

    it('przepuszcza, gdy komplet danych jest podany', async () => {
      manufacturersService.findById.mockResolvedValue({
        requiresSerialNumber: true,
        requiresFrameNumber: true,
        requiresProofOfPurchase: true,
        minPhotos: 0,
        requiresVideo: false,
      } as never);
      casesRepository.create.mockResolvedValue(buildCase());

      await expect(
        service.create(
          'company-1',
          {
            ...createDto,
            items: [
              {
                productId: 'product-1',
                description: 'Rysa',
                serialNumber: 'SN-1',
                frameNumber: 'FR-1',
                purchaseProofNumber: 'FV/1',
              },
            ],
          },
          'user-1',
        ),
      ).resolves.toBeDefined();
    });

    it('CASE-002 — blokuje przejście wymagające kompletu dokumentów i wylicza braki', async () => {
      const before = buildCase({
        status: 'Przyjeta',
        complaintType: ComplaintType.Warranty,
        items: ITEMS_WITH_MANUFACTURER,
      });
      casesRepository.findByIdForUpdate.mockResolvedValue(before);
      manufacturersService.findById.mockResolvedValue({
        requiresSerialNumber: false,
        requiresFrameNumber: false,
        requiresProofOfPurchase: false,
        minPhotos: 2,
        requiresVideo: true,
      } as never);
      documentsRepository.findAllForCase.mockResolvedValue([]);

      await expect(
        service.changeStatus('case-1', 'company-1', 'PrzekazanaDoProducenta', 'user-1', [
          PERMISSIONS.CASES_STATUS_CHANGE,
        ]),
      ).rejects.toMatchObject({ code: 'CASE-002' });
      expect(casesRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('CASE-002 — dokument oznaczony jako błędny NIE zalicza wymogu (BR-020)', async () => {
      const before = buildCase({
        status: 'Przyjeta',
        complaintType: ComplaintType.Warranty,
        items: ITEMS_WITH_MANUFACTURER,
      });
      casesRepository.findByIdForUpdate.mockResolvedValue(before);
      manufacturersService.findById.mockResolvedValue({
        requiresSerialNumber: false,
        requiresFrameNumber: false,
        requiresProofOfPurchase: false,
        minPhotos: 1,
        requiresVideo: false,
      } as never);
      documentsRepository.findAllForCase.mockResolvedValue([
        { category: DocumentCategory.Photo, status: DocumentStatus.Bledny },
      ] as never);

      await expect(
        service.changeStatus('case-1', 'company-1', 'PrzekazanaDoProducenta', 'user-1', [
          PERMISSIONS.CASES_STATUS_CHANGE,
        ]),
      ).rejects.toMatchObject({ code: 'CASE-002' });
    });

    it('CASE-002 — przepuszcza, gdy komplet aktywnych dokumentów jest dołączony', async () => {
      const before = buildCase({
        status: 'Przyjeta',
        complaintType: ComplaintType.Warranty,
        items: ITEMS_WITH_MANUFACTURER,
      });
      casesRepository.findByIdForUpdate.mockResolvedValue(before);
      casesRepository.updateStatus.mockResolvedValue(
        buildCase({ status: 'PrzekazanaDoProducenta' }),
      );
      manufacturersService.findById.mockResolvedValue({
        requiresSerialNumber: false,
        requiresFrameNumber: false,
        requiresProofOfPurchase: false,
        minPhotos: 1,
        requiresVideo: true,
      } as never);
      documentsRepository.findAllForCase.mockResolvedValue([
        { category: DocumentCategory.Photo, status: DocumentStatus.Aktywny },
        { category: DocumentCategory.Video, status: DocumentStatus.Aktywny },
      ] as never);

      await expect(
        service.changeStatus('case-1', 'company-1', 'PrzekazanaDoProducenta', 'user-1', [
          PERMISSIONS.CASES_STATUS_CHANGE,
        ]),
      ).resolves.toBeDefined();
      expect(casesRepository.updateStatus).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('rzuca CASE-012, gdy sprawa nie istnieje (odczyt zwykły, bez blokady)', async () => {
      casesRepository.findById.mockResolvedValue(null);
      await expect(service.findById('brak', 'company-1')).rejects.toMatchObject({
        code: 'CASE-012',
      });
      expect(casesRepository.findByIdForUpdate).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('rzuca CASE-007, gdy BezposrednioDoProducenta łączy się ze StatutoryWarranty (BR-097)', async () => {
      await expect(
        service.create(
          'company-1',
          {
            ...createDto,
            complaintType: ComplaintType.StatutoryWarranty,
            submissionMode: SubmissionMode.BezposrednioDoProducenta,
          },
          'user-1',
        ),
      ).rejects.toMatchObject({ code: 'CASE-007' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rzuca VALIDATION-001, gdy brak description poza ścieżką monitorowaną (BR-105)', async () => {
      await expect(
        service.create('company-1', { ...createDto, description: '' }, 'user-1'),
      ).rejects.toMatchObject({ code: 'VALIDATION-001' });
    });

    it('weryfikuje ownerId, gdy podane — 404, gdy użytkownik nie istnieje', async () => {
      usersService.findById.mockRejectedValue(new Error('not found'));
      await expect(
        service.create('company-1', { ...createDto, ownerId: 'brak' }, 'user-1'),
      ).rejects.toThrow();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('weryfikuje istnienie customerId/product/orderItem PRZED transakcją — 404, gdy klient nie istnieje', async () => {
      customersService.findById.mockRejectedValue(new Error('not found'));
      await expect(service.create('company-1', createDto, 'user-1')).rejects.toThrow();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('tworzy sprawę WEWNĄTRZ jednej transakcji (Case+CaseHistory+AuditLog), potem publikuje case.created, status = domyślny z katalogu firmy', async () => {
      const caseRecord = buildCase();
      casesRepository.create.mockResolvedValue(caseRecord);

      const result = await service.create('company-1', createDto, 'user-1');

      expect(result.id).toBe('case-1');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(casesRepository.create).toHaveBeenCalledWith(
        'company-1',
        expect.any(String),
        expect.objectContaining({ status: 'Nowa' }),
        TX_MARKER,
      );
      expect(caseHistoryRepository.addEntry).toHaveBeenCalledWith(
        'case-1',
        expect.objectContaining({ action: CaseHistoryAction.CaseCreated }),
        TX_MARKER,
      );
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CASE_CREATED' }),
        TX_MARKER,
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.CASE_CREATED);
    });

    it('rzuca błąd generyczny, gdy katalog firmy nie ma statusu isDefaultForNew (błąd konfiguracji, nie da się naprawić przez pracownika)', async () => {
      caseStatusesService.findActiveForCompany.mockResolvedValue(
        STATUS_CATALOG.map((s) => ({ ...s, isDefaultForNew: false })),
      );
      await expect(service.create('company-1', createDto, 'user-1')).rejects.toThrow();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('CASE-013 — rzuca po wyczerpaniu retry na kolizję numeru sprawy (P2002), każda próba to osobna transakcja', async () => {
      const conflict = Object.assign(new Error('unique'), { code: 'P2002' });
      casesRepository.create.mockRejectedValue(conflict);
      await expect(service.create('company-1', createDto, 'user-1')).rejects.toMatchObject({
        code: 'CASE-013',
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    });

    /**
     * Model spoza katalogu (`productName` zamiast `productId`) — musi działać bez `products.manage`
     * (Pracownik ma tylko `cases.create`), patrz UAT/RBAC.md §3: wcześniej frontend wołał
     * `POST /products` wprost, więc Pracownik dostawał RBAC-001 przy każdej reklamacji na
     * nieskatalogowany model.
     */
    describe('produkt spoza katalogu (productName)', () => {
      const dtoWithProductName = {
        ...createDto,
        items: [
          { productName: 'Nowy Model X', manufacturerId: 'manufacturer-1', description: 'Rysa' },
        ],
      };

      it('znajduje istniejący produkt po nazwie+producencie (bez rozróżniania wielkości liter) — nie tworzy duplikatu', async () => {
        productsService.searchProducts.mockResolvedValue([
          {
            id: 'product-existing-1',
            manufacturerId: 'manufacturer-1',
            name: 'nowy model x',
          } as never,
        ]);
        casesRepository.create.mockResolvedValue(buildCase());

        await service.create('company-1', dtoWithProductName, 'user-1');

        expect(productsService.createProduct).not.toHaveBeenCalled();
        expect(casesRepository.create).toHaveBeenCalledWith(
          'company-1',
          expect.any(String),
          expect.objectContaining({
            items: [expect.objectContaining({ productId: 'product-existing-1' })],
          }),
          TX_MARKER,
        );
      });

      it('tworzy nowy produkt SERWISOWO (nie przez POST /products), gdy nazwa nie pasuje do niczego istniejącego', async () => {
        productsService.searchProducts.mockResolvedValue([]);
        casesRepository.create.mockResolvedValue(buildCase());

        await service.create('company-1', dtoWithProductName, 'user-1');

        expect(productsService.createProduct).toHaveBeenCalledWith(
          'company-1',
          { manufacturerId: 'manufacturer-1', brandId: undefined, name: 'Nowy Model X' },
          'user-1',
        );
        expect(casesRepository.create).toHaveBeenCalledWith(
          'company-1',
          expect.any(String),
          expect.objectContaining({
            items: [expect.objectContaining({ productId: 'product-new-1' })],
          }),
          TX_MARKER,
        );
      });

      it('VALIDATION-001 — rzuca, gdy brakuje zarówno productId, jak i productName', async () => {
        await expect(
          service.create(
            'company-1',
            {
              ...createDto,
              items: [{ manufacturerId: 'manufacturer-1', description: 'Rysa' } as never],
            },
            'user-1',
          ),
        ).rejects.toMatchObject({ code: 'VALIDATION-001' });
      });

      it('VALIDATION-001 — rzuca, gdy productName podany bez manufacturerId', async () => {
        await expect(
          service.create(
            'company-1',
            {
              ...createDto,
              items: [{ productName: 'Model bez producenta', description: 'Rysa' } as never],
            },
            'user-1',
          ),
        ).rejects.toMatchObject({ code: 'VALIDATION-001' });
      });
    });
  });

  describe('update', () => {
    it('CASE-008 — rzuca, gdy sprawa jest w statusie końcowym (odczytana pod blokadą)', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: 'Zakonczona' }));
      await expect(
        service.update('case-1', 'company-1', { priority: CasePriority.Wysoki }, 'user-1'),
      ).rejects.toMatchObject({ code: 'CASE-008' });
    });

    it('CASE-014 — rzuca przy zmianie complaintType, gdy sprawa poszła dalej niż Przyjęta (order > 2)', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(
        buildCase({ status: 'PrzekazanaDoProducenta', complaintType: ComplaintType.Warranty }),
      );
      await expect(
        service.update(
          'case-1',
          'company-1',
          { complaintType: ComplaintType.StatutoryWarranty },
          'user-1',
        ),
      ).rejects.toMatchObject({ code: 'CASE-014' });
    });

    it('zapisuje CaseHistory(PriorityChanged) wewnątrz tej samej transakcji, gdy priority się zmienia', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(
        buildCase({ priority: CasePriority.Normalny }),
      );
      casesRepository.update.mockResolvedValue(buildCase({ priority: CasePriority.Wysoki }));

      await service.update('case-1', 'company-1', { priority: CasePriority.Wysoki }, 'user-1');

      expect(casesRepository.update).toHaveBeenCalledWith(
        'case-1',
        { priority: CasePriority.Wysoki },
        TX_MARKER,
      );
      expect(caseHistoryRepository.addEntry).toHaveBeenCalledWith(
        'case-1',
        expect.objectContaining({ action: CaseHistoryAction.PriorityChanged }),
        TX_MARKER,
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.CASE_UPDATED);
    });

    it('NIE zapisuje audytu/zdarzenia, gdy nic się nie zmieniło', async () => {
      const before = buildCase();
      casesRepository.findByIdForUpdate.mockResolvedValue(before);
      casesRepository.update.mockResolvedValue(before);

      // `?? undefined` — `Case.description` jest nullable (BR-105, ścieżka monitorowana),
      // a `UpdateCaseDto.description` to `string | undefined`. Intencja testu (ta sama
      // wartość co w bazie → brak wpisu audytu) jest zachowana: `diffChangedFields`
      // pomija zarówno `undefined`, jak i wartość równą bieżącej.
      await service.update(
        'case-1',
        'company-1',
        { description: before.description ?? undefined },
        'user-1',
      );

      expect(auditRepository.create).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });
  });

  describe('changeStatus', () => {
    it('IDEMPOTENTNE — wybór TEGO SAMEGO statusu jest no-opem: brak zapisu, audytu, zdarzenia', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: 'Nowa' }));

      const result = await service.changeStatus('case-1', 'company-1', 'Nowa', 'user-1', [
        PERMISSIONS.CASES_STATUS_CHANGE,
      ]);

      expect(result.status).toBe('Nowa');
      expect(casesRepository.updateStatus).not.toHaveBeenCalled();
      expect(auditRepository.create).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('CASE-016 — rzuca, gdy docelowy kod statusu nie istnieje/jest nieaktywny w katalogu firmy', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: 'Nowa' }));
      await expect(
        service.changeStatus('case-1', 'company-1', 'NieznanyStatus', 'user-1', [
          PERMISSIONS.CASES_STATUS_CHANGE,
        ]),
      ).rejects.toMatchObject({ code: 'CASE-016' });
    });

    it('RBAC-001 — rzuca, gdy brak uprawnienia cases.status.change', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: 'Nowa' }));
      await expect(
        service.changeStatus('case-1', 'company-1', 'Przyjeta', 'user-1', []),
      ).rejects.toMatchObject({ code: 'RBAC-001' });
    });

    it('CASE-009 — rzuca przy próbie przejścia w status wymagający ustawionej decyzji, gdy decyzji brak', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(
        buildCase({ status: 'PrzekazanaDoProducenta', decision: null }),
      );
      await expect(
        service.changeStatus('case-1', 'company-1', 'DecyzjaPozytywna', 'user-1', [
          PERMISSIONS.CASES_STATUS_CHANGE,
        ]),
      ).rejects.toMatchObject({ code: 'CASE-009' });
    });

    it('CRITICAL PHILOSOPHY CHANGE — pracownik może wybrać KAŻDY aktywny status w dowolnym momencie (bez tabeli przejść): Nowa → Zakończona bezpośrednio', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: 'Nowa' }));
      casesRepository.updateStatus.mockResolvedValue(buildCase({ status: 'Zakonczona' }));

      await expect(
        service.changeStatus('case-1', 'company-1', 'Zakonczona', 'user-1', [
          PERMISSIONS.CASES_STATUS_CHANGE,
        ]),
      ).resolves.toBeDefined();
    });

    it('nietypowe cofnięcie — Decyzja negatywna → Przyjęta — NIE jest blokowane (tylko UI ostrzega)', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(
        buildCase({ status: 'DecyzjaNegatywna' }),
      );
      casesRepository.updateStatus.mockResolvedValue(buildCase({ status: 'Przyjeta' }));

      await expect(
        service.changeStatus('case-1', 'company-1', 'Przyjeta', 'user-1', [
          PERMISSIONS.CASES_STATUS_CHANGE,
        ]),
      ).resolves.toBeDefined();
    });

    it('legalne przejście: cały zapis (status+CaseHistory+AuditLog) dzieje się w JEDNEJ transakcji pod blokadą wiersza', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: 'Nowa' }));
      casesRepository.updateStatus.mockResolvedValue(buildCase({ status: 'Przyjeta' }));

      await service.changeStatus('case-1', 'company-1', 'Przyjeta', 'user-1', [
        PERMISSIONS.CASES_STATUS_CHANGE,
      ]);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(casesRepository.findByIdForUpdate).toHaveBeenCalledWith(
        'case-1',
        'company-1',
        TX_MARKER,
      );
      expect(casesRepository.updateStatus).toHaveBeenCalledWith(
        'case-1',
        'Przyjeta',
        expect.any(Object),
        TX_MARKER,
      );
      expect(caseHistoryRepository.addEntry).toHaveBeenCalledWith(
        'case-1',
        expect.objectContaining({
          action: CaseHistoryAction.StatusChanged,
          previousValue: 'Nowa',
          newValue: 'Przyjeta',
        }),
        TX_MARKER,
      );
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CASE_STATUS_CHANGED' }),
        TX_MARKER,
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.CASE_STATUS_CHANGED);
      expect(published.payload).toMatchObject({
        previousStatus: 'Nowa',
        newStatus: 'Przyjeta',
        cancelled: false,
      });
    });

    it('przejście do statusu końcowego (Zakończona) zapisuje CaseHistoryAction.CaseClosed (nie generyczny StatusChanged) i ustawia closedAt', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(
        buildCase({ status: 'TowarWrocilZSerwisu' }),
      );
      casesRepository.updateStatus.mockResolvedValue(buildCase({ status: 'Zakonczona' }));

      await service.changeStatus('case-1', 'company-1', 'Zakonczona', 'user-1', [
        PERMISSIONS.CASES_STATUS_CHANGE,
      ]);

      expect(caseHistoryRepository.addEntry).toHaveBeenCalledWith(
        'case-1',
        expect.objectContaining({ action: CaseHistoryAction.CaseClosed }),
        TX_MARKER,
      );
      expect(casesRepository.updateStatus).toHaveBeenCalledWith(
        'case-1',
        'Zakonczona',
        expect.objectContaining({ closedAt: expect.any(Date) }),
        TX_MARKER,
      );
    });

    it('BUG ZNALEZIONY W CHECKPOINCIE 8 (§17/§18 — reaktywacja sprawy) — przejście Zakończona → Przyjęta czyści closedAt/cancelledAt/archivedAt z poprzedniego zamknięcia zamiast zostawiać je jako martwe dane na aktywnej sprawie', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(
        buildCase({
          status: 'Zakonczona',
          closedAt: new Date('2026-01-01'),
          cancelledAt: new Date('2026-01-01'),
          archivedAt: new Date('2026-01-02'),
        }),
      );
      casesRepository.updateStatus.mockResolvedValue(buildCase({ status: 'Przyjeta' }));

      await service.changeStatus('case-1', 'company-1', 'Przyjeta', 'user-1', [
        PERMISSIONS.CASES_STATUS_CHANGE,
      ]);

      expect(casesRepository.updateStatus).toHaveBeenCalledWith(
        'case-1',
        'Przyjeta',
        expect.objectContaining({ closedAt: null, cancelledAt: null, archivedAt: null }),
        TX_MARKER,
      );
    });
  });

  describe('cancel', () => {
    it('CASE-011 — rzuca bez powodu', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: 'Nowa' }));
      await expect(
        service.cancel('case-1', 'company-1', '', 'user-1', [PERMISSIONS.CASES_CANCEL]),
      ).rejects.toMatchObject({ code: 'CASE-011' });
    });

    it('RBAC-001 — rzuca, gdy brak cases.cancel (dokładniejsze uprawnienie niż cases.status.change)', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: 'Nowa' }));
      await expect(
        service.cancel('case-1', 'company-1', 'Klient zrezygnował', 'user-1', [
          PERMISSIONS.CASES_STATUS_CHANGE,
        ]),
      ).rejects.toMatchObject({ code: 'RBAC-001' });
    });

    it('z powodem: zapisuje Note z powodem ORAZ CaseHistory(CaseCancelled), ustawia cancelledAt+closedAt, wewnątrz tej samej transakcji', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: 'Nowa' }));
      casesRepository.updateStatus.mockResolvedValue(
        buildCase({ status: 'Zakonczona', cancelledAt: new Date() }),
      );

      await service.cancel('case-1', 'company-1', 'Klient zrezygnował', 'user-1', [
        PERMISSIONS.CASES_CANCEL,
      ]);

      expect(notesRepository.create).toHaveBeenCalledWith(
        'case-1',
        'user-1',
        expect.stringContaining('Klient zrezygnował'),
        TX_MARKER,
      );
      expect(caseHistoryRepository.addEntry).toHaveBeenCalledWith(
        'case-1',
        expect.objectContaining({ action: CaseHistoryAction.CaseCancelled }),
        TX_MARKER,
      );
      expect(casesRepository.updateStatus).toHaveBeenCalledWith(
        'case-1',
        'Zakonczona',
        expect.objectContaining({ cancelledAt: expect.any(Date), closedAt: expect.any(Date) }),
        TX_MARKER,
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.payload).toMatchObject({ cancelled: true });
    });

    it('IDEMPOTENTNE — jeśli sprawa jest już Zakończona, zwraca ją bez zmian: brak audytu, brak zdarzenia', async () => {
      const alreadyClosed = buildCase({ status: 'Zakonczona' });
      casesRepository.findByIdForUpdate.mockResolvedValue(alreadyClosed);

      const result = await service.cancel('case-1', 'company-1', 'powtórne żądanie', 'user-1', [
        PERMISSIONS.CASES_CANCEL,
      ]);

      expect(result.status).toBe('Zakonczona');
      expect(casesRepository.updateStatus).not.toHaveBeenCalled();
      expect(auditRepository.create).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });
  });

  describe('archive', () => {
    it('RBAC-001 — rzuca, gdy brak cases.archive (sprawdzane PRZED odczytem pod blokadą)', async () => {
      await expect(service.archive('case-1', 'company-1', 'user-1', [])).rejects.toMatchObject({
        code: 'RBAC-001',
      });
      expect(casesRepository.findByIdForUpdate).not.toHaveBeenCalled();
    });

    it('CASE-017 — rzuca, gdy sprawa nie jest w statusie końcowym (archiwizacja NIE zmienia już statusu)', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(
        buildCase({ status: 'Nowa', archivedAt: null }),
      );
      await expect(
        service.archive('case-1', 'company-1', 'user-1', [PERMISSIONS.CASES_ARCHIVE]),
      ).rejects.toMatchObject({ code: 'CASE-017' });
    });

    it('IDEMPOTENTNE — jeśli sprawa ma już ustawione archivedAt, zwraca ją bez zmian', async () => {
      const alreadyArchived = buildCase({
        status: 'Zakonczona',
        archivedAt: new Date('2026-01-05'),
      });
      casesRepository.findByIdForUpdate.mockResolvedValue(alreadyArchived);

      const result = await service.archive('case-1', 'company-1', 'user-1', [
        PERMISSIONS.CASES_ARCHIVE,
      ]);

      expect(result.archivedAt).toEqual(alreadyArchived.archivedAt);
      expect(casesRepository.updateStatus).not.toHaveBeenCalled();
      expect(auditRepository.create).not.toHaveBeenCalled();
    });

    it('z Zakończona (bez archivedAt): legalne, ustawia archivedAt, NIE zmienia statusu, zapisuje CaseArchived, brak zdarzenia domenowego', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(
        buildCase({ status: 'Zakonczona', archivedAt: null }),
      );
      casesRepository.updateStatus.mockResolvedValue(
        buildCase({ status: 'Zakonczona', archivedAt: new Date() }),
      );

      const result = await service.archive('case-1', 'company-1', 'user-1', [
        PERMISSIONS.CASES_ARCHIVE,
      ]);

      expect(result.status).toBe('Zakonczona');
      expect(result.archivedAt).not.toBeNull();
      expect(casesRepository.updateStatus).toHaveBeenCalledWith(
        'case-1',
        'Zakonczona',
        expect.objectContaining({ archivedAt: expect.any(Date) }),
        TX_MARKER,
      );
      expect(caseHistoryRepository.addEntry).toHaveBeenCalledWith(
        'case-1',
        expect.objectContaining({ action: CaseHistoryAction.CaseArchived }),
        TX_MARKER,
      );
      expect(eventBus.publish).not.toHaveBeenCalled();
    });
  });

  describe('hardDelete', () => {
    it('CASE-012 — rzuca NotFoundException, gdy sprawa nie istnieje dla tej firmy (IDOR-safe findById)', async () => {
      casesRepository.findById.mockResolvedValue(null);
      await expect(service.hardDelete('case-1', 'company-1', 'user-1')).rejects.toThrow();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('kasuje w kolejności zależności FK (dzieci przed rodzicem), wewnątrz jednej transakcji, i zapisuje AuditLog PRZED usunięciem Case', async () => {
      casesRepository.findById.mockResolvedValue(
        buildCase({ caseNumber: 'RMA/2026/00001', status: 'Nowa', customerId: 'customer-1' }),
      );

      await service.hardDelete('case-1', 'company-1', 'user-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(messagesRepository.deleteAllForCase).toHaveBeenCalledWith('case-1', TX_MARKER);
      expect(documentsRepository.deleteAllForCase).toHaveBeenCalledWith('case-1', TX_MARKER);
      expect(notificationsService.deleteAllForCase).toHaveBeenCalledWith('case-1', TX_MARKER);
      expect(caseHistoryRepository.deleteAllForCase).toHaveBeenCalledWith('case-1', TX_MARKER);
      expect(notesRepository.deleteAllForCase).toHaveBeenCalledWith('case-1', TX_MARKER);
      expect(casesRepository.deleteLogisticsForCase).toHaveBeenCalledWith('case-1', TX_MARKER);
      expect(caseConsentRepository.deleteAllForCase).toHaveBeenCalledWith('case-1', TX_MARKER);
      expect(caseItemsRepository.deleteAllForCase).toHaveBeenCalledWith('case-1', TX_MARKER);
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-1',
          userId: 'user-1',
          action: 'CASE_DELETED',
          entityType: 'Case',
          entityId: 'case-1',
          previousValue: { caseNumber: 'RMA/2026/00001', status: 'Nowa', customerId: 'customer-1' },
        }),
        TX_MARKER,
      );
      expect(casesRepository.hardDelete).toHaveBeenCalledWith('case-1', TX_MARKER);

      // AuditLog zapisany PRZED skasowaniem wiersza Case, nie po (kolejność wywołań mocków).
      const auditCallOrder = auditRepository.create.mock.invocationCallOrder[0];
      const hardDeleteCallOrder = casesRepository.hardDelete.mock.invocationCallOrder[0];
      expect(auditCallOrder).toBeLessThan(hardDeleteCallOrder);
    });

    // Scenariusz A (audyt CaseHandoff) — sprawa BEZ żadnego przekazania: `deleteAllForCase`
    // jest wołane bezwarunkowo (to `deleteMany`, więc brak dopasowanego wiersza to
    // bezpieczny no-op — patrz doc-comment `CaseHandoffRepository.deleteAllForCase`),
    // zachowanie identyczne jak przed tą zmianą dla pozostałych tabel.
    it('scenariusz A — sprawa bez przekazania: usuwa jak dotychczas, `CaseHandoff.deleteAllForCase` woła bez efektu (no-op)', async () => {
      casesRepository.findById.mockResolvedValue(
        buildCase({ caseNumber: 'RMA/2026/00001', status: 'Nowa', customerId: 'customer-1' }),
      );

      await service.hardDelete('case-1', 'company-1', 'user-1');

      expect(caseHandoffRepository.deleteAllForCase).toHaveBeenCalledWith('case-1', TX_MARKER);
      expect(casesRepository.hardDelete).toHaveBeenCalledWith('case-1', TX_MARKER);
    });

    // Scenariusze B/C (audyt CaseHandoff) — na poziomie serwisu (repozytoria zamockowane)
    // liczy się WYŁĄCZNIE to, że `hardDelete` woła `caseHandoffRepository.deleteAllForCase`
    // PRZED `casesRepository.hardDelete`, niezależnie od tego, czy usuwana sprawa jest
    // `originCaseId` czy `targetCaseId` przekazania — samą logikę "usuwa TYLKO łącznik,
    // nigdy drugiej sprawy" gwarantuje kształt zapytania w `CaseHandoffRepository`
    // (`OR: [{originCaseId},{targetCaseId}]`, `deleteMany` na `CaseHandoff`, nigdy na
    // `Case`) — patrz `case-handoff.repository.spec.ts` i test e2e (scenariusz D) dla
    // dowodu na prawdziwej bazie, że druga sprawa i jej dane przeżywają.
    it('scenariusz B/C — CaseHandoff.deleteAllForCase wołane PRZED usunięciem samej sprawy (niezależnie od kierunku przekazania)', async () => {
      casesRepository.findById.mockResolvedValue(
        buildCase({ caseNumber: 'RMA/2026/00001', status: 'Nowa', customerId: 'customer-1' }),
      );

      await service.hardDelete('case-1', 'company-1', 'user-1');

      const handoffCallOrder = caseHandoffRepository.deleteAllForCase.mock.invocationCallOrder[0];
      const hardDeleteCallOrder = casesRepository.hardDelete.mock.invocationCallOrder[0];
      expect(handoffCallOrder).toBeLessThan(hardDeleteCallOrder);
    });

    // Scenariusz E (rollback) — ten sam wzorzec atrapy `$transaction`, co reszta tego
    // pliku (`(callback) => callback(TX_MARKER)`): błąd w KTÓRYMKOLWIEK kroku wewnątrz
    // callbacku odrzuca cały `hardDelete` i przerywa dalsze wywołania w tej samej
    // sekwencji — `casesRepository.hardDelete` (usunięcie wiersza `Case`) nigdy nie jest
    // osiągane, jeśli usunięcie `CaseHandoff` (krok wcześniejszy) się nie powiedzie.
    // Prawdziwy rollback na poziomie Postgresa (atomiczność `$transaction`) jest
    // własnością samej Prismy, nie logiki tego serwisu — nie ma potrzeby go tu
    // symulować głębiej, zgodnie z poleceniem "nie komplikuj".
    it('scenariusz E — błąd przy usuwaniu CaseHandoff przerywa hardDelete PRZED usunięciem sprawy (bez częściowego skasowania)', async () => {
      casesRepository.findById.mockResolvedValue(
        buildCase({ caseNumber: 'RMA/2026/00001', status: 'Nowa', customerId: 'customer-1' }),
      );
      caseHandoffRepository.deleteAllForCase.mockRejectedValueOnce(new Error('DB boom'));

      await expect(service.hardDelete('case-1', 'company-1', 'user-1')).rejects.toThrow('DB boom');

      expect(casesRepository.hardDelete).not.toHaveBeenCalled();
      expect(auditRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('setDecision', () => {
    it('CASE-010 — rzuca przy próbie ustawienia ZwrotSrodkow bez cases.decision.approve', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(
        buildCase({ status: 'PrzekazanaDoProducenta' }),
      );
      await expect(
        service.setDecision('case-1', 'company-1', Decision.ZwrotSrodkow, 'user-1', [
          PERMISSIONS.CASES_DECISION_SET,
        ]),
      ).rejects.toMatchObject({ code: 'CASE-010' });
    });

    it('RBAC-001 — rzuca dla decyzji innej niż ZwrotSrodkow bez cases.decision.set/.approve', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(
        buildCase({
          status: 'PrzekazanaDoProducenta',
          complaintType: ComplaintType.StatutoryWarranty,
        }),
      );
      await expect(
        service.setDecision('case-1', 'company-1', Decision.Naprawa, 'user-1', []),
      ).rejects.toMatchObject({ code: 'RBAC-001' });
    });

    it('CASE-008 — rzuca, gdy sprawa jest w statusie końcowym (Status Workflow Refactor — decyzję można ustawić z KAŻDEGO aktywnego statusu, ale nie z finalnego)', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: 'Zakonczona' }));
      await expect(
        service.setDecision('case-1', 'company-1', Decision.Naprawa, 'user-1', [
          PERMISSIONS.CASES_DECISION_SET,
        ]),
      ).rejects.toMatchObject({ code: 'CASE-008' });
    });

    it('ustawia decision pod blokadą wiersza, requiresManagerApproval=true dla ZwrotSrodkow, publikuje case.decision_set', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(
        buildCase({ status: 'PrzekazanaDoProducenta' }),
      );
      casesRepository.setDecision.mockResolvedValue(
        buildCase({
          status: 'PrzekazanaDoProducenta',
          decision: Decision.ZwrotSrodkow,
        }),
      );

      await service.setDecision('case-1', 'company-1', Decision.ZwrotSrodkow, 'user-1', [
        PERMISSIONS.CASES_DECISION_APPROVE,
      ]);

      expect(casesRepository.findByIdForUpdate).toHaveBeenCalledWith(
        'case-1',
        'company-1',
        TX_MARKER,
      );
      expect(casesRepository.setDecision).toHaveBeenCalledWith(
        'case-1',
        Decision.ZwrotSrodkow,
        'user-1',
        true,
        'Zmień status zgodnie z podjętą decyzją.',
        expect.objectContaining({ decisionIsPositive: true }),
        TX_MARKER,
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.CASE_DECISION_SET);
      expect(published.payload).toMatchObject({
        decision: Decision.ZwrotSrodkow,
        requiresManagerApproval: true,
      });
    });

    it('decisionIsPositive=false wyłącznie dla Odrzucenie — przekazuje strukturalne pola producenta (kontrahent/uzasadnienie/sposób realizacji)', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(
        buildCase({ status: 'PrzekazanaDoProducenta' }),
      );
      casesRepository.setDecision.mockResolvedValue(
        buildCase({ status: 'PrzekazanaDoProducenta', decision: Decision.Odrzucenie }),
      );

      await service.setDecision(
        'case-1',
        'company-1',
        Decision.Odrzucenie,
        'user-1',
        [PERMISSIONS.CASES_DECISION_SET],
        {
          decisionContractorId: 'contractor-1',
          decisionJustification: 'Uszkodzenie mechaniczne spoza gwarancji',
        },
      );

      expect(casesRepository.setDecision).toHaveBeenCalledWith(
        'case-1',
        Decision.Odrzucenie,
        'user-1',
        false,
        'Zmień status zgodnie z podjętą decyzją.',
        expect.objectContaining({
          decisionIsPositive: false,
          decisionContractorId: 'contractor-1',
          decisionJustification: 'Uszkodzenie mechaniczne spoza gwarancji',
        }),
        TX_MARKER,
      );
    });
  });

  describe('assignOwner', () => {
    it('weryfikuje istnienie ownerId PRZED transakcją — propaguje błąd, gdy użytkownik nie istnieje', async () => {
      usersService.findById.mockRejectedValue(new Error('not found'));
      await expect(service.assignOwner('case-1', 'company-1', 'brak', 'user-1')).rejects.toThrow();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('CASE-008 — rzuca dla sprawy w statusie końcowym', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: 'Zakonczona' }));
      await expect(
        service.assignOwner('case-1', 'company-1', 'user-2', 'user-1'),
      ).rejects.toMatchObject({
        code: 'CASE-008',
      });
    });

    it('zapisuje CaseHistory(OwnerChanged, visibleForCustomer=false — BR-104) i publikuje case.owner_changed', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ ownerId: null }));
      casesRepository.assignOwner.mockResolvedValue(buildCase({ ownerId: 'user-2' }));

      await service.assignOwner('case-1', 'company-1', 'user-2', 'user-1');

      expect(usersService.findById).toHaveBeenCalledWith('user-2', 'company-1');
      expect(caseHistoryRepository.addEntry).toHaveBeenCalledWith(
        'case-1',
        expect.objectContaining({
          action: CaseHistoryAction.OwnerChanged,
          visibleForCustomer: false,
        }),
        TX_MARKER,
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.CASE_OWNER_CHANGED);
      expect(published.payload).toMatchObject({ previousOwnerId: null, newOwnerId: 'user-2' });
    });
  });

  describe('addNote', () => {
    it('CASE-008 — rzuca dla sprawy w statusie końcowym', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: 'Zakonczona' }));
      await expect(service.addNote('case-1', 'company-1', 'user-1', 'Tresc')).rejects.toMatchObject(
        {
          code: 'CASE-008',
        },
      );
    });

    it('zapisuje Note, CaseHistory(NoteAdded) i publikuje case.note_added', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase());
      await service.addNote('case-1', 'company-1', 'user-1', 'Tresc notatki');

      expect(notesRepository.create).toHaveBeenCalledWith(
        'case-1',
        'user-1',
        'Tresc notatki',
        TX_MARKER,
      );
      expect(caseHistoryRepository.addEntry).toHaveBeenCalledWith(
        'case-1',
        expect.objectContaining({ action: CaseHistoryAction.NoteAdded, visibleForCustomer: false }),
        TX_MARKER,
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.CASE_NOTE_ADDED);
      expect(published.payload).toMatchObject({ noteId: 'note-1' });
    });
  });

  describe('sendMessage', () => {
    it('CASE-008 — rzuca dla sprawy w statusie końcowym', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: 'Zakonczona' }));
      await expect(
        service.sendMessage('case-1', 'company-1', 'user-1', {
          channel: MessageChannel.Email,
          content: 'Tresc',
        }),
      ).rejects.toMatchObject({ code: 'CASE-008' });
    });

    it('wymusza senderType=Employee/direction=Outbound i publikuje case.message_added', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase());
      messagesRepository.create.mockResolvedValue({
        id: 'message-1',
        caseId: 'case-1',
        senderType: SenderType.Employee,
        senderUserId: 'user-1',
        direction: MessageDirection.Outbound,
        channel: MessageChannel.Email,
        subject: null,
        content: 'Tresc',
        sentAt: new Date(),
        readAt: null,
      });

      await service.sendMessage('case-1', 'company-1', 'user-1', {
        channel: MessageChannel.Email,
        content: 'Tresc',
      });

      expect(messagesRepository.create).toHaveBeenCalledWith(
        'case-1',
        expect.objectContaining({
          senderType: SenderType.Employee,
          direction: MessageDirection.Outbound,
        }),
        TX_MARKER,
      );
      const published = eventBus.publish.mock.calls[0][0];
      expect(published.eventName).toBe(EVENT_NAMES.CASE_MESSAGE_ADDED);
    });

    it('documentIds — dołącza załączniki, gdy dokumenty należą do tej sprawy', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase());
      documentsRepository.findById.mockResolvedValue({
        id: 'doc-1',
        caseId: 'case-1',
        fileName: 'zdjecie.jpg',
      } as never);
      messagesRepository.create.mockResolvedValue({
        id: 'message-1',
        caseId: 'case-1',
        senderType: SenderType.Employee,
        senderUserId: 'user-1',
        direction: MessageDirection.Outbound,
        channel: MessageChannel.Portal,
        subject: null,
        content: 'Tresc z zalacznikiem',
        sentAt: new Date(),
        readAt: null,
      });

      const result = await service.sendMessage('case-1', 'company-1', 'user-1', {
        channel: MessageChannel.Portal,
        content: 'Tresc z zalacznikiem',
        documentIds: ['doc-1'],
      });

      expect(messagesRepository.create).toHaveBeenCalledWith(
        'case-1',
        expect.objectContaining({ documentIds: ['doc-1'] }),
        TX_MARKER,
      );
      expect(result.documents).toEqual([{ id: 'doc-1', fileName: 'zdjecie.jpg' }]);
    });

    it('documentIds — rzuca 404, gdy dokument nie należy do tej sprawy', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase());
      documentsRepository.findById.mockResolvedValue({
        id: 'doc-1',
        caseId: 'inna-sprawa',
        fileName: 'zdjecie.jpg',
      } as never);

      await expect(
        service.sendMessage('case-1', 'company-1', 'user-1', {
          channel: MessageChannel.Portal,
          content: 'Tresc',
          documentIds: ['doc-1'],
        }),
      ).rejects.toThrow();
    });
  });

  describe('markMessagesRead', () => {
    it('sprawdza dzierżawę (IDOR) przez findCaseOrThrow, potem oznacza wiadomości od klienta jako przeczytane', async () => {
      casesRepository.findById.mockResolvedValue(buildCase());

      await service.markMessagesRead('case-1', 'company-1');

      expect(casesRepository.findById).toHaveBeenCalledWith('case-1', 'company-1');
      expect(messagesRepository.markAllReadForCase).toHaveBeenCalledWith(
        'case-1',
        MessageDirection.Inbound,
      );
    });

    it('CASE-012 — rzuca, gdy sprawa nie należy do tej firmy (lub nie istnieje)', async () => {
      casesRepository.findById.mockResolvedValue(null);

      await expect(service.markMessagesRead('case-1', 'company-1')).rejects.toMatchObject({
        code: 'CASE-012',
      });
      expect(messagesRepository.markAllReadForCase).not.toHaveBeenCalled();
    });
  });

  describe('requestInfo', () => {
    it('RBAC-001 — rzuca, gdy brak cases.infoRequest.send', async () => {
      await expect(
        service.requestInfo(
          'case-1',
          'company-1',
          { requestedItems: ['numer seryjny'], messageText: 'Brakuje.' },
          'user-1',
          [],
        ),
      ).rejects.toMatchObject({ code: 'RBAC-001' });
      expect(casesRepository.findByIdForUpdate).not.toHaveBeenCalled();
    });

    it('CASE-008 — rzuca dla sprawy w statusie końcowym', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: 'Zakonczona' }));
      await expect(
        service.requestInfo(
          'case-1',
          'company-1',
          { requestedItems: ['numer seryjny'], messageText: 'Brakuje.' },
          'user-1',
          [PERMISSIONS.CASES_INFO_REQUEST_SEND],
        ),
      ).rejects.toMatchObject({ code: 'CASE-008' });
    });

    it('tworzy Message (Wiadomości/Portal Klienta), NIE zmienia statusu (Status Workflow Refactor — usunięty auto-resume), publikuje TYLKO case.info_requested', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: 'Nowa' }));
      messagesRepository.create.mockResolvedValue({
        id: 'message-1',
        caseId: 'case-1',
        senderType: SenderType.Employee,
        senderUserId: 'user-1',
        direction: MessageDirection.Outbound,
        channel: MessageChannel.Portal,
        subject: null,
        content: 'Prosimy o uzupełnienie: numer seryjny.\n\nBrakuje numeru seryjnego.',
        sentAt: new Date(),
        readAt: null,
      });

      const result = await service.requestInfo(
        'case-1',
        'company-1',
        { requestedItems: ['numer seryjny'], messageText: 'Brakuje numeru seryjnego.' },
        'user-1',
        [PERMISSIONS.CASES_INFO_REQUEST_SEND],
      );

      expect(result.status).toBe('Nowa');
      expect(casesRepository.updateStatus).not.toHaveBeenCalled();
      expect(messagesRepository.create).toHaveBeenCalledWith(
        'case-1',
        expect.objectContaining({
          senderType: SenderType.Employee,
          direction: MessageDirection.Outbound,
          content: 'Prosimy o uzupełnienie: numer seryjny.\n\nBrakuje numeru seryjnego.',
        }),
        TX_MARKER,
      );
      const published = eventBus.publish.mock.calls.map((c) => c[0].eventName);
      expect(published).toContain(EVENT_NAMES.CASE_INFO_REQUESTED);
      expect(published).not.toContain(EVENT_NAMES.CASE_MESSAGE_ADDED);
    });
  });

  describe('Blokada współbieżności (proxy jednostkowy)', () => {
    it('każda mutacja pojedynczej sprawy przechodzi przez findByIdForUpdate (blokada wiersza) wewnątrz $transaction, nigdy przez zwykły findById', async () => {
      casesRepository.findByIdForUpdate.mockResolvedValue(buildCase({ status: 'Nowa' }));
      casesRepository.updateStatus.mockResolvedValue(buildCase({ status: 'Przyjeta' }));

      await service.changeStatus('case-1', 'company-1', 'Przyjeta', 'user-1', [
        PERMISSIONS.CASES_STATUS_CHANGE,
      ]);

      expect(casesRepository.findByIdForUpdate).toHaveBeenCalledWith(
        'case-1',
        'company-1',
        TX_MARKER,
      );
      expect(casesRepository.findById).not.toHaveBeenCalled();
    });
  });
});
