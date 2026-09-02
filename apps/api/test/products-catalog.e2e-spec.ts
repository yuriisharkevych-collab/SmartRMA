import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { toValidationException } from '../src/common/validation/to-validation-exception';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { PasswordService } from '../src/modules/auth/services/password.service';

/**
 * Etap 4 (Produkty i konfiguracja formularza) — e2e NA ŻYWO przez prawdziwe
 * żądania HTTP (nie przegląd kodu). Dwie PRAWDZIWE, niezależne organizacje z
 * WŁASNYMI katalogami produktów, dokładnie jak TekstylPol/Veres Meble na
 * środowisku deweloperskim:
 *
 *   - `textile` (branża tekstylna) — dwie marki (`Default`/`Premium`,
 *     `Premium` z nadpisaniem `requiresSerialNumber`+`minPhotos`), jedna
 *     kategoria, jeden produkt katalogowy pod marką `Premium`.
 *   - `furniture` (branża meblowa) — WŁASNA, zupełnie inna kategoria/produkt,
 *     zero powiązania z `textile`.
 *
 * Scenariusz z zadania właściciela: organizacja → producent → marka →
 * kategoria → produkt → formularz publiczny → wybór produktu → wymagania
 * marki → utworzenie RMA → sprawa w liście spraw (Dashboard). Plus:
 * organizacja B nigdy nie widzi kategorii/produktów/marek organizacji A
 * (ani przez formularz publiczny, ani przez API panelu), a `productId`
 * cudzej firmy nie da się podstawić pod zgłoszenie.
 */
