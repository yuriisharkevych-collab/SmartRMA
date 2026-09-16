import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { toValidationException } from '../src/common/validation/to-validation-exception';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import { PrismaService } from '../src/prisma/prisma.service';

/** NIP testowy o poprawnej sumie kontrolnej (Ministerstwo Finansów, powszechnie używany w środowiskach testowych) — `Company.nip` nie ma unikalności w bazie, więc bezpieczny do reużycia przez wszystkie signupy w tym pliku. */
const TEST_NIP = '5260001246';

/**
 * Fundament „Fresh Install" — `POST /companies/signup` NIE loguje już
 * automatycznie: e-mail weryfikacyjny idzie przez `MailService.sendPlatformEmail`
 * (ENV, NIE `Notification`/dispatcher — patrz doc-comment `AccountRecoveryService`),
 * więc nie ma go skąd odczytać z bazy (w przeciwieństwie do np.
 * `partnership.invited.partner`, które LĄDUJE w tabeli `Notification`).
 * `.overrideProvider(MailService)` przechwytuje treść e-maila TAK, jak
 * zaplanowano (test-double zamiast prawdziwej wysyłki/loga w plaintext) —
 * `capturedEmails` niżej.
 */
const capturedEmails: Array<{ to: string; subject: string; html: string }> = [];

/**
 * Etap 6 — Onboarding samoobsługowy nowej firmy Producent/Dystrybutor, NA ŻYWO
 * przez prawdziwe żądania HTTP (nie przegląd kodu, nie skrypt developerski —
 * dokładnie ten warunek, którego zażądał właściciel: "nowa organizacja musi
 * przejść całą ścieżkę bez ręcznego SQL, Prisma ani skryptów developerskich").
 *
 * Scenariusz: `TextilePro` (Producent, branża tekstylna — celowo INNA niż
 * meble, żeby dowieść, że nic nie jest zakodowane pod konkretną branżę)
 * zakłada się przez `POST /companies/signup`, sama konfiguruje markę,
 * kategorie, produkty, wymagania, override marki, formularz publiczny i
 * partnera B2B — WYŁĄCZNIE przez API, którym posługuje się prawdziwy
 * frontend. Druga, niezależna firma (`isolation`) dowodzi izolacji tenantów
 * bez polegania na współdzielonych danych deweloperskich (Veresmeble/DAWIDAM) —
 * świeży fixture e2e daje TĘ SAMĄ gwarancję bez ryzyka dla realnych danych.
 */
