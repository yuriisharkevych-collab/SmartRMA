import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { toValidationException } from '../src/common/validation/to-validation-exception';
import { PasswordService } from '../src/modules/auth/services/password.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Etap 5 — Partnerzy B2B i onboarding partnera, NA ŻYWO przez prawdziwe żądania
 * HTTP przeciw prawdziwej bazie (nie przegląd kodu). Pokrywa DRUGI, nowy sposób
 * zawiązania partnerstwa (`invitePartner`/`getInviteInfo`/`acceptPartnerInvite`
 * — Dystrybutor zaprasza e-mailem firmę, która JESZCZE NIE ISTNIEJE), którego
 * NIE pokrywa `multi-tenant-idor.e2e-spec.ts` (tam wyłącznie stary, slugowy
 * `invite()`). Scenariusz odzwierciedla żądanie właściciela: Dystrybutor
 * zaprasza nowego partnera, partner zakłada konto, zgłasza reklamację B2B
 * wyłącznie dla marki objętej `PartnershipBrand`, sprawa trafia do
 * Dystrybutora i liczy się w liczniku B2B Dashboardu.
 */
describe('Partner B2B onboarding (e2e) — Etap 5', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;

  const password = 'Test-Password-123!';
  const suffix = Date.now();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  type Org = {
    companyId: string;
    slug: string;
    manufacturerId: string;
    brandId: string; // "granted" — jedyna marka, do której zapraszamy partnera
    otherBrandId: string; // marka NIE objęta partnerstwem — cel testu PARTNERSHIP-005
    productId: string; // produkt marki `brandId`
    otherBrandProductId: string; // produkt marki `otherBrandId`
    brandSlug: string;
    userId: string;
    token: string;
  };
  let dist: Org;
  let outsider: Org;

  // Firma partnera — NIE istnieje przed `invitePartner`, zakładana przez backend.
  let partnerCompanyId: string;
  let partnerToken: string;
  const partnerCompanyName = `Partner DAWIDAM ${suffix}`;
  const partnerAdminEmail = `e2e-partner-admin-${suffix}@example.com`;
  let partnershipId: string;
  let inviteToken: string;

  const ALL_PERMISSIONS = [
    'cases.view',
    'cases.create',
    'partnerships.view',
    'partnerships.manage',
    'brands.manage',
    'manufacturers.manage',
  ];

  async function createOrg(name: string): Promise<Org> {
    const company = await prisma.company.create({
      data: { name: `${name} ${suffix}`, slug: `${name.toLowerCase()}-partner-e2e-${suffix}` },
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

    const contractor = await prisma.contractor.create({
      data: { companyId: company.id, name: `${name} kontrahent ${suffix}` },
    });
    const manufacturer = await prisma.manufacturer.create({
      data: {
        companyId: company.id,
        contractorId: contractor.id,
        publicFormSlug: `${name.toLowerCase()}-brand-e2e-${suffix}`,
        requiresSerialNumber: false,
        requiresFrameNumber: false,
        requiresProofOfPurchase: false,
      },
    });
    const brand = await prisma.brand.create({
      data: { companyId: company.id, manufacturerId: manufacturer.id, name: `${name} marka A ${suffix}` },
    });
    const otherBrand = await prisma.brand.create({
      data: { companyId: company.id, manufacturerId: manufacturer.id, name: `${name} marka B ${suffix}` },
    });
    const product = await prisma.product.create({
      data: { companyId: company.id, manufacturerId: manufacturer.id, brandId: brand.id, name: `${name} produkt A ${suffix}` },
    });
    const otherBrandProduct = await prisma.product.create({
      data: { companyId: company.id, manufacturerId: manufacturer.id, brandId: otherBrand.id, name: `${name} produkt B ${suffix}` },
    });

    const permissions = await Promise.all(
      ALL_PERMISSIONS.map((code) =>
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
        code: `${name.toLowerCase()}-partner-admin-${suffix}`,
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });
    const email = `e2e-partner-${name.toLowerCase()}-${suffix}@example.com`;
    const user = await prisma.user.create({
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
      otherBrandId: otherBrand.id,
      productId: product.id,
      otherBrandProductId: otherBrandProduct.id,
      brandSlug: manufacturer.publicFormSlug!,
      userId: user.id,
      token: login.body.accessToken,
    };
  }

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

    dist = await createOrg('Dist');
    outsider = await createOrg('Outsider');
    await prisma.company.update({
      where: { id: dist.companyId },
      data: { type: 'ManufacturerDistributor', orgKind: 'Dystrybutor' },
    });
  }, 60_000);

  afterAll(async () => {
    const companyIds = [dist.companyId, outsider.companyId, partnerCompanyId].filter(Boolean);
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
      await prisma.brand.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.manufacturer.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.contractor.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.customer.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.caseStatusDefinition.deleteMany({ where: { companyId } }).catch(() => undefined);
      // `UserRoleAssignment`/`RolePermission` (tabele łączące) nie mają `onDelete: Cascade` w
      // schemacie — bez ich usunięcia NAJPIERW, `user.deleteMany`/`role.deleteMany` niżej rzucają
      // FK violation, ale ta jest cicho połykana przez `.catch(() => undefined)` (ten sam wzorzec co
      // reszta tego bloku), więc `Company` zostaje osierocona BEZ widocznego błędu testu.
      await prisma.userRoleAssignment.deleteMany({ where: { user: { companyId } } }).catch(() => undefined);
      await prisma.rolePermission.deleteMany({ where: { role: { companyId } } }).catch(() => undefined);
      // `POST /auth/login` w `createOrg()` (i auto-login po `acceptPartnerInvite`) zapisuje
      // `LoginEvent` — kolejna tabela łącząca bez `onDelete: Cascade` blokująca `user.deleteMany`.
      await prisma.loginEvent.deleteMany({ where: { user: { companyId } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.role.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.shop.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.companySettings.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    }
    await app.close();
  }, 30_000);

  describe('Zaproszenie e-mailem nowego partnera (invitePartner)', () => {
    it('PARTNERSHIP-004 — Dystrybutor nie może scope\'ować zaproszenia do marki, której nie posiada', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/invite-partner')
        .set(auth(dist.token))
        .send({
          companyName: 'Firma widmo',
          adminEmail: `nieistnieje-${suffix}@example.com`,
          brandIds: [outsider.brandId],
        });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PARTNERSHIP-004');
    });

    it('bez tokenu — 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/invite-partner')
        .send({ companyName: 'X', adminEmail: 'x@example.com', brandIds: [] });
      expect(res.status).toBe(401);
    });

    it('201 — zaprasza NOWĄ firmę, zakłada ją pustą i wysyła e-mail z linkiem', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/invite-partner')
        .set(auth(dist.token))
        .send({ companyName: partnerCompanyName, adminEmail: partnerAdminEmail, brandIds: [dist.brandId] });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('Invited');
      expect(res.body.hasPendingInvite).toBe(true);
      expect(res.body.inviteEmail).toBe(partnerAdminEmail);
      expect(res.body.brands.map((b: { id: string }) => b.id)).toEqual([dist.brandId]);
      expect(res.body.caseCount).toBe(0);
      partnershipId = res.body.id;
      partnerCompanyId = res.body.shopCompanyId;

      const notification = await prisma.notification.findFirst({
        where: { companyId: dist.companyId, recipientEmail: partnerAdminEmail },
        orderBy: { createdAt: 'desc' },
      });
      expect(notification).not.toBeNull();
      const match = notification!.body.match(/\/partner-invite\/([a-f0-9]{64})/);
      expect(match).not.toBeNull();
      inviteToken = match![1];
    });

    it('PARTNERSHIP-008 — nie można ponownie zaprosić tego samego e-maila u tego samego Dystrybutora, gdy zaproszenie już oczekuje', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/invite-partner')
        .set(auth(dist.token))
        .send({ companyName: 'Duplikat', adminEmail: partnerAdminEmail, brandIds: [dist.brandId] });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PARTNERSHIP-008');
    });

    it('Outsider (trzecia firma) NIE widzi oczekującego zaproszenia w swojej liście partnerstw', async () => {
      const res = await request(app.getHttpServer()).get('/api/partnerships').set(auth(outsider.token));
      expect(res.body.find((p: { id: string }) => p.id === partnershipId)).toBeUndefined();
    });

    it('Dystrybutor widzi zaproszenie w swojej liście z hasPendingInvite=true', async () => {
      const res = await request(app.getHttpServer()).get('/api/partnerships').set(auth(dist.token));
      const row = res.body.find((p: { id: string }) => p.id === partnershipId);
      expect(row).toBeDefined();
      expect(row.hasPendingInvite).toBe(true);
      expect(row.status).toBe('Invited');
    });
  });

  describe('Akceptacja zaproszenia (getInviteInfo / acceptPartnerInvite) — publiczne, bez sesji', () => {
    it('PARTNERSHIP-007 — nieprawidłowy/losowy token', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/partnerships/invite/0000000000000000000000000000000000000000000000000000000000000000',
      );
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('PARTNERSHIP-007');
    });

    it('GET /partnerships/invite/:token — zwraca nazwę firmy, dystrybutora, e-mail i nazwy marek', async () => {
      const res = await request(app.getHttpServer()).get(`/api/partnerships/invite/${inviteToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        companyName: partnerCompanyName,
        distributorName: `Dist ${suffix}`,
        email: partnerAdminEmail,
        brandNames: [`Dist marka A ${suffix}`],
      });
    });

    it('POST /partnerships/invite/:token/accept — zakłada konto Administratora i loguje od razu (zwraca AuthTokens)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/partnerships/invite/${inviteToken}/accept`)
        .send({ firstName: 'Dawid', lastName: 'Testowy', password });
      expect(res.status).toBe(201);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
      partnerToken = res.body.accessToken;

      const decoded = JSON.parse(
        Buffer.from(partnerToken.split('.')[1], 'base64').toString('utf8'),
      );
      expect(decoded.companyId).toBe(partnerCompanyId);
      expect(decoded.email).toBe(partnerAdminEmail);
      expect(decoded.permissions).toContain('partnerships.view');
    });

    it('partnerstwo jest teraz Active, hasPendingInvite=false — widoczne obu stronom', async () => {
      const res = await request(app.getHttpServer()).get(`/api/partnerships/${partnershipId}`).set(auth(dist.token));
      expect(res.body.status).toBe('Active');
      expect(res.body.hasPendingInvite).toBe(false);
      expect(res.body.inviteEmail).toBeNull();

      const fromPartner = await request(app.getHttpServer())
        .get(`/api/partnerships/${partnershipId}`)
        .set(auth(partnerToken));
      expect(fromPartner.status).toBe(200);
      expect(fromPartner.body.id).toBe(partnershipId);
    });

    it('PARTNERSHIP-007 — token jednorazowy, druga próba akceptacji tym samym linkiem odrzucona', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/partnerships/invite/${inviteToken}/accept`)
        .send({ firstName: 'Ktoś', lastName: 'Inny', password });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('PARTNERSHIP-007');
    });

    it('Outsider NIE może zaakceptować/odrzucić/dezaktywować cudzego (już zresztą aktywnego) partnerstwa', async () => {
      const reject = await request(app.getHttpServer())
        .post(`/api/partnerships/${partnershipId}/reject`)
        .set(auth(outsider.token));
      expect(reject.status).toBe(404);
      const deactivate = await request(app.getHttpServer())
        .post(`/api/partnerships/${partnershipId}/deactivate`)
        .set(auth(outsider.token));
      expect(deactivate.status).toBe(404);
    });
  });

  describe('Zgłoszenie B2B "w imieniu klienta końcowego" — zakres marek (PartnershipBrand)', () => {
    it('GET /intake/brand/:brandSlug/brands?partnerCompanyId=… zawęża do WYŁĄCZNIE marki objętej partnerstwem', async () => {
      const all = await request(app.getHttpServer()).get(`/api/intake/brand/${dist.brandSlug}/brands`);
      expect(all.body.map((b: { id: string }) => b.id).sort()).toEqual(
        [dist.brandId, dist.otherBrandId].sort(),
      );

      const scoped = await request(app.getHttpServer()).get(
        `/api/intake/brand/${dist.brandSlug}/brands?partnerCompanyId=${partnerCompanyId}`,
      );
      expect(scoped.body.map((b: { id: string }) => b.id)).toEqual([dist.brandId]);
    });

    let b2bCaseNumber: string;

    it('PARTNERSHIP-005 — partner NIE może zgłosić reklamacji dla marki spoza swojego PartnershipBrand', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/intake/brand/${dist.brandSlug}/complaints`)
        .send({
          reporterType: 'Partner',
          partnerCompanyId,
          partnerRequestType: 'OnBehalfOfCustomer',
          contactPreference: 'Customer',
          customer: {
            firstName: 'Klient',
            lastName: 'Końcowy',
            phone: '600100200',
            email: `klient-${suffix}@example.com`,
            address: 'Testowa 1',
            city: 'Warszawa',
            postalCode: '00-001',
          },
          productId: dist.otherBrandProductId,
          issueType: 'Defect',
          description: 'Zgłoszenie testowe — marka spoza zakresu partnerstwa.',
          requiredConsent: true,
        });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PARTNERSHIP-005');
    });

    it('201 — zgłoszenie B2B "w imieniu klienta końcowego" dla marki objętej partnerstwem trafia do Dystrybutora z reportedByPartnerCompanyId', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/intake/brand/${dist.brandSlug}/complaints`)
        .send({
          reporterType: 'Partner',
          partnerCompanyId,
          partnerRequestType: 'OnBehalfOfCustomer',
          contactPreference: 'Partner',
          customer: {
            firstName: 'Klient',
            lastName: 'Końcowy',
            phone: '600100200',
            email: `klient-${suffix}@example.com`,
            address: 'Testowa 1',
            city: 'Warszawa',
            postalCode: '00-001',
          },
          productId: dist.productId,
          issueType: 'Defect',
          description: 'Zgłoszenie testowe — pełny łańcuch Partner → Dystrybutor.',
          requiredConsent: true,
        });
      expect(res.status).toBe(201);
      b2bCaseNumber = res.body.caseNumber;

      const distCases = await request(app.getHttpServer()).get('/api/cases').set(auth(dist.token));
      const created = distCases.body.find((c: { caseNumber: string }) => c.caseNumber === b2bCaseNumber);
      expect(created).toBeDefined();
      expect(created.reportedByPartnerCompanyName).toBe(partnerCompanyName);
    });

    it('Dashboard — sprawa liczy się w totalActive przy ?source=b2b, NIE liczy się przy ?source=b2c (definicja B2B niezmieniona)', async () => {
      const [all, b2b, b2c] = await Promise.all([
        request(app.getHttpServer()).get('/api/dashboard/summary').set(auth(dist.token)),
        request(app.getHttpServer()).get('/api/dashboard/summary?source=b2b').set(auth(dist.token)),
        request(app.getHttpServer()).get('/api/dashboard/summary?source=b2c').set(auth(dist.token)),
      ]);
      // `directCustomerTotal`/`partnerB2BTotal` są ZAWSZE nieprzefiltrowane (etykiety
      // przełącznika, patrz doc-comment `DashboardService.getSummary`) — te same we
      // wszystkich trzech odpowiedziach. `totalActive` NATOMIAST jest filtrowane przez
      // `?source=` — to on faktycznie potwierdza działanie przełącznika.
      expect(all.body.partnerB2BTotal).toBeGreaterThanOrEqual(1);
      expect(all.body.partnerB2BTotal).toBe(b2b.body.partnerB2BTotal);
      expect(all.body.partnerB2BTotal).toBe(b2c.body.partnerB2BTotal);
      expect(all.body.directCustomerTotal).toBe(0);

      expect(b2b.body.totalActive).toBeGreaterThanOrEqual(1);
      expect(b2c.body.totalActive).toBe(0);
      expect(all.body.totalActive).toBe(b2b.body.totalActive);
    });

    it('caseCount partnerstwa (panel "Partnerzy B2B") odzwierciedla nową sprawę', async () => {
      const res = await request(app.getHttpServer()).get(`/api/partnerships/${partnershipId}`).set(auth(dist.token));
      expect(res.body.caseCount).toBeGreaterThanOrEqual(1);
    });
  });
});
