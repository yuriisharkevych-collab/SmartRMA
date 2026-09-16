import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { toValidationException } from '../src/common/validation/to-validation-exception';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { PasswordService } from '../src/modules/auth/services/password.service';

/**
 * Faza 7 planu B2B — audyt bezpieczeństwa wielo-organizacyjny (IDOR), NA
 * ŻYWO przez prawdziwe żądania HTTP przeciw prawdziwej bazie (nie przegląd
 * kodu). Trzy PRAWDZIWE, niezależne organizacje:
 *
 *   - `shop` (Sklep) — inicjuje partnerstwo i przekazanie sprawy.
 *   - `dist` (Dystrybutor/Producent) — strona zaproszona, akceptuje.
 *   - `outsider` — TRZECIA firma, NIE strona żadnej relacji z `shop`/`dist`
 *     (ani partnerstwa, ani przekazania) — reprezentuje atakującego, który
 *     zna prawdziwe UUID (np. z logów/URL), ale nie ma do nich żadnego
 *     legalnego dostępu.
 *
 * Każdy test w tym pliku to PRÓBA uzyskania cudzych danych przez podstawienie
 * cudzego identyfikatora pod WŁASNY, prawdziwy token JWT — dokładnie to, o co
 * poprosił właściciel ("testy, które rzeczywiście próbują uzyskać cudze
 * dane"), nie tylko odczyt kodu.
 */
