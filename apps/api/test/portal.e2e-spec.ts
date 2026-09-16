import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { toValidationException } from '../src/common/validation/to-validation-exception';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { PasswordService } from '../src/modules/auth/services/password.service';
import { CaseStatusesService } from '../src/modules/case-statuses/case-statuses.service';

/**
 * Portal Klienta (e2e) — regresja na naprawę `portal-login.dto.ts`/
 * `portal-login-token.dto.ts` (zaszyty na sztywno prefiks "RMA" blokował
 * logowanie każdej firmy z innym `CompanySettings.caseNumberPrefix", np.
 * Veresmeble = "VERE" — patrz `CASE_NUMBER_PATTERN` w `case-numbering.util.ts`).
 *
 * Trzy PRAWDZIWE, niezależne organizacje z TRZEMA różnymi prefiksami numeru
 * sprawy (jak DAWIDAM/Veresmeble/TekstylPol na środowisku deweloperskim),
 * żeby udowodnić, że logowanie do Portalu działa dla KAŻDEGO prefiksu, nie
 * tylko dla "RMA" (który przypadkiem ukrywał ten błąd wcześniej).
 */
describe('Portal Klienta (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const password = 'Test-Password-123!';
  const suffix = Date.now();

  type Org = {
    companyId: string;
    customerId: string;
    productId: string;
    token: string;
    caseNumber: string;
    accessCode: string;
  };

  /** Zakłada jedną, kompletną, PRAWDZIWĄ organizację z WŁASNYM prefiksem numeru sprawy, tworzy sprawę i włącza dla niej Portal Klienta. Ten sam wzorzec co `multi-tenant-idor.e2e-spec.ts`. */
  async function createOrgWithPortalCase(name: string, caseNumberPrefix: string): Promise<Org> {
    const company = await prisma.company.create({ data: { name: `${name} ${suffix}` } });
    await prisma.companySettings.create({ data: { companyId: company.id, caseNumberPrefix } });

    const caseStatusesService = app.get(CaseStatusesService);
    await caseStatusesService.seedDefaultCatalog(company.id);

    const contractor = await prisma.contractor.create({ data: { companyId: company.id, name: `${name} kontrahent ${suffix}` } });
    const manufacturer = await prisma.manufacturer.create({
      data: { companyId: company.id, contractorId: contractor.id, requiresSerialNumber: false, requiresFrameNumber: false, requiresProofOfPurchase: false },
    });
    const product = await prisma.product.create({ data: { companyId: company.id, manufacturerId: manufacturer.id, name: `${name} produkt ${suffix}` } });
    const customer = await prisma.customer.create({ data: { companyId: company.id, firstName: 'Jan', lastName: 'Testowy', phone: '600000000' } });

    const permissionCodes = ['cases.view', 'cases.create', 'cases.portal.manage'];
    const permissions = await Promise.all(
      permissionCodes.map((code) => prisma.permission.upsert({ where: { code }, update: {}, create: { code, module: code.split('.')[0], description: code } })),
    );
    const role = await prisma.role.create({
      data: {
        companyId: company.id,
        name: `${name} Admin ${suffix}`,
        code: `${name.toLowerCase()}-portal-admin-${suffix}`,
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });
    const email = `e2e-portal-${name.toLowerCase()}-${suffix}@example.com`;
    const passwordService = app.get(PasswordService);
    await prisma.user.create({
      data: { companyId: company.id, firstName: name, lastName: 'E2E', email, passwordHash: await passwordService.hash(password), active: true, emailVerifiedAt: new Date(), roles: { create: [{ roleId: role.id }] } },
    });

    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password });
    const token: string = login.body.accessToken;

    const created = await request(app.getHttpServer())
      .post('/api/cases')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        customerId: customer.id,
        complaintType: 'Warranty',
        requestedResolution: 'Naprawa',
        description: `Portal e2e — sprawa ${name}.`,
        items: [{ productId: product.id, description: 'Opis usterki.' }],
      });
    const caseId: string = created.body.id;
    const caseNumber: string = created.body.caseNumber;

    const enabled = await request(app.getHttpServer())
      .post(`/api/cases/${caseId}/portal/enable`)
      .set({ Authorization: `Bearer ${token}` });
    const accessCode: string = enabled.body.value;

    return { companyId: company.id, customerId: customer.id, productId: product.id, token, caseNumber, accessCode };
  }

  let dawidam: Org; // prefiks "RMA" — jedyny, który dawny zaszyty regex akceptował
  let veresmeble: Org; // prefiks "VERE" — dokładnie ten, który dawny bug blokował
  let tekstylpol: Org; // prefiks "TEKS" — druga branża, potwierdza że to nie przypadek jednego prefiksu

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

    dawidam = await createOrgWithPortalCase('Dawidam', 'RMA');
    veresmeble = await createOrgWithPortalCase('Veresmeble', 'VERE');
    tekstylpol = await createOrgWithPortalCase('Tekstylpol', 'TEKS');
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('loguje do Portalu sprawę DAWIDAM (prefiks "RMA")', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/portal/login')
      .send({ caseNumber: dawidam.caseNumber, accessCode: dawidam.accessCode });
    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.accessToken).toBeDefined();
  });

  it('loguje do Portalu sprawę Veresmeble (prefiks "VERE") — dokładnie ten przypadek, który dawny regex blokował', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/portal/login')
      .send({ caseNumber: veresmeble.caseNumber, accessCode: veresmeble.accessCode });
    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.accessToken).toBeDefined();
  });

  it('loguje do Portalu sprawę TekstylPol (prefiks "TEKS")', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/portal/login')
      .send({ caseNumber: tekstylpol.caseNumber, accessCode: tekstylpol.accessCode });
    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.accessToken).toBeDefined();
  });

  it('wydany token Portalu pokazuje WŁAŚCIWĄ sprawę (właściwy prefiks trafia do właściwego tenanta)', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/portal/login')
      .send({ caseNumber: veresmeble.caseNumber, accessCode: veresmeble.accessCode });
    const portalToken = login.body.accessToken;

    const caseView = await request(app.getHttpServer())
      .get('/api/portal/case')
      .set({ Authorization: `Bearer ${portalToken}` });
    expect(caseView.status).toBe(HttpStatus.OK);
    expect(caseView.body.caseNumber).toBe(veresmeble.caseNumber);
  });

  it('odrzuca nieistniejący, poprawnie sformatowany numer sprawy (PORTAL-001)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/portal/login')
      .send({ caseNumber: 'VERE/2026/99999', accessCode: 'AAAAAAAA' });
    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.error.code).toBe('PORTAL-001');
  });

  it('odrzuca oczywiście błędnie sformatowany numer sprawy walidacją DTO (loosened regex nadal odrzuca śmieci)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/portal/login')
      .send({ caseNumber: 'nie-numer-sprawy', accessCode: 'AAAAAAAA' });
    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('odrzuca próbę dostępu do sprawy innej organizacji — numer Veresmeble z kodem dostępu DAWIDAM', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/portal/login')
      .send({ caseNumber: veresmeble.caseNumber, accessCode: dawidam.accessCode });
    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.error.code).toBe('PORTAL-001');
  });

  it('odrzuca próbę dostępu do sprawy innej organizacji — numer DAWIDAM z kodem dostępu TekstylPol', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/portal/login')
      .send({ caseNumber: dawidam.caseNumber, accessCode: tekstylpol.accessCode });
    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.error.code).toBe('PORTAL-001');
  });
});