describe('Katalog produktów — Organizacja → Producent → Marka → Kategoria → Produkt (e2e, Etap 4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const password = 'Test-Password-123!';
  const suffix = Date.now();

  type Org = {
    companyId: string;
    slug: string;
    brandSlug: string;
    manufacturerId: string;
    defaultBrandId: string;
    premiumBrandId: string;
    categoryId: string;
    productId: string; // pod marką "Premium"
    token: string;
    userId: string;
  };

  /** Zakłada organizację z pełnym katalogiem: producent (self-owned) → 2 marki (Default/Premium, Premium z override'em) → 1 kategoria → 1 produkt pod marką Premium. Publiczny formularz marki pod `publicFormSlug`. */
  async function createOrgWithCatalog(
    name: string,
    categoryName: string,
    productName: string,
  ): Promise<Org> {
    const company = await prisma.company.create({
      data: { name: `${name} ${suffix}`, slug: `${name.toLowerCase()}-catalog-${suffix}` },
    });

    await prisma.caseStatusDefinition.create({
      data: {
        companyId: company.id,
        code: 'Nowa',
        label: 'Nowa',
        order: 1,
        isDefaultForNew: true,
        portalStage: 'Zgloszona',
        isSystem: true,
      },
    });

    const brandSlug = `${name.toLowerCase()}-catalog-brand-${suffix}`;
    const contractor = await prisma.contractor.create({
      data: { companyId: company.id, name: `${name} kontrahent ${suffix}` },
    });
    const manufacturer = await prisma.manufacturer.create({
      data: {
        companyId: company.id,
        contractorId: contractor.id,
        submissionMethod: 'FormularzWWW',
        publicFormSlug: brandSlug,
        publicFormDisplayName: `${name} ${suffix}`,
        requiresSerialNumber: false,
        requiresFrameNumber: false,
        requiresProofOfPurchase: false,
      },
    });
    const defaultBrand = await prisma.brand.create({
      data: { companyId: company.id, manufacturerId: manufacturer.id, name: `${name} Default` },
    });
    const premiumBrand = await prisma.brand.create({
      data: {
        companyId: company.id,
        manufacturerId: manufacturer.id,
        name: `${name} Premium`,
        // Etap 3 — nadpisanie wymagań TYLKO tej marki, reużyty resolver.
        requiresSerialNumber: true,
        minPhotos: 5,
      },
    });
    const category = await prisma.productCategory.create({
      data: { companyId: company.id, manufacturerId: manufacturer.id, name: categoryName },
    });
    const product = await prisma.product.create({
      data: {
        companyId: company.id,
        manufacturerId: manufacturer.id,
        brandId: premiumBrand.id,
        categoryId: category.id,
        name: productName,
      },
    });

    const permissionCodes = ['cases.view', 'cases.create', 'products.view', 'products.manage', 'brands.manage'];
    const permissions = await Promise.all(
      permissionCodes.map((code) =>
        prisma.permission.upsert({
          where: { code },
          update: {},
          create: { code, module: code.split('.')[0], description: code },
        }),
      ),
    );
    const role = await prisma.role.create({
      data: {
        companyId: company.id,
        name: `${name} Admin ${suffix}`,
        code: `${name.toLowerCase()}-catalog-admin-${suffix}`,
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });
    const email = `e2e-catalog-${name.toLowerCase()}-${suffix}@example.com`;
    const passwordService = app.get(PasswordService);
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        firstName: name,
        lastName: 'E2E',
        email,
        passwordHash: await passwordService.hash(password),
        active: true,
        roles: { create: [{ roleId: role.id }] },
      },
    });

    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password });

    return {
      companyId: company.id,
      slug: company.slug!,
      brandSlug,
      manufacturerId: manufacturer.id,
      defaultBrandId: defaultBrand.id,
      premiumBrandId: premiumBrand.id,
      categoryId: category.id,
      productId: product.id,
      token: login.body.accessToken,
      userId: user.id,
    };
  }

  let textile: Org;
  let furniture: Org;
  let partnerShop: { id: string };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        exceptionFactory: toValidationException,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix('api', { exclude: ['health', 'version'] });
    await app.init();

    prisma = app.get(PrismaService);

    textile = await createOrgWithCatalog('Textile', 'Pościel', 'Pościel dziecięca Premium');
    furniture = await createOrgWithCatalog('Furniture', 'Łóżeczka', 'Łóżeczko sosnowe 120x60');

    // Ścieżka B2B — partner sklepowy z AKTYWNYM Partnership wobec `textile`
    // (wymóg PARTNERSHIP-001: dystrybutor musi być `ManufacturerDistributor`).
    await prisma.company.update({
      where: { id: textile.companyId },
      data: { type: 'ManufacturerDistributor', orgKind: 'Producent' },
    });
    partnerShop = await prisma.company.create({
      data: { name: `PartnerShop ${suffix}`, slug: `partner-shop-catalog-${suffix}` },
    });
    // `PartnershipBrand` scope'owane do `premiumBrandId` — Etap 5 dodał egzekwowanie zakresu marek
    // (`assertActivePartnerCoversBrand`, PARTNERSHIP-005), test niżej zgłasza dokładnie tę markę.
    await prisma.partnership.create({
      data: {
        shopCompanyId: partnerShop.id,
        distributorCompanyId: textile.companyId,
        status: 'Active',
        invitedByUserId: textile.userId,
        acceptedAt: new Date(),
        brands: { create: [{ brandId: textile.premiumBrandId }] },
      },
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('Pełny przepływ: konfiguracja → formularz → wymagania → RMA → Dashboard', () => {
    it('formularz marki pokazuje WYŁĄCZNIE marki/kategorie/produkty TEJ organizacji', async () => {
      const brands = await request(app.getHttpServer()).get(`/api/intake/brand/${textile.brandSlug}/brands`);
      expect(brands.body.map((b: { id: string }) => b.id).sort()).toEqual(
        [textile.defaultBrandId, textile.premiumBrandId].sort(),
      );

      const categories = await request(app.getHttpServer()).get(
        `/api/intake/brand/${textile.brandSlug}/categories`,
      );
      expect(categories.body).toEqual([{ id: textile.categoryId, name: 'Pościel' }]);

      const products = await request(app.getHttpServer()).get(
        `/api/intake/brand/${textile.brandSlug}/products`,
      );
      expect(products.body).toEqual([
        {
          id: textile.productId,
          name: 'Pościel dziecięca Premium',
          brandId: textile.premiumBrandId,
          categoryId: textile.categoryId,
        },
      ]);
    });

    it('produkty zawężają się poprawnie po marce — marka Default (bez własnego produktu) nie widzi produktu marki Premium', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/intake/brand/${textile.brandSlug}/products`)
        .query({ brandId: textile.defaultBrandId });
      expect(res.body).toEqual([]);
    });

    it('wymagania rozwiązane DLA WYBRANEJ marki (resolveRequirements) — Premium ma własny override, Default dziedziczy z producenta', async () => {
      const premiumReq = await request(app.getHttpServer())
        .get(`/api/intake/brand/${textile.brandSlug}/requirements`)
        .query({ brandId: textile.premiumBrandId });
      expect(premiumReq.body.requiresSerialNumber).toBe(true);
      expect(premiumReq.body.minPhotos).toBe(5);

      const defaultReq = await request(app.getHttpServer())
        .get(`/api/intake/brand/${textile.brandSlug}/requirements`)
        .query({ brandId: textile.defaultBrandId });
      expect(defaultReq.body.requiresSerialNumber).toBe(false);
      expect(defaultReq.body.minPhotos).toBe(0);
    });

    it('pełny scenariusz: wybór produktu z katalogu → utworzenie RMA z wymuszonym numerem seryjnym (wymaganie marki Premium)', async () => {
      const submit = await request(app.getHttpServer())
        .post(`/api/intake/brand/${textile.brandSlug}/complaints`)
        .send({
          reporterType: 'Customer',
          customer: {
            firstName: 'Anna',
            lastName: 'Testowa',
            phone: '500700800',
            email: `anna-${suffix}@example.com`,
            address: 'Kwiatowa 5',
            city: 'Łódź',
            postalCode: '90-001',
          },
          brandId: textile.premiumBrandId,
          productId: textile.productId,
          serialNumber: `SN-${suffix}`,
          issueType: 'Defect',
          description: 'Wada tkaniny widoczna po pierwszym praniu.',
          requiredConsent: true,
        });
      expect(submit.status).toBe(HttpStatus.CREATED);
      const caseNumber = submit.body.caseNumber as string;

      // Sprawa pojawia się w liście spraw organizacji (Dashboard) z poprawnym brandId pozycji.
      const cases = await request(app.getHttpServer()).get('/api/cases').set(auth(textile.token));
      const created = cases.body.find((c: { caseNumber: string }) => c.caseNumber === caseNumber);
      expect(created).toBeDefined();
      expect(created.items[0].brandId).toBe(textile.premiumBrandId);
      expect(created.items[0].serialNumber).toBe(`SN-${suffix}`);
    });

    it('ścieżka B2B (partner z AKTYWNYM Partnership) — wybór produktu z katalogu działa identycznie jak B2C, sprawa oznaczona jako pochodząca od partnera', async () => {
      const submit = await request(app.getHttpServer())
        .post(`/api/intake/brand/${textile.brandSlug}/complaints`)
        .send({
          reporterType: 'Partner',
          partnerCompanyId: partnerShop.id,
          partnerRequestType: 'Presale',
          partnerContact: {
            firstName: 'Marek',
            lastName: 'Handlowiec',
            phone: '500700900',
            email: `marek-${suffix}@example.com`,
          },
          brandId: textile.premiumBrandId,
          productId: textile.productId,
          serialNumber: `SN-B2B-${suffix}`,
          purchaseProofNumber: `FV-B2B-${suffix}`,
          issueType: 'Defect',
          description: 'Zgłoszenie przedsprzedażowe partnera B2B.',
          requiredConsent: true,
        });
      expect(submit.status).toBe(HttpStatus.CREATED);

      const cases = await request(app.getHttpServer()).get('/api/cases').set(auth(textile.token));
      const created = cases.body.find(
        (c: { caseNumber: string }) => c.caseNumber === submit.body.caseNumber,
      );
      expect(created).toBeDefined();
      expect(created.reportedByPartnerCompanyId).toBe(partnerShop.id);
      expect(created.items[0].brandId).toBe(textile.premiumBrandId);
    });

    it('odrzuca zgłoszenie bez numeru seryjnego, gdy wymaga go WYBRANA marka (Premium)', async () => {
      const submit = await request(app.getHttpServer())
        .post(`/api/intake/brand/${textile.brandSlug}/complaints`)
        .send({
          reporterType: 'Customer',
          customer: {
            firstName: 'Bogdan',
            lastName: 'Testowy',
            phone: '500700801',
            email: `bogdan-${suffix}@example.com`,
            address: 'Polna 2',
            city: 'Łódź',
            postalCode: '90-002',
          },
          brandId: textile.premiumBrandId,
          productId: textile.productId,
          issueType: 'Defect',
          description: 'Brak numeru seryjnego w tym zgłoszeniu.',
          requiredConsent: true,
        });
      expect(submit.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(submit.body.error.code).toBe('CASE-004');
      expect(submit.body.error.field).toBe('serialNumber');
    });
  });

  describe('Izolacja tenantów — druga organizacja (branża meblowa) ma zupełnie inny katalog', () => {
    it('formularz Furniture pokazuje WYŁĄCZNIE swoje kategorie — zero kategorii Textile', async () => {
      const categories = await request(app.getHttpServer()).get(
        `/api/intake/brand/${furniture.brandSlug}/categories`,
      );
      const names = categories.body.map((c: { name: string }) => c.name);
      expect(names).toEqual(['Łóżeczka']);
      expect(names).not.toContain('Pościel');
    });

    it('formularz Furniture pokazuje WYŁĄCZNIE swoje produkty — zero produktów Textile', async () => {
      const products = await request(app.getHttpServer()).get(
        `/api/intake/brand/${furniture.brandSlug}/products`,
      );
      expect(products.body).toEqual([
        {
          id: furniture.productId,
          name: 'Łóżeczko sosnowe 120x60',
          brandId: furniture.premiumBrandId,
          categoryId: furniture.categoryId,
        },
      ]);
    });

    it('odrzuca próbę zgłoszenia na formularzu Textile z productId należącym do Furniture (IDOR)', async () => {
      const submit = await request(app.getHttpServer())
        .post(`/api/intake/brand/${textile.brandSlug}/complaints`)
        .send({
          reporterType: 'Customer',
          customer: {
            firstName: 'Attacker',
            lastName: 'Test',
            phone: '500000000',
            email: `attacker-${suffix}@example.com`,
            address: 'X 1',
            city: 'Y',
            postalCode: '00-000',
          },
          productId: furniture.productId,
          issueType: 'Defect',
          description: 'IDOR — cudzy productId.',
          requiredConsent: true,
        });
      expect(submit.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(submit.body.error.field).toBe('productId');
    });

    it('Textile (personel) nie może pobrać produktu Furniture po ID (404)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/products/${furniture.productId}`)
        .set(auth(textile.token));
      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('Textile (personel) nie może dezaktywować produktu Furniture (404)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/products/${furniture.productId}`)
        .set(auth(textile.token))
        .send({ active: false });
      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('Textile (personel) nie może pobrać kategorii Furniture po ID (404)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/product-categories/${furniture.categoryId}`)
        .set(auth(textile.token));
      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('Textile (personel) nie może zmienić nazwy kategorii Furniture (404)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/product-categories/${furniture.categoryId}`)
        .set(auth(textile.token))
        .send({ name: 'Przejęta nazwa' });
      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('filtrowanie `GET /products?manufacturerId=` cudzym producentem zwraca pustą listę, nie cudze dane', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/products')
        .query({ manufacturerId: furniture.manufacturerId })
        .set(auth(textile.token));
      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body).toEqual([]);
    });

    it('produkt zdezaktywowany przez WŁAŚCICIELA znika z formularza publicznego, ale zostaje w katalogu panelu (soft delete, nie usunięcie)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/products/${furniture.productId}`)
        .set(auth(furniture.token))
        .send({ active: false });

      const publicProducts = await request(app.getHttpServer()).get(
        `/api/intake/brand/${furniture.brandSlug}/products`,
      );
      expect(publicProducts.body).toEqual([]);

      const panelProduct = await request(app.getHttpServer())
        .get(`/api/products/${furniture.productId}`)
        .set(auth(furniture.token));
      expect(panelProduct.status).toBe(HttpStatus.OK);
      expect(panelProduct.body.active).toBe(false);

      // Przywróć do stanu wyjściowego dla ewentualnych kolejnych testów w tym pliku.
      await request(app.getHttpServer())
        .patch(`/api/products/${furniture.productId}`)
        .set(auth(furniture.token))
        .send({ active: true });
    });
  });

  describe('Kategorie — panel (dodanie / zmiana nazwy / dezaktywacja bez usuwania historii)', () => {
    it('dodanie nowej kategorii', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/product-categories')
        .set(auth(textile.token))
        .send({ manufacturerId: textile.manufacturerId, name: `Ręczniki ${suffix}` });
      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body.active).toBe(true);
    });

    it('zmiana nazwy kategorii nie zmienia jej id ani nie odrywa istniejących produktów', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/product-categories/${textile.categoryId}`)
        .set(auth(textile.token))
        .send({ name: `Pościel premium ${suffix}` });
      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.id).toBe(textile.categoryId);

      const product = await request(app.getHttpServer())
        .get(`/api/products/${textile.productId}`)
        .set(auth(textile.token));
      expect(product.body.categoryId).toBe(textile.categoryId);

      // Przywróć nazwę.
      await request(app.getHttpServer())
        .patch(`/api/product-categories/${textile.categoryId}`)
        .set(auth(textile.token))
        .send({ name: 'Pościel' });
    });

    it('dezaktywacja kategorii chowa ją z formularza publicznego, ale NIE usuwa jej ani nie odrywa istniejącego produktu', async () => {
      await request(app.getHttpServer())
        .patch(`/api/product-categories/${textile.categoryId}`)
        .set(auth(textile.token))
        .send({ active: false });

      const publicCategories = await request(app.getHttpServer()).get(
        `/api/intake/brand/${textile.brandSlug}/categories`,
      );
      expect(publicCategories.body.map((c: { id: string }) => c.id)).not.toContain(textile.categoryId);

      const product = await request(app.getHttpServer())
        .get(`/api/products/${textile.productId}`)
        .set(auth(textile.token));
      expect(product.body.categoryId).toBe(textile.categoryId);

      const category = await request(app.getHttpServer())
        .get(`/api/product-categories/${textile.categoryId}`)
        .set(auth(textile.token));
      expect(category.status).toBe(HttpStatus.OK);
      expect(category.body.active).toBe(false);

      // Przywróć do stanu wyjściowego.
      await request(app.getHttpServer())
        .patch(`/api/product-categories/${textile.categoryId}`)
        .set(auth(textile.token))
        .send({ active: true });
    });
  });
});