describe('Multi-tenant IDOR (e2e) — Faza 7', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const password = 'Test-Password-123!';
  const suffix = Date.now();

  type Org = {
    companyId: string;
    slug: string;
    manufacturerId: string;
    brandId: string;
    productId: string;
    customerId: string;
    token: string;
  };
  let shop: Org;
  let dist: Org;
  let outsider: Org;

  // Sprawa Sklepu, przekazana Dystrybutorowi — i jej "bliźniak" w tenancie Dystrybutora.
  let shopCaseId: string;
  let distTargetCaseId: string;
  let partnershipId: string;
  let distOwnBrandId: string;
  let uploadedDocumentId: string;

  const ALL_PERMISSIONS = [
    'cases.view',
    'cases.create',
    'cases.edit',
    'cases.status.change',
    'cases.decision.set',
    'cases.decision.approve',
    'cases.cancel',
    'cases.archive',
    'cases.assign',
    'cases.infoRequest.send',
    'cases.portal.manage',
    'cases.handoff.send',
    'documents.upload',
    'documents.view',
    'documents.markInvalid',
    'notes.create',
    'notes.view',
    'messages.send',
    'messages.view',
    'partnerships.view',
    'partnerships.manage',
    'brands.manage',
    'manufacturers.manage',
  ];

  /** Zakłada jedną, kompletną, PRAWDZIWĄ organizację — firma + katalog statusów + samoopisany Manufacturer/Brand + klient + rola z pełnymi uprawnieniami + zalogowany token. Ten sam wzorzec co `cases.e2e-spec.ts`, rozszerzony o to, czego potrzebuje Faza 4/5/6. */
  async function createOrg(name: string): Promise<Org> {
    const company = await prisma.company.create({
      data: { name: `${name} ${suffix}`, slug: `${name.toLowerCase()}-idor-${suffix}` },
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

    const contractor = await prisma.contractor.create({ data: { companyId: company.id, name: `${name} kontrahent ${suffix}` } });
    const manufacturer = await prisma.manufacturer.create({
      data: {
        companyId: company.id,
        contractorId: contractor.id,
        requiresSerialNumber: false,
        requiresFrameNumber: false,
        requiresProofOfPurchase: false,
      },
    });
    const brand = await prisma.brand.create({ data: { companyId: company.id, manufacturerId: manufacturer.id, name: `${name} marka ${suffix}` } });
    const product = await prisma.product.create({ data: { companyId: company.id, manufacturerId: manufacturer.id, brandId: brand.id, name: `${name} produkt ${suffix}` } });
    const customer = await prisma.customer.create({ data: { companyId: company.id, firstName: 'Jan', lastName: 'Testowy', phone: '600000000' } });

    const permissions = await Promise.all(
      ALL_PERMISSIONS.map((code) => prisma.permission.upsert({ where: { code }, update: {}, create: { code, module: code.split('.')[0], description: code } })),
    );
    const role = await prisma.role.create({
      data: {
        companyId: company.id,
        name: `${name} Admin ${suffix}`,
        code: `${name.toLowerCase()}-admin-${suffix}`,
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });
    const email = `e2e-idor-${name.toLowerCase()}-${suffix}@example.com`;
    await prisma.user.create({
      data: {
        companyId: company.id,
        firstName: name,
        lastName: 'E2E',
        email,
        passwordHash: await passwordService.hash(password),
        active: true,
        emailVerifiedAt: new Date(),
        roles: { create: [{ roleId: role.id }] },
      },
    });

    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password });
    return {
      companyId: company.id,
      slug: company.slug!,
      manufacturerId: manufacturer.id,
      brandId: brand.id,
      productId: product.id,
      customerId: customer.id,
      token: login.body.accessToken,
    };
  }

  let passwordService: PasswordService;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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
    passwordService = app.get(PasswordService);

    shop = await createOrg('Shop');
    dist = await createOrg('Dist');
    outsider = await createOrg('Outsider');

    // Dystrybutor oznaczony jako ManufacturerDistributor — wymóg PARTNERSHIP-001.
    await prisma.company.update({ where: { id: dist.companyId }, data: { type: 'ManufacturerDistributor', orgKind: 'Dystrybutor' } });
    distOwnBrandId = dist.brandId;

    // 1) Sklep zaprasza Dystrybutora, scope'owane do WŁASNEJ marki Dystrybutora.
    const invite = await request(app.getHttpServer())
      .post('/api/partnerships/invite')
      .set(auth(shop.token))
      .send({ distributorSlug: dist.slug, brandIds: [distOwnBrandId] });
    partnershipId = invite.body.id;
    await request(app.getHttpServer()).post(`/api/partnerships/${partnershipId}/accept`).set(auth(dist.token));

    // 2) Sklep tworzy sprawę i przekazuje ją Dystrybutorowi.
    const created = await request(app.getHttpServer())
      .post('/api/cases')
      .set(auth(shop.token))
      .send({
        customerId: shop.customerId,
        complaintType: 'Warranty',
        requestedResolution: 'Naprawa',
        description: 'IDOR e2e — sprawa testowa.',
        items: [{ productId: shop.productId, description: 'Opis usterki.' }],
      });
    shopCaseId = created.body.id;

    const handoff = await request(app.getHttpServer())
      .post(`/api/cases/${shopCaseId}/handoff`)
      .set(auth(shop.token))
      .send({ partnershipId, brandId: distOwnBrandId });
    const targetCaseNumber = handoff.body.targetCaseNumber;
    const distCases = await request(app.getHttpServer()).get('/api/cases').set(auth(dist.token));
    distTargetCaseId = distCases.body.find((c: { caseNumber: string }) => c.caseNumber === targetCaseNumber).id;

    // 3) Sklep wgrywa dokument do swojej sprawy — cel testów IDOR na Documents.
    const upload = await request(app.getHttpServer())
      .post(`/api/cases/${shopCaseId}/documents`)
      .set(auth(shop.token))
      .attach('file', Buffer.from('%PDF-1.4 idor-test-content'), 'idor-test.pdf');
    uploadedDocumentId = upload.body.id;

    // Notatka + wiadomość na sprawie Sklepu — cele testów IDOR.
    await request(app.getHttpServer()).post(`/api/cases/${shopCaseId}/notes`).set(auth(shop.token)).send({ content: 'Notatka wewnętrzna.' });
    await request(app.getHttpServer()).post(`/api/cases/${shopCaseId}/messages`).set(auth(shop.token)).send({ channel: 'Email', content: 'Wiadomość do klienta.' });
  }, 60_000);

  afterAll(async () => {
    for (const companyId of [shop.companyId, dist.companyId, outsider.companyId]) {
      await prisma.auditLog.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.caseHandoff.deleteMany({ where: { OR: [{ originCompanyId: companyId }, { targetCompanyId: companyId }] } }).catch(() => undefined);
      await prisma.partnershipBrand.deleteMany({ where: { partnership: { OR: [{ shopCompanyId: companyId }, { distributorCompanyId: companyId }] } } }).catch(() => undefined);
      await prisma.partnership.deleteMany({ where: { OR: [{ shopCompanyId: companyId }, { distributorCompanyId: companyId }] } }).catch(() => undefined);
      await prisma.document.deleteMany({ where: { case: { companyId } } }).catch(() => undefined);
      await prisma.note.deleteMany({ where: { case: { companyId } } }).catch(() => undefined);
      await prisma.message.deleteMany({ where: { case: { companyId } } }).catch(() => undefined);
      await prisma.caseHistory.deleteMany({ where: { case: { companyId } } }).catch(() => undefined);
      await prisma.caseItem.deleteMany({ where: { case: { companyId } } }).catch(() => undefined);
      await prisma.case.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.product.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.brand.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.manufacturer.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.contractor.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.customer.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.caseStatusDefinition.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.role.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    }
    await app.close();
  }, 30_000);

  describe('Cases — Outsider z prawdziwym UUID cudzej sprawy', () => {
    it('GET /cases/:id — 404, nie 403 (nie ujawnia nawet ISTNIENIA sprawy)', async () => {
      const res = await request(app.getHttpServer()).get(`/api/cases/${shopCaseId}`).set(auth(outsider.token));
      expect(res.status).toBe(404);
    });

    it('PATCH /cases/:id — nie może edytować opisu cudzej sprawy', async () => {
      const res = await request(app.getHttpServer()).patch(`/api/cases/${shopCaseId}`).set(auth(outsider.token)).send({ description: 'PRZEJĘTO' });
      expect(res.status).toBe(404);
    });

    it('PUT /cases/:id/status — nie może zmienić statusu cudzej sprawy', async () => {
      const res = await request(app.getHttpServer()).put(`/api/cases/${shopCaseId}/status`).set(auth(outsider.token)).send({ status: 'Nowa' });
      expect(res.status).toBe(404);
    });

    it('PUT /cases/:id/decision — nie może ustawić decyzji w cudzej sprawie', async () => {
      const res = await request(app.getHttpServer()).put(`/api/cases/${shopCaseId}/decision`).set(auth(outsider.token)).send({ decision: 'Naprawa' });
      expect(res.status).toBe(404);
    });

    it('GET /cases/:id/history — nie widzi historii cudzej sprawy', async () => {
      const res = await request(app.getHttpServer()).get(`/api/cases/${shopCaseId}/history`).set(auth(outsider.token));
      expect(res.status).toBe(404);
    });

    it('GET /cases/:id/notes — nie widzi notatek wewnętrznych cudzej sprawy', async () => {
      const res = await request(app.getHttpServer()).get(`/api/cases/${shopCaseId}/notes`).set(auth(outsider.token));
      expect(res.status).toBe(404);
    });

    it('POST /cases/:id/notes — nie może dopisać notatki do cudzej sprawy', async () => {
      const res = await request(app.getHttpServer()).post(`/api/cases/${shopCaseId}/notes`).set(auth(outsider.token)).send({ content: 'wstrzyknięta notatka' });
      expect(res.status).toBe(404);
    });

    it('GET /cases/:id/messages — nie widzi korespondencji cudzej sprawy', async () => {
      const res = await request(app.getHttpServer()).get(`/api/cases/${shopCaseId}/messages`).set(auth(outsider.token));
      expect(res.status).toBe(404);
    });

    it('POST /cases/:id/messages — nie może wysłać wiadomości w cudzej sprawie', async () => {
      const res = await request(app.getHttpServer()).post(`/api/cases/${shopCaseId}/messages`).set(auth(outsider.token)).send({ channel: 'Email', content: 'x' });
      expect(res.status).toBe(404);
    });
  });

  describe('Documents — Outsider I legalny partner B2B (Dystrybutor) z prawdziwym UUID dokumentu', () => {
    it('Outsider: GET /cases/:id/documents — nie widzi listy załączników', async () => {
      const res = await request(app.getHttpServer()).get(`/api/cases/${shopCaseId}/documents`).set(auth(outsider.token));
      expect(res.status).toBe(404);
    });

    it('Outsider: GET /cases/:id/documents/:documentId/file — nie może pobrać cudzego pliku', async () => {
      const res = await request(app.getHttpServer()).get(`/api/cases/${shopCaseId}/documents/${uploadedDocumentId}/file`).set(auth(outsider.token));
      expect(res.status).toBe(404);
    });

    it('Outsider: POST /cases/:id/documents — nie może dołączyć pliku do cudzej sprawy', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/cases/${shopCaseId}/documents`)
        .set(auth(outsider.token))
        .attach('file', Buffer.from('%PDF-1.4 attacker'), 'attacker.pdf');
      expect(res.status).toBe(404);
    });

    it('Dystrybutor (PRAWDZIWY partner B2B tej sprawy) — mimo aktywnego przekazania NIE widzi dokumentów Sklepu (CaseHandoff nie dzieli dokumentów/notatek)', async () => {
      const res = await request(app.getHttpServer()).get(`/api/cases/${shopCaseId}/documents`).set(auth(dist.token));
      expect(res.status).toBe(404);
    });
  });

  describe('Partnerships — Outsider i strona-nie-adresat z prawdziwym UUID partnerstwa', () => {
    it('Outsider: GET /partnerships/:id — nie widzi cudzego partnerstwa (nie jest żadną ze stron)', async () => {
      const res = await request(app.getHttpServer()).get(`/api/partnerships/${partnershipId}`).set(auth(outsider.token));
      expect(res.status).toBe(404);
    });

    it('Outsider: POST /partnerships/:id/accept — nie może zaakceptować cudzego partnerstwa', async () => {
      const res = await request(app.getHttpServer()).post(`/api/partnerships/${partnershipId}/accept`).set(auth(outsider.token));
      expect(res.status).toBe(404);
    });

    it('Sklep (STRONA partnerstwa, ale nie adresat zaproszenia) — PARTNERSHIP-003, nie może sam siebie zaakceptować', async () => {
      const res = await request(app.getHttpServer()).post(`/api/partnerships/${partnershipId}/accept`).set(auth(shop.token));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PARTNERSHIP-003');
    });

    it('PARTNERSHIP-004 — Outsider (bez wcześniejszego partnerstwa z Dystrybutorem) próbuje zaprosić go z marką NALEŻĄCĄ DO SIEBIE (nie do Dystrybutora)', async () => {
      // `shop` woła się tu celowo pomija — Sklep i Dystrybutor mają już Aktywne
      // partnerstwo (utworzone w `beforeAll`), więc druga próba zderzyłaby się
      // najpierw z PARTNERSHIP-002, zanim dotarłaby do walidacji marki.
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/invite')
        .set(auth(outsider.token))
        .send({ distributorSlug: dist.slug, brandIds: [outsider.brandId] });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PARTNERSHIP-004');
    });

    it('PARTNERSHIP-001 — Sklep próbuje zaprosić Outsidera (zwykły Sklep, nie Producent/Dystrybutor) jako partnera', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/invite')
        .set(auth(shop.token))
        .send({ distributorSlug: outsider.slug, brandIds: [outsider.brandId] });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PARTNERSHIP-001');
    });
  });

  describe('CaseHandoff — wątek między-organizacyjny i próba przekazania cudzej sprawy', () => {
    it('Outsider: GET /cases/:id/handoff — nie widzi wątku cudzej sprawy (blokowane już na bramce cases.view)', async () => {
      const res = await request(app.getHttpServer()).get(`/api/cases/${shopCaseId}/handoff`).set(auth(outsider.token));
      expect(res.status).toBe(404);
    });

    it('Outsider: POST /cases/:id/handoff — nie może przekazać CUDZEJ sprawy partnerowi, nawet znając prawdziwe partnershipId/brandId', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/cases/${shopCaseId}/handoff`)
        .set(auth(outsider.token))
        .send({ partnershipId, brandId: distOwnBrandId });
      expect(res.status).toBe(404);
    });

    it('PARTNERSHIP-006 — Sklep nie może przekazać TEJ SAMEJ sprawy drugi raz', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/cases/${shopCaseId}/handoff`)
        .set(auth(shop.token))
        .send({ partnershipId, brandId: distOwnBrandId });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PARTNERSHIP-006');
    });

    it('Dystrybutor (legalny partner) WIDZI wątek — ale odpowiedź zawiera WYŁĄCZNIE wąską, dozwoloną listę pól (nigdy notatek/wiadomości/customerId/description)', async () => {
      const res = await request(app.getHttpServer()).get(`/api/cases/${distTargetCaseId}/handoff`).set(auth(dist.token));
      expect(res.status).toBe(200);
      expect(res.body.receivedFrom).toBeTruthy();
      const allowedKeys = ['companyName', 'caseNumber', 'status', 'statusLabel', 'decision', 'updatedAt', 'createdAt'];
      expect(Object.keys(res.body.receivedFrom).sort()).toEqual(allowedKeys.sort());
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('IDOR e2e — sprawa testowa');
      expect(serialized).not.toContain('Notatka wewnętrzna');
      expect(serialized).not.toContain('Wiadomość do klienta');
    });
  });

  describe('Brands / Manufacturers — cross-tenant przez Products API', () => {
    it('Outsider: GET /brands/:id — nie widzi cudzej marki po prawdziwym UUID', async () => {
      const res = await request(app.getHttpServer()).get(`/api/brands/${shop.brandId}`).set(auth(outsider.token));
      expect(res.status).toBe(404);
    });
  });
});
