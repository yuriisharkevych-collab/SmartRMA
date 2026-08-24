import { Inject, Injectable } from '@nestjs/common';
import {
  CaseHistoryAction,
  CaseOriginType,
  DocumentStatus,
  Prisma,
  SubmissionMode,
} from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
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
import { IStorageService, STORAGE_SERVICE } from '../../storage/storage.interface';
import { CaseHandoffRepository } from './case-handoff.repository';
import { SendToPartnerDto } from './dto/send-to-partner.dto';
import { HandoffThreadEntity } from './entities/handoff-thread.entity';

/**
 * Faza 5 planu (Producent/Dystrybutor + Partnerzy B2B) — "sprawa płynie"
 * między organizacjami jako DWIE osobne, w pełni niezależne sprawy (Opcja B,
 * decyzja architektoniczna potwierdzona z właścicielem), połączone WYŁĄCZNIE
 * wąskim rekordem audytowym `CaseHandoff`. `sendToPartner` reużywa
 * `CasesService.create` DOKŁADNIE tym samym mechanizmem co każda inna sprawa
 * (CASE-004/005/006, numeracja, katalog statusów firmy — zero duplikacji
 * logiki) — zero zmian w `CasesRepository`/bramkach dostępu/istniejących 364
 * testach.
 */
@Injectable()
export class CaseHandoffService {
  constructor(
    private readonly caseHandoffRepository: CaseHandoffRepository,
    private readonly casesService: CasesService,
    private readonly casesRepository: CasesRepository,
    private readonly partnershipsService: PartnershipsService,
    private readonly customersService: CustomersService,
    private readonly productsService: ProductsService,
    private readonly companiesService: CompaniesService,
    private readonly caseStatusesService: CaseStatusesService,
    private readonly auditRepository: AuditRepository,
    private readonly documentsRepository: DocumentsRepository,
    private readonly documentsService: DocumentsService,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  /**
   * Wyłącznie strona Sklepu inicjuje przekazanie (`PartnershipsService.
   * assertActiveForShopWithBrand` wymusza `shopCompanyId===companyId`).
   * `actorUserId` (pracownik Sklepu) NIE istnieje w tenancie partnera — nowa
   * sprawa tam tworzona jest z `actorUserId=null`, dokładnie jak
   * `IntakeService.submitComplaint` (formularz publiczny — jedyny inny
   * istniejący "bezludzki" wołający `CasesService.create`), stąd
   * pre-rozwiązanie `productId` PRZED wywołaniem (patrz `resolveItemProduct`
   * w `CasesService`, ścieżka `productName` wymaga aktora-człowieka).
   */
  async sendToPartner(
    originCaseId: string,
    shopCompanyId: string,
    actorUserId: string,
    dto: SendToPartnerDto,
  ): Promise<{ targetCaseNumber: string }> {
    const originCase = await this.casesService.findById(originCaseId, shopCompanyId);

    const existingHandoff = await this.caseHandoffRepository.findByOriginCaseId(originCaseId);
    if (existingHandoff) {
      throw new AppException(
        ERROR_CODES.PARTNERSHIP_006.code,
        ERROR_CODES.PARTNERSHIP_006.message,
        ERROR_CODES.PARTNERSHIP_006.status,
      );
    }

    const partnership = await this.partnershipsService.assertActiveForShopWithBrand(
      dto.partnershipId,
      shopCompanyId,
      dto.brandId,
    );
    const targetCompanyId = partnership.distributorCompanyId;

    const targetBrand = await this.productsService.findBrandById(dto.brandId, targetCompanyId);
    const originCustomer = await this.customersService.findById(
      originCase.customerId,
      shopCompanyId,
    );
    const targetCustomer = await this.customersService.findOrCreatePublic(targetCompanyId, {
      firstName: originCustomer.firstName,
      lastName: originCustomer.lastName,
      phone: originCustomer.phone,
      email: originCustomer.email ?? '',
      address: originCustomer.address ?? undefined,
      city: originCustomer.city ?? undefined,
      postalCode: originCustomer.postalCode ?? undefined,
    });

    const items = [];
    for (const item of originCase.items) {
      const originProduct = await this.productsService.findById(item.productId, shopCompanyId);
      const targetProduct = await this.caseHandoffRepository.findOrCreateTargetProduct(
        targetCompanyId,
        targetBrand.manufacturerId,
        dto.brandId,
        originProduct.name,
      );
      items.push({
        productId: targetProduct.id,
        manufacturerId: targetBrand.manufacturerId,
        description: item.description,
        serialNumber: item.serialNumber ?? undefined,
        frameNumber: item.frameNumber ?? undefined,
        purchaseDate: item.purchaseDate ? item.purchaseDate.toISOString().slice(0, 10) : undefined,
        purchaseProofNumber: item.purchaseProofNumber ?? undefined,
      });
    }

    const targetCase = await this.casesService.create(
      targetCompanyId,
      {
        customerId: targetCustomer.id,
        complaintType: originCase.complaintType,
        submissionMode: SubmissionMode.PrzezSklep,
        source: originCase.source,
        requestedResolution: originCase.requestedResolution ?? items[0]?.description ?? '—',
        description: originCase.description ?? items[0]?.description,
        customerStatement: originCase.customerStatement ?? undefined,
        clientPortalEnabled: false,
        items,
      },
      null,
    );
    await this.casesRepository.setOriginType(targetCase.id, CaseOriginType.PartnerB2B);
    await this.copyDocuments(originCaseId, targetCase.id, targetCompanyId);

    const [originCompany, targetCompany] = await Promise.all([
      this.companiesService.findById(shopCompanyId),
      this.companiesService.findById(targetCompanyId),
    ]);

    const handoff = await this.caseHandoffRepository.create({
      originCaseId,
      originCompanyId: shopCompanyId,
      targetCaseId: targetCase.id,
      targetCompanyId,
      partnershipId: dto.partnershipId,
      createdByUserId: actorUserId,
    });

    await this.casesService.appendCaseHistory(originCaseId, {
      userId: actorUserId,
      action: CaseHistoryAction.HandoffSent,
      newValue: `${targetCompany.name}:${targetCase.caseNumber}`,
      visibleForCustomer: false,
    });
    await this.casesService.appendCaseHistory(targetCase.id, {
      userId: null,
      action: CaseHistoryAction.HandoffSent,
      newValue: `${originCompany.name}:${originCase.caseNumber}`,
      visibleForCustomer: false,
    });

    await this.auditRepository.create({
      companyId: shopCompanyId,
      userId: actorUserId,
      action: 'CASE_HANDOFF_SENT',
      entityType: 'CaseHandoff',
      entityId: handoff.id,
      newValue: {
        targetCompanyId,
        targetCaseId: targetCase.id,
        partnershipId: dto.partnershipId,
      } as Prisma.InputJsonValue,
    });

    return { targetCaseNumber: targetCase.caseNumber };
  }

  /**
   * Kopiuje aktywne dokumenty oryginalnej sprawy do nowo utworzonej sprawy u
   * partnera — bez tego dystrybutor widział dane klienta/pozycji, ale MUSIAŁ
   * prosić Sklep osobno o zdjęcia/dowód zakupu (zgłoszone jako brak przez
   * właściciela). Świadomie POMIJA dokumenty `status=Bledny` (nie ma sensu
   * przekazywać oznaczonych jako błędne) i nie przenosi `caseItemId` —
   * pozycje nowej sprawy mają własne, nowe id, a dokument dotyczący całej
   * sprawy (bez `caseItemId`) jest bezpiecznym, poprawnym odpowiednikiem.
   * Kategoria/widoczność kopiowane bez zmian — to ten sam plik, ta sama
   * intencja co do udostępnienia klientowi.
   */
  private async copyDocuments(
    originCaseId: string,
    targetCaseId: string,
    targetCompanyId: string,
  ): Promise<void> {
    const originDocuments = await this.documentsRepository.findAllForCase(originCaseId);
    for (const doc of originDocuments) {
      if (doc.status === DocumentStatus.Bledny) continue;
      const copied = await this.storageService.copy(
        doc.storagePath,
        targetCompanyId,
        targetCaseId,
        doc.fileName,
        doc.mimeType,
      );
      await this.documentsService.uploadDocument(targetCaseId, null, targetCompanyId, {
        fileName: copied.fileName,
        fileType: doc.fileType,
        mimeType: copied.mimeType,
        fileSize: copied.fileSize,
        storagePath: copied.storagePath,
        category: doc.category,
        visibility: doc.visibility,
      });
    }
  }

  /**
   * Wąski widok wątku (plan Fazy 5) — `casesService.findById` na WŁASNEJ
   * sprawie wołającego jest tu bramką IDOR (404, jeśli sprawa nie należy do
   * `companyId`); odczyt sprawy DRUGIEJ strony idzie przez
   * `CasesRepository.findByIdTrusted` (ten sam, ugruntowany wzorzec co
   * `PortalService` — "zaufanie" tu pochodzi z faktu, że `counterpartCaseId`
   * NIGDY nie trafia z parametru sterowanego przez klienta, tylko z
   * WŁASNEGO, już zweryfikowanego rekordu `CaseHandoff` tej sprawy), z
   * ręcznym wyliczeniem TYLKO 5 skalarnych pól — nigdy `items`/notatek/
   * wiadomości/pełnych danych klienta drugiej strony.
   */
  async getThread(caseId: string, companyId: string): Promise<HandoffThreadEntity | null> {
    await this.casesService.findById(caseId, companyId);

    const [asOrigin, asTarget] = await Promise.all([
      this.caseHandoffRepository.findByOriginCaseId(caseId),
      this.caseHandoffRepository.findByTargetCaseId(caseId),
    ]);
    if (!asOrigin && !asTarget) return null;

    const [sentTo, receivedFrom] = await Promise.all([
      asOrigin
        ? this.buildSide(asOrigin.targetCaseId, asOrigin.targetCompanyId, asOrigin.createdAt)
        : null,
      asTarget
        ? this.buildSide(asTarget.originCaseId, asTarget.originCompanyId, asTarget.createdAt)
        : null,
    ]);

    return { receivedFrom, sentTo };
  }

  /**
   * Faza 6 (trasy wieloetapowe) — sprawa "w środku" łańcucha (np.
   * Dystrybutor w Sklep→Dystrybutor→Producent) jest JEDNOCZEŚNIE celem
   * jednego przekazania i źródłem drugiego — `getThread` buduje oba
   * kierunki niezależnie tym samym wąskim odczytem.
   */
  private async buildSide(
    counterpartCaseId: string,
    counterpartCompanyId: string,
    handoffCreatedAt: Date,
  ): Promise<HandoffThreadEntity['sentTo']> {
    const counterpartCase = await this.casesRepository.findByIdTrusted(counterpartCaseId);
    if (!counterpartCase) return null;

    const [counterpartCompany, statusDef] = await Promise.all([
      this.companiesService.findById(counterpartCompanyId),
      this.caseStatusesService.findByCode(counterpartCase.status, counterpartCompanyId),
    ]);

    return {
      companyName: counterpartCompany.name,
      caseNumber: counterpartCase.caseNumber,
      status: counterpartCase.status,
      statusLabel: statusDef?.label ?? counterpartCase.status,
      decision: counterpartCase.decision,
      updatedAt: counterpartCase.statusChangedAt,
      createdAt: handoffCreatedAt,
    };
  }
}
