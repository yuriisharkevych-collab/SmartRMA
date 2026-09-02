import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CaseContactPreference,
  ComplaintSource,
  ComplaintType,
  NotificationChannel,
  NotificationRecipientType,
  SubmissionMode,
} from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { CaseConsentRepository } from '../cases/case-consent.repository';
import { CasesService } from '../cases/cases.service';
import { GDPR_CLAUSE_VERSION } from '../cases/gdpr.constants';
import { CompaniesService } from '../companies/companies.service';
import { CustomersService } from '../customers/customers.service';
import { ManufacturersService } from '../manufacturers/manufacturers.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PartnershipsService } from '../partnerships/partnerships.service';
import { PortalService } from '../portal/portal.service';
import { IStorageService, STORAGE_SERVICE } from '../../storage/storage.interface';
import {
  BrandContactPreference,
  BrandPartnerRequestType,
  BrandReporterType,
  SubmitBrandComplaintDto,
} from './dto/submit-brand-complaint.dto';
import { SubmitPublicComplaintDto } from './dto/submit-public-complaint.dto';
import { PublicCompanyBrandingEntity } from './entities/public-company-branding.entity';
import { PublicComplaintCreatedEntity } from './entities/public-complaint-created.entity';
import {
  PublicBrandEntity,
  PublicProductCategoryEntity,
  PublicProductEntity,
  PublicRequirementsEntity,
} from './entities/public-catalog.entity';
import { PublicManufacturerEntity } from './entities/public-manufacturer.entity';
import { PublicPartnerEntity } from './entities/public-partner.entity';
import { IntakeRepository } from './intake.repository';

/** `CasesService.create` wymaga `requestedResolution` dla zgłoszeń trybu `PrzezSklep` (patrz WORKFLOW.md §3.2) — formularz publiczny celowo o nie nie pyta, więc tu wypełniamy neutralną wartością do ustalenia przez pracownika. */
const UNSPECIFIED_RESOLUTION_NOTE =
  'Klient nie wskazał oczekiwanego rozwiązania — do ustalenia podczas weryfikacji zgłoszenia.';

/** `CasesService.create` wymaga `complaintType` — klient formularza publicznego nie rozróżnia gwarancji od rękojmi (na życzenie właściciela), więc startowa wartość jest neutralnym domysłem; pracownik koryguje ją podczas weryfikacji (`PATCH /cases/:id`, `CasesService.update`, CASE-014 blokuje zmianę po tym etapie). */
const UNSPECIFIED_COMPLAINT_TYPE = ComplaintType.Warranty;

/**
 * Publiczny Formularz Reklamacyjny — pierwszy krok całego workflow SmartRMA:
 * klient bez logowania zakłada nową reklamację. Orkiestruje ISTNIEJĄCE,
 * przetestowane serwisy (`CustomersService`/`CasesService`/`PortalService`/
 * `NotificationsService`) zamiast duplikować ich logikę — ten moduł tylko
 * wie, jak dojść do `companyId` bez sesji (przez `orgSlug` w adresie —
 * każda organizacja, Sklep i Producent/Dystrybutor, ma WŁASNY formularz pod
 * własnym slugiem) i jak złożyć te wywołania w jedną, spójną operację.
 */