describe('Onboarding samoobsługowy nowej firmy (e2e) — Etap 6', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const suffix = Date.now();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  function decodeCompanyId(accessToken: string): string {
    return JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8')).companyId;
  }
  function decodeUserId(accessToken: string): string {
    return JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8')).sub;
  }
  function decodePermissions(accessToken: string): string[] {
    return JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8')).permissions;
  }

  let textileToken: string;
  let textileCompanyId: string;
  let textileManufacturerId: string;
  let textileBrandId: string; // "TextilePro Home" — jedyna marka objęta partnerstwem
  let textileAwayBrandId: string; // druga marka, celowo NIE objęta partnerstwem (test PARTNERSHIP-005)
  const categoryIds: Record<string, string> = {};
  const productIds: string[] = [];
  let textileAwayProductId: string;

  let isolationToken: string;
  let isolationManufacturerId: string;
  let isolationBrandId: string;
  let isolationProductId: string;
  let isolationCategoryId: string;

  let partnerCompanyId: string;
  let partnerToken: string;
  let partnershipId: string;
  const partnerAdminEmail = `partner-textilepro-${suffix}@example.local`;

  // Regresja zgłoszona przez właściciela po Etapie 8 — dwie NOWE firmy o
  // nazwach prowadzących do TEGO SAMEGO prefiksu numeracji (dawny Problem 8b
  // z raportu wdrożeniowego 17.08, naprawiony w `CompaniesService.signup`).
  let prefixCompanyAToken: string;
  let prefixCompanyBToken: string;

  async function signupAndLogin(payload: {
    companyName: string;
    orgType: 'Shop' | 'Producent' | 'Dystrybutor';
    adminFirstName: string;
    adminLastName: string;
    adminEmail: string;
    password: string;
  }): Promise<{ status: number; token?: string }> {
    const signup = await request(app.getHttpServer())
      .post('/api/companies/signup')
      .send({ ...payload, nip: TEST_NIP });
    if (signup.status !== 201) return { status: signup.status };

    const email = capturedEmails
      .slice()
      .reverse()
      .find((e) => e.to === payload.adminEmail);
    const token = email?.html.match(/token=([0-9a-f]{64})/)?.[1];
    const verify = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token });
    expect(verify.status).toBe(204);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: payload.adminEmail, password: payload.password });
    return { status: signup.status, token: login.body.accessToken };
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAIL_SERVICE)
      .useValue({
        send: jest.fn().mockResolvedValue({ ok: true }),
        sendPlatformEmail: jest.fn((email: { to: string; subject: string; html: string }) => {
          capturedEmails.push(email);
          return Promise.resolve({ ok: true });
        }),
      })
      .compile();
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

    // --- Krok 1: onboarding — WYŁĄCZNIE przez POST /companies/signup (+ weryfikacja e-maila + login, Fundament „Fresh Install") ---
    const textileSignup = await signupAndLogin({
      companyName: `TextilePro ${suffix}`,
      orgType: 'Producent',
      adminFirstName: 'Ola',
      adminLastName: 'Włókniarz',
      adminEmail: `ola-${suffix}@textilepro.local`,
      password: 'Bezpieczne-Haslo-123!',
    });
    expect(textileSignup.status).toBe(201);
    textileToken = textileSignup.token!;
    textileCompanyId = decodeCompanyId(textileToken);

    const isolationSignup = await signupAndLogin({
      companyName: `IsolationCheck ${suffix}`,
      orgType: 'Dystrybutor',
      adminFirstName: 'Ktoś',
      adminLastName: 'Inny',
      adminEmail: `inny-${suffix}@example.local`,
      password: 'Bezpieczne-Haslo-456!',
    });
    expect(isolationSignup.status).toBe(201);
    isolationToken = isolationSignup.token!;

    // Firmy izolacyjnej katalog (marka/kategoria/produkt) — cel testów IDOR niżej.
    const isolationManufacturers = await request(app.getHttpServer())
      .get('/api/manufacturers')
      .set(auth(isolationToken));
    isolationManufacturerId = isolationManufacturers.body[0].id;
    const isolationBrands = await request(app.getHttpServer())
      .get('/api/brands')
      .set(auth(isolationToken));
    isolationBrandId = isolationBrands.body[0].id;
    const isolationCategory = await request(app.getHttpServer())
      .post('/api/product-categories')
      .set(auth(isolationToken))
      .send({ manufacturerId: isolationManufacturerId, name: 'Kategoria izolacyjna' });
    isolationCategoryId = isolationCategory.body.id;
    const isolationProduct = await request(app.getHttpServer())
      .post('/api/products')
      .set(auth(isolationToken))
      .send({ manufacturerId: isolationManufacturerId, brandId: isolationBrandId, name: 'Produkt izolacyjny' });
    isolationProductId = isolationProduct.body.id;
  }, 60_000);

  afterAll(async () => {
    const companyIds = [
      textileCompanyId,
      decodeCompanyId(isolationToken),
      partnerCompanyId,
      prefixCompanyAToken ? decodeCompanyId(prefixCompanyAToken) : undefined,
      prefixCompanyBToken ? decodeCompanyId(prefixCompanyBToken) : undefined,
    ].filter(Boolean);
    for (const companyId of companyIds) {
      await prisma.notification.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.auditLog.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.caseHandoff
        .deleteMany({ where: { OR: [{ originCompanyId: companyId }, { targetCompanyId: companyId }] } })
        .catch(() => undefined);
      await prisma.partnershipBrand
        .deleteMany({ where: { partnership: { OR: [{ shopCompanyId: companyId }, { distributorCompanyId: companyId }] } } })
        .catch(() => undefined);
      await prisma.partnership
        .deleteMany({ where: { OR: [{ shopCompanyId: companyId }, { distributorCompanyId: companyId }] } })
        .catch(() => undefined);
      await prisma.caseConsent.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.document.deleteMany({ where: { case: { companyId } } }).catch(() => undefined);
      await prisma.note.deleteMany({ where: { case: { companyId } } }).catch(() => undefined);
      await prisma.message.deleteMany({ where: { case: { companyId } } }).catch(() => undefined);
      await prisma.caseHistory.deleteMany({ where: { case: { companyId } } }).catch(() => undefined);
      await prisma.caseItem.deleteMany({ where: { case: { companyId } } }).catch(() => undefined);
      await prisma.case.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.product.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.productCategory.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.brand.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.manufacturer.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.contractor.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.customer.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.caseStatusDefinition.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.userRoleAssignment.deleteMany({ where: { user: { companyId } } }).catch(() => undefined);
      await prisma.rolePermission.deleteMany({ where: { role: { companyId } } }).catch(() => undefined);
      await prisma.loginEvent.deleteMany({ where: { user: { companyId } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.role.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.shop.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.companySettings.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    }
    await app.close();
  }, 30_000);

  describe('Krok 1 — signup zakłada od razu "skorupę" organizacji, bez ręcznej ingerencji', () => {
    it('Producent i Marka samoopisane istnieją OD RAZU po signupie (dokładnie jak create-organization.ts)', async () => {
      const manufacturers = await request(app.getHttpServer()).get('/api/manufacturers').set(auth(textileToken));
      expect(manufacturers.body).toHaveLength(1);
      textileManufacturerId = manufacturers.body[0].id;

      const brands = await request(app.getHttpServer()).get('/api/brands').set(auth(textileToken));
      expect(brands.body).toHaveLength(1);
      textileBrandId = brands.body[0].id;
    });

    it('nowy Administrator ma KOMPLETNE uprawnienia RBAC (ta sama rola systemowa co każdy inny bootstrap) — w tym partnerships.manage, potrzebne dalej w tym teście', () => {
      const permissions = decodePermissions(textileToken);
      for (const code of [
        'cases.view',
        'cases.create',
        'manufacturers.manage',
        'products.manage',
        'brands.manage',
        'partnerships.view',
        'partnerships.manage',
        'company.manage',
      ]) {
        expect(permissions).toContain(code);
      }
      expect(permissions).not.toContain('cases.decision.approve');
    });

    it('nowy Administrator może się zalogować normalnie przez POST /auth/login (hasło poprawnie zahashowane)', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: `ola-${suffix}@textilepro.local`, password: 'Bezpieczne-Haslo-123!' });
      expect(login.status).toBe(200);
      expect(decodeCompanyId(login.body.accessToken)).toBe(textileCompanyId);
    });
  });

  describe('Regresja — dwie NOWE firmy o nazwach prowadzących do TEGO SAMEGO prefiksu numeracji', () => {
    // `deriveCaseNumberPrefix` bierze pierwsze 4 znaki alfanumeryczne nazwy,
    // wielkimi literami — "Alfa Tekstylna" i "Alfabet Corp" oba dają "ALFA",
    // dokładnie jak "TextilePro"/"Textylia" z przykładu w raporcie
    // wdrożeniowym 17.08 (Problem 8b). Celowo INNY prefiks niż "TEXT" (już
    // zajęty przez główną firmę tego pliku, `beforeAll` wyżej) i "ISOL" —
    // test nie może zakładać kolejności ani polegać na tym, że akurat te
    // prefiksy są jeszcze wolne. `${suffix}` w nazwie nie wpływa na prefiks
    // (dociera dopiero po pierwszych 4 znakach), więc obie firmy tu
    // NAPRAWDĘ kolidują.
    it('pierwsza firma "Alfa Tekstylna" dostaje prefiks "ALFA"', async () => {
      const signup = await signupAndLogin({
        companyName: `Alfa Tekstylna ${suffix}`,
        orgType: 'Producent',
        adminFirstName: 'Adam',
        adminLastName: 'Kolizja',
        adminEmail: `adam-kolizja-${suffix}@example.local`,
        password: 'Bezpieczne-Haslo-Kolizja-123!',
      });
      expect(signup.status).toBe(201);
      prefixCompanyAToken = signup.token!;

      const overview = await request(app.getHttpServer())
        .get('/api/settings/overview')
        .set(auth(prefixCompanyAToken));
      expect(overview.body.numbering.caseNumberPrefix).toBe('ALFA');
    });

    it('druga firma "Alfabet Corp" — TA SAMA baza prefiksu ("ALFA") — dostaje "ALFA2", NIE dzieli sekwencji z pierwszą', async () => {
      const signup = await signupAndLogin({
        companyName: `Alfabet Corp ${suffix}`,
        orgType: 'Dystrybutor',
        adminFirstName: 'Ewa',
        adminLastName: 'Kolizja',
        adminEmail: `ewa-kolizja-${suffix}@example.local`,
        password: 'Bezpieczne-Haslo-Kolizja-456!',
      });
      expect(signup.status).toBe(201);
      prefixCompanyBToken = signup.token!;

      const overview = await request(app.getHttpServer())
        .get('/api/settings/overview')
        .set(auth(prefixCompanyBToken));
      expect(overview.body.numbering.caseNumberPrefix).toBe('ALFA2');
    });

    it('obie firmy tworzą sprawę i numeracja NIE miesza się między nimi (dowód, że to nie tylko zapisany prefiks, ale realnie rozłączna sekwencja)', async () => {
      async function firstCaseNumberFor(token: string): Promise<string> {
        const manufacturers = await request(app.getHttpServer()).get('/api/manufacturers').set(auth(token));
        const manufacturerId = manufacturers.body[0].id;
        const customer = await request(app.getHttpServer())
          .post('/api/customers')
          .set(auth(token))
          .send({ firstName: 'Klient', lastName: 'Kolizja', phone: '600700800' });
        const product = await request(app.getHttpServer())
          .post('/api/products')
          .set(auth(token))
          .send({ manufacturerId, name: 'Produkt kolizji prefiksu' });
        const created = await request(app.getHttpServer())
          .post('/api/cases')
          .set(auth(token))
          .send({
            customerId: customer.body.id,
            complaintType: 'Warranty',
            requestedResolution: 'Naprawa',
            description: 'Sprawa testowa — regresja kolizji prefiksu.',
            items: [
              {
                productId: product.body.id,
                description: 'Opis usterki — kolizja prefiksu.',
                // Świeżo założony producent (Etap 6) domyślnie wymaga dowodu zakupu
                // (`Manufacturer.requiresProofOfPurchase` @default(true)) — bez tego
                // pola zapis skończyłby się 422 CASE-006, niezwiązanym z tym, co
                // faktycznie testujemy tutaj (kolizję prefiksu).
                purchaseProofNumber: 'FV-KOLIZJA-001',
              },
            ],
          });
        expect(created.status).toBe(201);
        return created.body.caseNumber as string;
      }

      const caseA = await firstCaseNumberFor(prefixCompanyAToken);
      const caseB = await firstCaseNumberFor(prefixCompanyBToken);

      expect(caseA.startsWith('ALFA/')).toBe(true);
      expect(caseB.startsWith('ALFA2/')).toBe(true);
      // Obie to PIERWSZA sprawa swojej firmy — gdyby sekwencja była
      // współdzielona (dawny błąd), druga firma dostałaby numer 00002, nie 00001.
      expect(caseA.endsWith('00001')).toBe(true);
      expect(caseB.endsWith('00001')).toBe(true);
    });
  });

  describe('Krok 2 — TextilePro konfiguruje markę/kategorie/produkty/wymagania SAMODZIELNIE, przez API panelu', () => {
    it('zmienia nazwę marki na "TextilePro Home" (PATCH /brands/:id)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/brands/${textileBrandId}`)
        .set(auth(textileToken))
        .send({ name: 'TextilePro Home' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('TextilePro Home');
    });

    it('dodaje drugą markę "TextilePro Away" — celowo NIE zostanie objęta partnerstwem (test zakresu marek niżej)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/brands')
        .set(auth(textileToken))
        .send({ manufacturerId: textileManufacturerId, name: 'TextilePro Away' });
      expect(res.status).toBe(201);
      textileAwayBrandId = res.body.id;
    });

    it('dodaje 6 kategorii produktowych: Pościel, Koce, Ręczniki, Zasłony, Poduszki, Inne', async () => {
      for (const name of ['Pościel', 'Koce', 'Ręczniki', 'Zasłony', 'Poduszki', 'Inne']) {
        const res = await request(app.getHttpServer())
          .post('/api/product-categories')
          .set(auth(textileToken))
          .send({ manufacturerId: textileManufacturerId, name });
        expect(res.status).toBe(201);
        categoryIds[name] = res.body.id;
      }
      expect(Object.keys(categoryIds)).toHaveLength(6);
    });

    it('dodaje MINIMUM 3 produkty marki TextilePro Home', async () => {
      const items = [
        { name: 'Pościel dziecięca w gwiazdki', category: 'Pościel' },
        { name: 'Koc bawełniany 150x200', category: 'Koce' },
        { name: 'Ręcznik kąpielowy XL', category: 'Ręczniki' },
      ];
      for (const item of items) {
        const res = await request(app.getHttpServer())
          .post('/api/products')
          .set(auth(textileToken))
          .send({
            manufacturerId: textileManufacturerId,
            brandId: textileBrandId,
            categoryId: categoryIds[item.category],
            name: item.name,
          });
        expect(res.status).toBe(201);
        productIds.push(res.body.id);
      }
      expect(productIds).toHaveLength(3);

      const awayProduct = await request(app.getHttpServer())
        .post('/api/products')
        .set(auth(textileToken))
        .send({ manufacturerId: textileManufacturerId, brandId: textileAwayBrandId, name: 'Zasłona Away' });
      textileAwayProductId = awayProduct.body.id;
    });

    it('ustawia wymagania producenta (numer seryjny + min. 2 zdjęcia) i override marki (bez dowodu zakupu)', async () => {
      const manufacturerUpdate = await request(app.getHttpServer())
        .patch(`/api/manufacturers/${textileManufacturerId}`)
        .set(auth(textileToken))
        .send({ requiresSerialNumber: true, minPhotos: 2, requiresProofOfPurchase: true });
      expect(manufacturerUpdate.status).toBe(200);

      const brandOverride = await request(app.getHttpServer())
        .patch(`/api/brands/${textileBrandId}`)
        .set(auth(textileToken))
        .send({ requiresProofOfPurchase: false });
      expect(brandOverride.status).toBe(200);
      expect(brandOverride.body.requiresProofOfPurchase).toBe(false);
    });

    it('konfiguruje formularz publiczny marki (publicFormSlug + publicFormDisplayName) — pola dodane w Etapie 6', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/manufacturers/${textileManufacturerId}`)
        .set(auth(textileToken))
        .send({ publicFormSlug: `textilepro-home-${suffix}`, publicFormDisplayName: 'TextilePro Home' });
      expect(res.status).toBe(200);
      expect(res.body.publicFormSlug).toBe(`textilepro-home-${suffix}`);
      expect(res.body.publicFormDisplayName).toBe('TextilePro Home');
    });
  });

  describe('Krok 3 — TextilePro zaprasza partnera B2B (mechanizm Etapu 5, nietknięty)', () => {
    it('zaprasza partnera scope\'owanego WYŁĄCZNIE do marki TextilePro Home', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/invite-partner')
        .set(auth(textileToken))
        .send({ companyName: `Partner TextilePro ${suffix}`, adminEmail: partnerAdminEmail, brandIds: [textileBrandId] });
      expect(res.status).toBe(201);
      partnershipId = res.body.id;
      partnerCompanyId = res.body.shopCompanyId;
    });

    it('partner samodzielnie zakłada konto z linku e-mailowego i jest AUTOMATYCZNIE zalogowany', async () => {
      const notification = await prisma.notification.findFirst({
        where: { companyId: textileCompanyId, recipientEmail: partnerAdminEmail },
        orderBy: { createdAt: 'desc' },
      });
      const token = notification!.body.match(/\/partner-invite\/([a-f0-9]{64})/)![1];

      const accept = await request(app.getHttpServer())
        .post(`/api/partnerships/invite/${token}/accept`)
        .send({ firstName: 'Piotr', lastName: 'Partner', password: 'Partner-Haslo-123!' });
      expect(accept.status).toBe(201);
      partnerToken = accept.body.accessToken;
      expect(decodeCompanyId(partnerToken)).toBe(partnerCompanyId);
    });
  });

  describe('Test B2C — klient detaliczny: formularz → kategoria → produkt → wymagania → RMA → Dashboard', () => {
    let caseNumber: string;

    it('formularz publiczny pokazuje WYŁĄCZNIE katalog TextilePro (kategorie/produkty/wymagania)', async () => {
      const categories = await request(app.getHttpServer()).get(
        `/api/intake/brand/textilepro-home-${suffix}/categories`,
      );
      // Kategorie żyją na PRODUCENCIE, nie na marce (`CreateProductCategoryDto` nie zna
      // `brandId`) — formularz pokazuje wszystkie 6 kategorii tego producenta, żadnej z firmy izolacyjnej.
      expect(categories.body.map((c: { name: string }) => c.name).sort()).toEqual(
        ['Inne', 'Koce', 'Pościel', 'Poduszki', 'Ręczniki', 'Zasłony'].sort(),
      );

      // `brandId` jawnie — TextilePro ma DWIE marki (Home/Away) od tego testu, więc
      // auto-wybór "jedynej marki" (Etap 4) tu nie zadziała; override niżej dotyczy
      // konkretnie `textileBrandId` (TextilePro Home).
      const requirements = await request(app.getHttpServer()).get(
        `/api/intake/brand/textilepro-home-${suffix}/requirements?brandId=${textileBrandId}`,
      );
      expect(requirements.body.requiresSerialNumber).toBe(true);
      expect(requirements.body.minPhotos).toBe(2);
      // Override marki: dowód zakupu WYŁĄCZONY dla TextilePro Home, mimo że producent go wymaga.
      expect(requirements.body.requiresProofOfPurchase).toBe(false);
    });

    it('klient detaliczny wybiera produkt i tworzy RMA — sprawa trafia do Dashboardu TextilePro jako B2C', async () => {
      const submit = await request(app.getHttpServer())
        .post(`/api/intake/brand/textilepro-home-${suffix}/complaints`)
        .send({
          reporterType: 'Customer',
          customer: {
            firstName: 'Ewa',
            lastName: 'Klientka',
            phone: '600300400',
            email: `ewa-${suffix}@example.local`,
            address: 'Lniana 3',
            city: 'Łódź',
            postalCode: '90-002',
          },
          productId: productIds[0],
          serialNumber: `SN-${suffix}`,
          issueType: 'Defect',
          description: 'Pościel po pierwszym praniu ma widoczną wadę szwu.',
          requiredConsent: true,
        });
      expect(submit.status).toBe(201);
      caseNumber = submit.body.caseNumber;
    });

    it('sprawa jest widoczna w GET /cases TextilePro i liczy się jako B2C w Dashboardzie', async () => {
      const cases = await request(app.getHttpServer()).get('/api/cases').set(auth(textileToken));
      const created = cases.body.find((c: { caseNumber: string }) => c.caseNumber === caseNumber);
      expect(created).toBeDefined();
      expect(created.reportedByPartnerCompanyName).toBeFalsy();

      const dashboard = await request(app.getHttpServer())
        .get('/api/dashboard/summary?source=b2c')
        .set(auth(textileToken));
      expect(dashboard.body.totalActive).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Test B2B — partner: loguje się, widzi dozwoloną markę, tworzy reklamację, trafia do TextilePro', () => {
    it('PARTNERSHIP-005 — partner NIE może zgłosić reklamacji dla marki "TextilePro Away" (poza zakresem partnerstwa)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/intake/brand/textilepro-home-${suffix}/complaints`)
        .send({
          reporterType: 'Partner',
          partnerCompanyId,
          partnerRequestType: 'Presale',
          partnerContact: {
            firstName: 'Piotr',
            lastName: 'Partner',
            phone: '600500600',
            email: `piotr-${suffix}@example.local`,
          },
          productId: textileAwayProductId,
          issueType: 'Defect',
          description: 'Zgłoszenie testowe — marka spoza zakresu partnerstwa.',
          requiredConsent: true,
        });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PARTNERSHIP-005');
    });

    it('partner zgłasza reklamację dla DOZWOLONEJ marki (TextilePro Home) — trafia do TextilePro jako B2B', async () => {
      const submit = await request(app.getHttpServer())
        .post(`/api/intake/brand/textilepro-home-${suffix}/complaints`)
        .send({
          reporterType: 'Partner',
          partnerCompanyId,
          partnerRequestType: 'Presale',
          partnerContact: {
            firstName: 'Piotr',
            lastName: 'Partner',
            phone: '600500600',
            email: `piotr-${suffix}@example.local`,
          },
          productId: productIds[1],
          // Producent (TextilePro) wymaga numeru seryjnego (ustawione w "Krok 2" wyżej) —
          // marka TextilePro Home nadpisuje WYŁĄCZNIE `requiresProofOfPurchase`, więc numer
          // seryjny nadal jest wymagany (CASE-004), inaczej niż dowód zakupu (nieobecny celowo).
          serialNumber: `SN-B2B-${suffix}`,
          issueType: 'MissingPart',
          description: 'Zamówienie przedsprzedażowe — brakujący element w komplecie kocy.',
          requiredConsent: true,
        });
      expect(submit.status).toBe(201);

      const cases = await request(app.getHttpServer()).get('/api/cases').set(auth(textileToken));
      const created = cases.body.find((c: { caseNumber: string }) => c.caseNumber === submit.body.caseNumber);
      expect(created).toBeDefined();
      expect(created.reportedByPartnerCompanyName).toBe(`Partner TextilePro ${suffix}`);

      const dashboard = await request(app.getHttpServer())
        .get('/api/dashboard/summary?source=b2b')
        .set(auth(textileToken));
      expect(dashboard.body.totalActive).toBeGreaterThanOrEqual(1);
    });

    it('partner widzi WYŁĄCZNIE markę TextilePro Home w kroku "Marka" formularza, nigdy TextilePro Away', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/intake/brand/textilepro-home-${suffix}/brands?partnerCompanyId=${partnerCompanyId}`,
      );
      expect(res.body.map((b: { name: string }) => b.name)).toEqual(['TextilePro Home']);
    });
  });

  describe('Izolacja tenantów — TextilePro nie widzi/nie może użyć danych innej, niezależnej firmy', () => {
    it('GET /manufacturers TextilePro nie zawiera producenta firmy izolacyjnej', async () => {
      const res = await request(app.getHttpServer()).get('/api/manufacturers').set(auth(textileToken));
      expect(res.body.map((m: { id: string }) => m.id)).not.toContain(isolationManufacturerId);
    });

    it('GET /manufacturers/:id — 404 przy UUID producenta innej firmy, mimo że jest prawdziwy (nie ujawnia istnienia)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/manufacturers/${isolationManufacturerId}`)
        .set(auth(textileToken));
      expect(res.status).toBe(404);
    });

    it('POST /products — 404 przy podstawieniu CUDZEGO manufacturerId/brandId (IDOR) — nie tworzy produktu', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/products')
        .set(auth(textileToken))
        .send({ manufacturerId: isolationManufacturerId, brandId: isolationBrandId, name: 'Przejęty produkt' });
      expect(res.status).toBe(404);
    });

    it('POST /product-categories — 404 przy dopisaniu kategorii do CUDZEGO manufacturerId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/product-categories')
        .set(auth(textileToken))
        .send({ manufacturerId: isolationManufacturerId, name: 'Przejęta kategoria' });
      expect(res.status).toBe(404);
    });

    it('GET /cases TextilePro nie zawiera ŻADNEJ sprawy firmy izolacyjnej ani partnera', async () => {
      const res = await request(app.getHttpServer()).get('/api/cases').set(auth(textileToken));
      for (const c of res.body as Array<{ items: Array<{ productId: string }> }>) {
        for (const item of c.items) {
          expect(item.productId).not.toBe(isolationProductId);
        }
      }
    });

    it('GET /partnerships TextilePro nie zawiera partnerstw firmy izolacyjnej', async () => {
      const res = await request(app.getHttpServer()).get('/api/partnerships').set(auth(textileToken));
      const isolationCompanyId = decodeCompanyId(isolationToken);
      for (const p of res.body as Array<{ shopCompanyId: string; distributorCompanyId: string }>) {
        expect(p.shopCompanyId).not.toBe(isolationCompanyId);
        expect(p.distributorCompanyId).not.toBe(isolationCompanyId);
      }
    });

    it('partner TextilePro NIE widzi partnerstw/spraw firmy izolacyjnej (osobny tenant, mimo wspólnego mechanizmu Partnerships)', async () => {
      const res = await request(app.getHttpServer()).get('/api/partnerships').set(auth(partnerToken));
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body.every((p: { id: string }) => p.id === partnershipId)).toBe(true);
    });

    it('firma izolacyjna z kolei nie widzi NICZEGO z TextilePro (dwukierunkowa izolacja)', async () => {
      const res = await request(app.getHttpServer()).get('/api/manufacturers').set(auth(isolationToken));
      expect(res.body.map((m: { id: string }) => m.id)).not.toContain(textileManufacturerId);

      const cases = await request(app.getHttpServer()).get('/api/cases').set(auth(isolationToken));
      expect(cases.body).toEqual([]);
    });

    it('firma izolacyjna nie może pobrać ani zaakceptować partnerstwa TextilePro znając samo UUID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/partnerships/${partnershipId}`)
        .set(auth(isolationToken));
      expect(res.status).toBe(404);
    });
  });

  describe('Formularz publiczny działa dla DOWOLNEGO producenta symetrycznie — dowód, że nic nie jest zaszyte pod branżę mebli', () => {
    it('kategoria/produkt firmy izolacyjnej NIE pojawiają się w formularzu TextilePro i odwrotnie', async () => {
      const textileProducts = await request(app.getHttpServer()).get(
        `/api/intake/brand/textilepro-home-${suffix}/products`,
      );
      expect(textileProducts.body.map((p: { id: string }) => p.id)).not.toContain(isolationProductId);
    });
  });
});
