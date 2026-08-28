import { Injectable } from '@nestjs/common';
import { ContractorCategory, PartnershipStatus, Product } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Publiczny Formularz Reklamacyjny — odczyty/zapisy WĄSKO dopasowane do tego, co
 * wolno zobaczyć/zrobić anonimowemu klientowi. Celowo NIE reużywa
 * `ManufacturersRepository`/`ProductsRepository` wprost: tamte zwracają PEŁne
 * rekordy (m.in. `Manufacturer.portalLogin`/`portalPasswordEncrypted`/
 * `complaintEmail`/adres zwrotny logistyki — dane WEWNĘTRZNE, nigdy do
 * ujawnienia publicznie), a to repozytorium ma zwracać wyłącznie bezpieczny,
 * jawnie wyliczony podzbiór pól.
 */
@Injectable()
export class IntakeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Krótka lista (typowo kilkanaście-kilkadziesiąt) — bez `take`, klient wybiera z pełnej listy (nie z wyszukiwarki pełnego katalogu produktów, patrz uzasadnienie modułu). */
  findPublicManufacturers(companyId: string) {
    return this.prisma.manufacturer.findMany({
      where: { companyId, active: true },
      select: {
        id: true,
        requiresSerialNumber: true,
        requiresFrameNumber: true,
        requiresProofOfPurchase: true,
        minPhotos: true,
        requiresVideo: true,
        maxPhotos: true,
        maxAttachmentSizeMb: true,
        contractor: { select: { name: true } },
      },
      orderBy: { contractor: { name: 'asc' } },
    });
  }

  /**
   * Dopasowanie PO NAZWIE (case-insensitive, w obrębie tego samego producenta) —
   * żeby dwóch klientów wpisujących ten sam model z paragonu ("Cybex Balios S Lux")
   * nie tworzyło dwóch osobnych wpisów katalogowych. Brak dopasowania = `null`,
   * wołający tworzy nowy wiersz (`createFreeTextProduct`).
   */
  findProductByExactName(
    companyId: string,
    manufacturerId: string,
    name: string,
  ): Promise<Product | null> {
    return this.prisma.product.findFirst({
      where: { companyId, manufacturerId, name: { equals: name, mode: 'insensitive' } },
    });
  }

  /** Produkt wpisany "jak na paragonie" — bez SKU/marki (klient ich nie zna/nie ma skąd wziąć), dokładnie jak przy analogicznym "model spoza katalogu" w kreatorze pracownika. `category` — wyłącznie formularz rozgałęziony marki (Veres Meble), formularz firmowy jej nie zna. */
  createFreeTextProduct(
    companyId: string,
    manufacturerId: string,
    name: string,
    category?: string,
  ): Promise<Product> {
    return this.prisma.product.create({ data: { companyId, manufacturerId, name, category } });
  }

  // --- Etap 4 (Produkty i konfiguracja formularza) — Organizacja → Producent →
  // Marka → Kategoria → Produkt, ZASTĘPUJE wolnotekstowe `productName` na
  // formularzu marki (formularz firmowy zachowuje wolny tekst jako fallback,
  // gdy producent nie ma jeszcze skonfigurowanego katalogu — patrz `IntakeService`). ---

  /** Krok "Marka" — WYŁĄCZNIE aktywne marki tego producenta. Pominięty w UI, gdy wynik ma ≤1 wiersz (auto-wybór). */
  findPublicBrandsForManufacturer(manufacturerId: string): Promise<{ id: string; name: string }[]> {
    return this.prisma.brand.findMany({
      where: { manufacturerId, active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Krok "Kategoria" — WYŁĄCZNIE aktywne kategorie tego producenta (zastępuje dawne `Manufacturer.productCategories` z Etapu 3). */
  findPublicCategoriesForManufacturer(
    manufacturerId: string,
  ): Promise<{ id: string; name: string }[]> {
    return this.prisma.productCategory.findMany({
      where: { manufacturerId, active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Krok "Produkt" — WYŁĄCZNIE aktywne produkty tego producenta, opcjonalnie
   * zawężone do marki/kategorii. `brandId: null` na produkcie = nie przypisany
   * do żadnej konkretnej marki (historyczne produkty sprzed Etapu 4, BR-076) —
   * traktowany jako widoczny pod KAŻDĄ marką tego producenta (kompatybilność
   * wsteczna, patrz `Product.brandId` w schemacie), nigdy odwrotnie: produkt
   * przypisany do marki A NIGDY nie pojawia się przy wybranej marce B.
   */
  findPublicProducts(
    manufacturerId: string,
    brandId?: string,
    categoryId?: string,
  ): Promise<{ id: string; name: string; brandId: string | null; categoryId: string | null }[]> {
    return this.prisma.product.findMany({
      where: {
        manufacturerId,
        active: true,
        ...(brandId ? { OR: [{ brandId }, { brandId: null }] } : {}),
        ...(categoryId ? { categoryId } : {}),
      },
      select: { id: true, name: true, brandId: true, categoryId: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Rozwiązanie wybranego `productId` PRZED utworzeniem sprawy — `manufacturerId` w `where` jest granicą IDOR (klient nie może podstawić produktu innego producenta/innej firmy, patrz audyt bezpieczeństwa). */
  findPublicProductById(id: string, manufacturerId: string): Promise<Product | null> {
    return this.prisma.product.findFirst({ where: { id, manufacturerId, active: true } });
  }

  /**
   * Formularz rozgałęziony marki — rozwiązuje `Manufacturer` po `publicFormSlug`
   * (nie po `Company.slug`, patrz komentarz przy tym polu w schemacie). Zwraca
   * WYŁĄCZNIE aktywnego producenta — nieaktywna marka nie ma działającego
   * formularza, tak samo jak nieaktywna firma (`CompaniesService.findBySlug`).
   */
  findManufacturerByPublicFormSlug(slug: string) {
    return this.prisma.manufacturer.findFirst({
      where: { publicFormSlug: slug, active: true },
      include: {
        contractor: { select: { name: true } },
        company: {
          select: {
            name: true,
            privacyPolicyUrl: true,
            privacyPolicyVersion: true,
            termsUrl: true,
          },
        },
      },
    });
  }

  /** Krok "Wybór partnera" — WYŁĄCZNIE `Contractor` kategorii Distributor tej firmy, żeby klient nie mógł wpisać dowolnej nazwy (patrz wymaganie właściciela). Wariant "ta sama firma/NIP" (`Case.reportedByContractorId`) — patrz komentarz przy tym polu w schemacie. */
  findActiveDistributorContractors(companyId: string): Promise<{ id: string; name: string }[]> {
    return this.prisma.contractor.findMany({
      where: { companyId, category: ContractorCategory.Distributor, active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Krok "Wybór partnera" — wariant "osobne konto Dystrybutora" (`Case.reportedByPartnerCompanyId`).
   * WYŁĄCZNIE firmy z AKTYWNYM `Partnership` jako `shopCompany` tej firmy (`distributorCompanyId`) —
   * ten sam mechanizm, który już rządzi widocznością w panelu (Faza 4), więc lista partnerów w
   * formularzu publicznym nigdy nie rozjeżdża się z listą w panelu Partnerzy.
   */
  findActivePartnerShops(distributorCompanyId: string): Promise<{ id: string; name: string }[]> {
    return this.prisma.partnership
      .findMany({
        where: { distributorCompanyId, status: PartnershipStatus.Active },
        select: { shopCompany: { select: { id: true, name: true } } },
        orderBy: { shopCompany: { name: 'asc' } },
      })
      .then((rows) => rows.map((r) => r.shopCompany));
  }
}