@Injectable()
export class IntakeService {
  constructor(
    private readonly intakeRepository: IntakeRepository,
    private readonly companiesService: CompaniesService,
    private readonly manufacturersService: ManufacturersService,
    private readonly customersService: CustomersService,
    private readonly casesService: CasesService,
    private readonly portalService: PortalService,
    private readonly caseConsentRepository: CaseConsentRepository,
    private readonly notificationsService: NotificationsService,
    private readonly partnershipsService: PartnershipsService,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  async getBranding(orgSlug: string): Promise<PublicCompanyBrandingEntity> {
    const company = await this.companiesService.findBySlug(orgSlug);
    return {
      name: company.name,
      address: company.address,
      nip: company.nip,
      logoUrl: company.logoUrl,
      privacyPolicyUrl: company.privacyPolicyUrl,
      privacyPolicyVersion: company.privacyPolicyVersion,
      termsUrl: company.termsUrl,
    };
  }

  async getManufacturers(orgSlug: string): Promise<PublicManufacturerEntity[]> {
    const company = await this.companiesService.findBySlug(orgSlug);
    const manufacturers = await this.intakeRepository.findPublicManufacturers(company.id);
    return manufacturers.map((m) => ({
      id: m.id,
      name: m.contractor.name,
      requiresSerialNumber: m.requiresSerialNumber,
      requiresFrameNumber: m.requiresFrameNumber,
      requiresProofOfPurchase: m.requiresProofOfPurchase,
      minPhotos: m.minPhotos,
      requiresVideo: m.requiresVideo,
      maxPhotos: m.maxPhotos,
      maxAttachmentSizeMb: m.maxAttachmentSizeMb,
    }));
  }

  // --- Etap 4 (Produkty i konfiguracja formularza) — katalog producenta na
  // formularzu firmowym. `manufacturersService.findById` rzuca 404, gdy
  // `manufacturerId` nie należy do TEJ firmy (IDOR — ten sam wzorzec co
  // `submitComplaint` niżej), więc każda z tych metod jest bezpieczna, mimo
  // że `manufacturerId` przychodzi wprost z adresu URL. ---

  async getManufacturerBrands(
    orgSlug: string,
    manufacturerId: string,
  ): Promise<PublicBrandEntity[]> {
    const company = await this.companiesService.findBySlug(orgSlug);
    await this.manufacturersService.findById(manufacturerId, company.id);
    return this.intakeRepository.findPublicBrandsForManufacturer(manufacturerId);
  }

  async getManufacturerCategories(
    orgSlug: string,
    manufacturerId: string,
  ): Promise<PublicProductCategoryEntity[]> {
    const company = await this.companiesService.findBySlug(orgSlug);
    await this.manufacturersService.findById(manufacturerId, company.id);
    return this.intakeRepository.findPublicCategoriesForManufacturer(manufacturerId);
  }

  async getManufacturerProducts(
    orgSlug: string,
    manufacturerId: string,
    brandId?: string,
    categoryId?: string,
  ): Promise<PublicProductEntity[]> {
    const company = await this.companiesService.findBySlug(orgSlug);
    await this.manufacturersService.findById(manufacturerId, company.id);
    return this.intakeRepository.findPublicProducts(manufacturerId, brandId, categoryId);
  }

  /**
   * Krok "Wyślij" (9/9). Kolejność ma znaczenie: klient → producent zweryfikowany →
   * produkt (dopasowany po nazwie lub utworzony) → sprawa (przez `CasesService.create`,
   * WSZYSTKIE reguły CASE-004/005/006/BR-097/BR-105 egzekwowane tam bez duplikacji) →
   * Portal włączony DOPIERO teraz (stąd znamy kod dostępu do e-maila) → zgoda RODO
   * zapisana z IP/User-Agent → e-mail wysłany WPROST (nie przez generyczny handler
   * `case.created.customer`, patrz `case.created.public.customer` w seedzie).
   */
  async submitComplaint(
    orgSlug: string,
    dto: SubmitPublicComplaintDto,
    ip: string | null,
    userAgent: string | null,
  ): Promise<PublicComplaintCreatedEntity> {
    const company = await this.companiesService.findBySlug(orgSlug);
    const companyId = company.id;

    // Rzuca NotFoundException, jeśli `manufacturerId` nie należy do tej firmy —
    // ten sam publiczny endpoint nie ma jak inaczej to sprawdzić (IDOR, patrz audyt).
    const manufacturer = await this.manufacturersService.findById(dto.manufacturerId, companyId);

    const customer = await this.customersService.findOrCreatePublic(companyId, {
      firstName: dto.customer.firstName,
      lastName: dto.customer.lastName,
      phone: dto.customer.phone,
      email: dto.customer.email,
      address: dto.customer.address,
      city: dto.customer.city,
      postalCode: dto.customer.postalCode,
    });

    // Klient zgłasza "zamówienie jest niekompletne" osobnym polem (checkbox), nie osobnym
    // statusem/kategorią sprawy — dopisujemy to jawnie do opisu usterki, żeby pracownik
    // widział to od razu w "Opis zgłoszenia", bez nowej kolumny w modelu danych.
    const description =
      dto.incompleteOrder && dto.incompleteOrderDetails?.trim()
        ? `${dto.description}\n\n[Zamówienie niekompletne — brakujące elementy] ${dto.incompleteOrderDetails.trim()}`
        : dto.description;

    // Etap 4 — `productId` (wybór z katalogu, gdy producent go skonfigurował) ma
    // pierwszeństwo przed wolnym tekstem `productName` (dotychczasowe zachowanie,
    // zachowane dla producentów bez katalogu — patrz doc-comment DTO). Dokładnie
    // jedno z obu musi być podane.
    let product;
    let productDisplayName: string;
    if (dto.productId) {
      product = await this.intakeRepository.findPublicProductById(
        dto.productId,
        dto.manufacturerId,
      );
      if (!product) throw new NotFoundException();
      productDisplayName = product.name;
    } else if (dto.productName) {
      product = await this.intakeRepository.findProductByExactName(
        companyId,
        dto.manufacturerId,
        dto.productName,
      );
      if (!product) {
        product = await this.intakeRepository.createFreeTextProduct(
          companyId,
          dto.manufacturerId,
          dto.productName,
        );
      }
      productDisplayName = dto.productName;
    } else {
      throw new AppException(
        ERROR_CODES.VALIDATION_001.code,
        ERROR_CODES.VALIDATION_001.message,
        ERROR_CODES.VALIDATION_001.status,
        { field: 'productId' },
      );
    }

    const caseEntity = await this.casesService.create(
      companyId,
      {
        customerId: customer.id,
        // Formularz publiczny celowo NIE pyta klienta o gwarancję/rękojmię —
        // pracownik zaznacza to podczas weryfikacji zgłoszenia (patrz stała wyżej).
        complaintType: UNSPECIFIED_COMPLAINT_TYPE,
        submissionMode: SubmissionMode.PrzezSklep,
        source: ComplaintSource.FormularzWWW,
        // Formularz publiczny celowo NIE pyta klienta o oczekiwane rozwiązanie
        // (nie sugerujemy np. odstąpienia od umowy) — pracownik ustala je z
        // klientem podczas weryfikacji zgłoszenia i może zaktualizować to pole
        // ręcznie w szczegółach sprawy.
        requestedResolution: UNSPECIFIED_RESOLUTION_NOTE,
        description,
        customerStatement: dto.description,
        clientPortalEnabled: false,
        items: [
          {
            productId: product.id,
            manufacturerId: manufacturer.id,
            description,
            serialNumber: dto.serialNumber,
            frameNumber: dto.frameNumber,
            purchaseProofNumber: dto.purchaseProofNumber,
          },
        ],
      },
      null,
    );

    // `sendEmail: false` — ten formularz wysyła WŁASNY, połączony e-mail zaraz niżej
    // (`case.created.public.customer`, zawiera i numer sprawy, i kod dostępu naraz);
    // bez tej flagi `enablePortal` wysłałby drugi, redundantny e-mail z samym kodem.
    const credential = await this.casesService.enablePortal(caseEntity.id, companyId, {
      sendEmail: false,
    });

    await this.caseConsentRepository.create({
      caseId: caseEntity.id,
      companyId,
      requiredConsent: dto.requiredConsent,
      marketingConsent: dto.marketingConsent ?? false,
      documentSharingConsent: dto.documentSharingConsent ?? false,
      clauseVersion: GDPR_CLAUSE_VERSION,
      privacyPolicyUrl: company.privacyPolicyUrl,
      privacyPolicyVersion: company.privacyPolicyVersion,
      ipAddress: ip,
      userAgent,
    });

    // `cors.origin` — jedyne miejsce, gdzie backend już zna adres(y) frontendu (patrz `main.ts`); nie duplikujemy tego jako osobną zmienną środowiskową.
    // Może zawierać kilka originów (rozdzielonych przecinkiem, np. lokalny + LAN do testów na telefonie) — pierwszy jest traktowany jako kanoniczny adres do linków w e-mailach.
    const [primaryOrigin] = this.config.get<string[]>('cors.origin')!;
    const portalUrl = `${primaryOrigin}/portal/login?case=${encodeURIComponent(caseEntity.caseNumber)}&code=${encodeURIComponent(credential.value)}`;
    // Dane kontaktowe firmy w stopce e-maila — budowane tu (nie w treści szablonu, który
    // umie tylko podstawić `{{var}}`, bez warunków), żeby brak telefonu/e-maila w Ustawieniach
    // firmy nie zostawił pustej linijki "Kontakt: " w wysłanej wiadomości.
    const contactParts = [company.phone, company.email].filter((v): v is string => Boolean(v));
    const companyContactLine =
      contactParts.length > 0 ? `\nKontakt: ${contactParts.join(' / ')}` : '';
    // Adres złożony z 3 osobnych pól formularza — klient ma go zobaczyć w mailu
    // DOKŁADNIE tak, jak go wpisał, żeby mógł wychwycić literówkę/pomyłkę.
    const customerAddress = `${dto.customer.address}, ${dto.customer.postalCode} ${dto.customer.city}`;
    await this.notificationsService.createNotificationFromTemplate({
      companyId,
      code: 'case.created.public.customer',
      channel: NotificationChannel.Email,
      recipientType: NotificationRecipientType.Customer,
      recipientEmail: dto.customer.email,
      relatedCaseId: caseEntity.id,
      variables: {
        caseNumber: caseEntity.caseNumber,
        customerName: `${dto.customer.firstName} ${dto.customer.lastName}`,
        customerPhone: dto.customer.phone,
        customerEmail: dto.customer.email,
        customerAddress,
        productName: productDisplayName,
        description: dto.description,
        portalUrl,
        accessCode: credential.value,
        companyName: company.name,
        companyContactLine,
      },
    });

    const session = await this.portalService.issueSession(caseEntity.id);
    return {
      caseNumber: caseEntity.caseNumber,
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
    };
  }

  /**
   * Formularz rozgałęziony marki (np. Veres Meble) — rozstrzyga `Manufacturer`
   * po `publicFormSlug` (NIE `Company.slug`, patrz komentarz przy tym polu w
   * schemacie) — jedna firma (jeden NIP) może mieć wiele marek, każda z
   * własnym adresem/brandingiem formularza, obok istniejącego formularza
   * firmowego pod `/reklamacja/:orgSlug`, który działa bez zmian.
   */
  private async resolveBrand(brandSlug: string) {
    const manufacturer = await this.intakeRepository.findManufacturerByPublicFormSlug(brandSlug);
    if (!manufacturer) throw new NotFoundException();
    return manufacturer;
  }

  async getBrandBranding(brandSlug: string): Promise<PublicCompanyBrandingEntity> {
    const manufacturer = await this.resolveBrand(brandSlug);
    return {
      name: manufacturer.publicFormDisplayName ?? manufacturer.contractor.name,
      address: null,
      nip: null,
      logoUrl: manufacturer.publicFormLogoPath ? `/intake/brand/${brandSlug}/logo` : null,
      privacyPolicyUrl: manufacturer.company.privacyPolicyUrl,
      privacyPolicyVersion: manufacturer.company.privacyPolicyVersion,
      termsUrl: manufacturer.company.termsUrl,
    };
  }

  /** Krok "Produkt" — formularz marki NIE pokazuje wyboru producenta (jest dokładnie jeden, zablokowany przez sam adres formularza) — zwraca jego wymagania wprost, bez tablicy jak `getManufacturers`. */
  async getBrandManufacturer(brandSlug: string): Promise<PublicManufacturerEntity> {
    const m = await this.resolveBrand(brandSlug);
    return {
      id: m.id,
      name: m.publicFormDisplayName ?? m.contractor.name,
      requiresSerialNumber: m.requiresSerialNumber,
      requiresFrameNumber: m.requiresFrameNumber,
      requiresProofOfPurchase: m.requiresProofOfPurchase,
      minPhotos: m.minPhotos,
      requiresVideo: m.requiresVideo,
      maxPhotos: m.maxPhotos,
      maxAttachmentSizeMb: m.maxAttachmentSizeMb,
    };
  }

  /** `GET /intake/brand/:brandSlug/logo` — publiczny, patrz kontroler. Rzuca `NotFoundException`, gdy marka nie ma wgranego logo. */
  async getBrandLogoBuffer(brandSlug: string): Promise<{ buffer: Buffer; storagePath: string }> {
    const manufacturer = await this.resolveBrand(brandSlug);
    if (!manufacturer.publicFormLogoPath) throw new NotFoundException();
    return {
      buffer: await this.storageService.read(manufacturer.publicFormLogoPath),
      storagePath: manufacturer.publicFormLogoPath,
    };
  }

  /** Krok "Wybór partnera" (ścieżka B2B) — WYŁĄCZNIE firmy z AKTYWNYM `Partnership` (shopCompany) tej firmy, patrz `IntakeRepository.findActivePartnerShops`. */
  async getBrandPartners(brandSlug: string): Promise<PublicPartnerEntity[]> {
    const manufacturer = await this.resolveBrand(brandSlug);
    return this.intakeRepository.findActivePartnerShops(manufacturer.companyId);
  }

  // --- Etap 4 (Produkty i konfiguracja formularza) — Organizacja → Producent →
  // Marka → Kategoria → Produkt. `resolveBrand` już gwarantuje, że producent
  // istnieje i jest aktywny — te metody dziedziczą tę granicę bez powtarzania jej. ---

  /**
   * Etap 5 — `partnerCompanyId` (opcjonalny) zawęża listę do marek, które ten
   * KONKRETNY partner wolno mu obsługiwać (`PartnershipBrand`) — UX, żeby
   * formularz od razu pokazywał tylko dozwolone marki zamiast odrzucać
   * wybór dopiero przy wysyłce (rzeczywista granica bezpieczeństwa i tak
   * jest w `submitBrandComplaint`/`assertActivePartnerCoversBrand`, to jest
   * WYŁĄCZNIE podpowiedź UI).
   */
  async getBrandBrands(brandSlug: string, partnerCompanyId?: string): Promise<PublicBrandEntity[]> {
    const manufacturer = await this.resolveBrand(brandSlug);
    const brands = await this.intakeRepository.findPublicBrandsForManufacturer(manufacturer.id);
    if (!partnerCompanyId) return brands;
    const allowed = await this.partnershipsService.findAllowedBrandIdsForPartner(
      manufacturer.companyId,
      partnerCompanyId,
    );
    return brands.filter((b) => allowed.includes(b.id));
  }

  async getBrandCategories(brandSlug: string): Promise<PublicProductCategoryEntity[]> {
    const manufacturer = await this.resolveBrand(brandSlug);
    return this.intakeRepository.findPublicCategoriesForManufacturer(manufacturer.id);
  }

  async getBrandProducts(
    brandSlug: string,
    brandId?: string,
    categoryId?: string,
  ): Promise<PublicProductEntity[]> {
    const manufacturer = await this.resolveBrand(brandSlug);
    return this.intakeRepository.findPublicProducts(manufacturer.id, brandId, categoryId);
  }

  /** Ten sam resolver co `CasesService`/Portal Klienta (`ManufacturersService.resolveRequirementsForItem`) — checklista formularza pokazuje DOKŁADNIE to, co `submitBrandComplaint`/`CasesService.create` faktycznie wyegzekwują, bez drugiego mechanizmu wymagań. */
  async getBrandRequirements(
    brandSlug: string,
    brandId?: string,
  ): Promise<PublicRequirementsEntity> {
    const manufacturer = await this.resolveBrand(brandSlug);
    const resolved = await this.manufacturersService.resolveRequirementsForItem(
      manufacturer.id,
      brandId ?? null,
      manufacturer.companyId,
    );
    // `resolveRequirementsForItem` zwraca `null` wyłącznie, gdy `manufacturerId`
    // nie istnieje/nie należy do firmy — tu producent jest już zweryfikowany przez
    // `resolveBrand`, więc to gałąź teoretyczna (bezpieczny fallback na wartości producenta).
    return (
      resolved ?? {
        requiresSerialNumber: manufacturer.requiresSerialNumber,
        requiresFrameNumber: manufacturer.requiresFrameNumber,
        requiresProofOfPurchase: manufacturer.requiresProofOfPurchase,
        minPhotos: manufacturer.minPhotos,
        requiresVideo: manufacturer.requiresVideo,
        maxPhotos: manufacturer.maxPhotos,
        maxAttachmentSizeMb: manufacturer.maxAttachmentSizeMb,
      }
    );
  }

  /**
   * Odpowiednik `submitComplaint` dla formularza marki — te same kroki końcowe
   * (Portal/RODO/e-mail), ale z rozgałęzieniem "kto zgłasza" PRZED utworzeniem
   * sprawy. Warunkowa wymagalność pól (customer/partnerContact/contactPreference)
   * jest walidowana TUTAJ (VALIDATION-001 z nazwą pola) — DTO ich nie wymusza,
   * bo zależą od siebie nawzajem (ten sam wzorzec co `submissionMode` w
   * `CasesService.create`).
   */
  async submitBrandComplaint(
    brandSlug: string,
    dto: SubmitBrandComplaintDto,
    ip: string | null,
    userAgent: string | null,
  ): Promise<PublicComplaintCreatedEntity> {
    const manufacturer = await this.resolveBrand(brandSlug);
    const companyId = manufacturer.companyId;
    const company = await this.companiesService.findByIdTrusted(companyId);

    // Etap 4 — `productId` musi być pozycją AKTYWNEGO katalogu TEGO producenta
    // (`findPublicProductById` filtruje po `manufacturerId` — IDOR, klient nie
    // może podstawić produktu innej firmy/innego producenta). Marka sprawy
    // wynika WYŁĄCZNIE z `product.brandId` (BR-076, ten sam wzorzec co
    // katalogowe produkty pracownika) — `dto.brandId` był tylko krokiem
    // zawężającym listę w `GET /intake/brand/:brandSlug/products`, nie jest
    // osobno zapisywany.
    const product = await this.intakeRepository.findPublicProductById(
      dto.productId,
      manufacturer.id,
    );
    if (!product) {
      throw new AppException(
        ERROR_CODES.VALIDATION_001.code,
        ERROR_CODES.VALIDATION_001.message,
        ERROR_CODES.VALIDATION_001.status,
        { field: 'productId' },
      );
    }

    let partnerCompanyId: string | undefined;
    let contactPreference: CaseContactPreference | null = null;
    let contactFirstName: string;
    let contactLastName: string;
    let contactPhone: string;
    let contactEmail: string;
    let contactAddress: string | undefined;
    let contactCity: string | undefined;
    let contactPostalCode: string | undefined;

    if (dto.reporterType === BrandReporterType.Customer) {
      if (!dto.customer) {
        throw new AppException(
          ERROR_CODES.VALIDATION_001.code,
          ERROR_CODES.VALIDATION_001.message,
          ERROR_CODES.VALIDATION_001.status,
          { field: 'customer' },
        );
      }
      ({
        firstName: contactFirstName,
        lastName: contactLastName,
        phone: contactPhone,
        email: contactEmail,
        address: contactAddress,
        city: contactCity,
        postalCode: contactPostalCode,
      } = dto.customer);
    } else {
      if (!dto.partnerCompanyId || !dto.partnerRequestType) {
        throw new AppException(
          ERROR_CODES.VALIDATION_001.code,
          ERROR_CODES.VALIDATION_001.message,
          ERROR_CODES.VALIDATION_001.status,
          { field: 'partnerCompanyId' },
        );
      }
      // Rzuca NotFoundException, jeśli firma nie ma AKTYWNEGO Partnership z tą firmą — ten
      // sam publiczny endpoint nie ma jak inaczej to sprawdzić (IDOR).
      const partners = await this.intakeRepository.findActivePartnerShops(companyId);
      if (!partners.some((p) => p.id === dto.partnerCompanyId)) throw new NotFoundException();
      partnerCompanyId = dto.partnerCompanyId;

      // Etap 5 — PARTNERSHIP-005: partner musi mieć markę WYBRANEGO produktu
      // w zakresie SWOJEGO `PartnershipBrand`, nie tylko aktywne partnerstwo w
      // ogóle (dawna luka — `findActivePartnerShops` samo w sobie nie sprawdza
      // marek). `product.brandId=null` (produkt bez marki, kompatybilność
      // wsteczna Etapu 4) nie podlega temu ograniczeniu — nie ma czego sprawdzić.
      if (product.brandId) {
        await this.partnershipsService.assertActivePartnerCoversBrand(
          companyId,
          partnerCompanyId,
          product.brandId,
        );
      }

      if (dto.partnerRequestType === BrandPartnerRequestType.OnBehalfOfCustomer) {
        if (!dto.customer || !dto.contactPreference) {
          throw new AppException(
            ERROR_CODES.VALIDATION_001.code,
            ERROR_CODES.VALIDATION_001.message,
            ERROR_CODES.VALIDATION_001.status,
            { field: 'customer' },
          );
        }
        ({
          firstName: contactFirstName,
          lastName: contactLastName,
          phone: contactPhone,
          email: contactEmail,
          address: contactAddress,
          city: contactCity,
          postalCode: contactPostalCode,
        } = dto.customer);
        contactPreference =
          dto.contactPreference === BrandContactPreference.Partner
            ? CaseContactPreference.Partner
            : CaseContactPreference.Customer;
      } else {
        // Przedsprzedażowa — brak klienta końcowego, "klientem" sprawy jest osoba kontaktowa partnera (patrz doc-comment `BrandComplaintPartnerContactDto`).
        if (!dto.partnerContact) {
          throw new AppException(
            ERROR_CODES.VALIDATION_001.code,
            ERROR_CODES.VALIDATION_001.message,
            ERROR_CODES.VALIDATION_001.status,
            { field: 'partnerContact' },
          );
        }
        ({
          firstName: contactFirstName,
          lastName: contactLastName,
          phone: contactPhone,
          email: contactEmail,
        } = dto.partnerContact);
      }
    }

    const customer = await this.customersService.findOrCreatePublic(companyId, {
      firstName: contactFirstName,
      lastName: contactLastName,
      phone: contactPhone,
      email: contactEmail,
      address: contactAddress,
      city: contactCity,
      postalCode: contactPostalCode,
    });

    // Kolor/rodzaj zgłoszenia/nr elementu — dopisane do opisu (bez nowych kolumn), dokładnie
    // ten sam wzorzec co `incompleteOrder`/`incompleteOrderDetails` w formularzu firmowym.
    const issueLabels: Record<string, string> = {
      MissingPart: 'Brakuje elementu',
      DamagedPart: 'Uszkodzony element / uszkodzony produkt',
      Defect: 'Wada produktu',
      Other: 'Inny problem',
    };
    const descriptionParts = [`[Rodzaj zgłoszenia: ${issueLabels[dto.issueType]}]`];
    if (dto.affectedPartNumber?.trim())
      descriptionParts.push(`[Numer elementu wg instrukcji: ${dto.affectedPartNumber.trim()}]`);
    if (dto.color?.trim()) descriptionParts.push(`[Kolor: ${dto.color.trim()}]`);
    const description = `${descriptionParts.join(' ')}\n\n${dto.description}`;

    // Zrzucona TU, żeby zarówno sprawa (przyszłe powiadomienia), jak i e-mail
    // potwierdzenia niżej (`case.created.public.customer`) pokazywały tę samą,
    // poprawną nazwę nadawcy — patrz komentarz przy `Case.notificationSenderName`.
    const brandName = manufacturer.publicFormDisplayName ?? manufacturer.contractor.name;

    const caseEntity = await this.casesService.create(
      companyId,
      {
        customerId: customer.id,
        complaintType: UNSPECIFIED_COMPLAINT_TYPE,
        submissionMode: SubmissionMode.PrzezSklep,
        source: ComplaintSource.FormularzWWW,
        requestedResolution: UNSPECIFIED_RESOLUTION_NOTE,
        description,
        customerStatement: dto.description,
        clientPortalEnabled: false,
        reportedByPartnerCompanyId: partnerCompanyId,
        contactPreference: contactPreference ?? undefined,
        notificationSenderName: brandName,
        items: [
          {
            productId: product.id,
            manufacturerId: manufacturer.id,
            description,
            serialNumber: dto.serialNumber,
            purchaseProofNumber: dto.purchaseProofNumber,
          },
        ],
      },
      null,
    );

    const credential = await this.casesService.enablePortal(caseEntity.id, companyId, {
      sendEmail: false,
    });

    await this.caseConsentRepository.create({
      caseId: caseEntity.id,
      companyId,
      requiredConsent: dto.requiredConsent,
      marketingConsent: dto.marketingConsent ?? false,
      documentSharingConsent: dto.documentSharingConsent ?? false,
      clauseVersion: GDPR_CLAUSE_VERSION,
      privacyPolicyUrl: company.privacyPolicyUrl,
      privacyPolicyVersion: company.privacyPolicyVersion,
      ipAddress: ip,
      userAgent,
    });

    const [primaryOrigin] = this.config.get<string[]>('cors.origin')!;
    const portalUrl = `${primaryOrigin}/portal/login?case=${encodeURIComponent(caseEntity.caseNumber)}&code=${encodeURIComponent(credential.value)}`;
    const contactParts = [company.phone, company.email].filter((v): v is string => Boolean(v));
    const companyContactLine =
      contactParts.length > 0 ? `\nKontakt: ${contactParts.join(' / ')}` : '';

    await this.notificationsService.createNotificationFromTemplate({
      companyId,
      code: 'case.created.public.customer',
      channel: NotificationChannel.Email,
      recipientType: NotificationRecipientType.Customer,
      recipientEmail: contactEmail,
      relatedCaseId: caseEntity.id,
      senderNameOverride: brandName,
      variables: {
        caseNumber: caseEntity.caseNumber,
        customerName: `${contactFirstName} ${contactLastName}`,
        customerPhone: contactPhone,
        customerEmail: contactEmail,
        customerAddress: contactAddress
          ? `${contactAddress}, ${contactPostalCode} ${contactCity}`
          : '—',
        productName: product.name,
        description: dto.description,
        portalUrl,
        accessCode: credential.value,
        companyName: brandName,
        companyContactLine,
      },
    });

    const session = await this.portalService.issueSession(caseEntity.id);
    return {
      caseNumber: caseEntity.caseNumber,
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
    };
  }
}
