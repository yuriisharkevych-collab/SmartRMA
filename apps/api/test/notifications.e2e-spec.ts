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
 * Test integracyjny/e2e — WYMAGA prawdziwego Postgresa i Redisa (jak
 * `test/cases.e2e-spec.ts`). Nieuruchomiony w tym środowisku — patrz raport
 * końcowy Zadania 18.
 *
 * UWAGA architektoniczna: `CasesService`/`DocumentsService` wołają
 * `await this.eventBus.publish(...)` przed zwróceniem odpowiedzi, więc w
 * obecnej implementacji odpowiedź HTTP FAKTYCZNIE czeka na zakończenie
 * przetwarzania przez subskrybentów (Notifications) — mimo że EVENTS.md
 * §7.2.3 mówi, że subskrybenty działają asynchronicznie względem
 * odpowiedzi. Ta niezgodność była niewidoczna do Zadania 18 (brak
 * jakiegokolwiek subskrybenta). Dzięki temu ten test może bezpiecznie
 * sprawdzać `Notification` zaraz po odpowiedzi API, bez pollingu — ale
 * sama niezgodność jest odnotowana w raporcie końcowym jako coś do
 * poprawienia w przyszłości (fire-and-forget `publish()`).
 */
describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let companyId: string;
  let customerId: string;
  let productId: string;
  let adminAccessToken: string;
  let noPermAccessToken: string;
  const adminEmail = `e2e-notifications-admin-${Date.now()}@sklep.pl`;
  const noPermEmail = `e2e-notifications-noperm-${Date.now()}@sklep.pl`;
  const customerEmail = `e2e-notifications-customer-${Date.now()}@example.com`;
  const password = 'Test-Password-123!';

  const ALL_PERMISSIONS = [
    'cases.view',
    'cases.create',
    'cases.status.change',
    'cases.cancel',
    'cases.assign',
    'notifications.view',
    'notifications.templates.manage',
  ];

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
    const passwordService = app.get(PasswordService);

    const company = await prisma.company.create({ data: { name: `E2E Notifications ${Date.now()}` } });
    companyId = company.id;
    // Bez tego `POST /api/cases` rzuca — patrz komentarz w `test/cases.e2e-spec.ts`.
    await app.get(CaseStatusesService).seedDefaultCatalog(companyId);
    const customer = await prisma.customer.create({ data: { companyId, firstName: 'Jan', lastName: 'Kowalski', phone: '600000000', email: customerEmail } });
    customerId = customer.id;
    const contractor = await prisma.contractor.create({ data: { companyId, name: `E2E Producent ${Date.now()}` } });
    const manufacturer = await prisma.manufacturer.create({ data: { companyId, contractorId: contractor.id } });
    const product = await prisma.product.create({ data: { companyId, manufacturerId: manufacturer.id, name: 'Rower X' } });
    productId = product.id;

    // Szablony globalne (companyId=null) — NOTIFICATIONS.md §2.2, dane startowe (nie tworzone przez seed w tym repo, więc fixtura testowa je zakłada).
    await prisma.notificationTemplate.create({
      data: { companyId: null, code: 'case.created.customer', channel: 'Email', subject: 'Zgłoszenie {{caseNumber}} przyjęte', bodyTemplate: 'Witaj {{customerName}}, sprawa {{caseNumber}} ({{productModel}}) zarejestrowana.', variables: ['caseNumber', 'customerName', 'productModel'] },
    });
    await prisma.notificationTemplate.create({
      data: { companyId: null, code: 'case.status_changed.customer', channel: 'Email', bodyTemplate: 'Sprawa {{caseNumber}}: {{statusLabel}}.', variables: ['caseNumber', 'statusLabel'] },
    });
    await prisma.notificationTemplate.create({
      data: { companyId: null, code: 'case.cancelled.customer', channel: 'Email', bodyTemplate: 'Sprawa {{caseNumber}} anulowana. Powód: {{reason}}.', variables: ['caseNumber', 'reason'] },
    });

    const permissions = await Promise.all(
      ALL_PERMISSIONS.map((code) => prisma.permission.upsert({ where: { code }, update: {}, create: { code, module: 'Notifications', description: code } })),
    );

    const adminRole = await prisma.role.create({
      data: { companyId, name: `E2E Notifications Admin ${Date.now()}`, code: `e2e-notifications-admin-${Date.now()}`, permissions: { create: permissions.map((p) => ({ permissionId: p.id })) } },
    });
    const noPermRole = await prisma.role.create({ data: { companyId, name: `E2E Notifications No Perms ${Date.now()}`, code: `e2e-notifications-no-perms-${Date.now()}` } });

    await prisma.user.create({
      data: { companyId, firstName: 'Admin', lastName: 'E2E', email: adminEmail, passwordHash: await passwordService.hash(password), active: true, roles: { create: [{ roleId: adminRole.id }] } },
    });
    await prisma.user.create({
      data: { companyId, firstName: 'NoPerm', lastName: 'E2E', email: noPermEmail, passwordHash: await passwordService.hash(password), active: true, roles: { create: [{ roleId: noPermRole.id }] } },
    });

    const adminLogin = await request(app.getHttpServer()).post('/api/auth/login').send({ email: adminEmail, password });
    adminAccessToken = adminLogin.body.accessToken;
    const noPermLogin = await request(app.getHttpServer()).post('/api/auth/login').send({ email: noPermEmail, password });
    noPermAccessToken = noPermLogin.body.accessToken;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.notificationTemplate.deleteMany({ where: { companyId: null, code: { in: ['case.created.customer', 'case.status_changed.customer', 'case.cancelled.customer'] } } }).catch(() => undefined);
    await prisma.caseHistory.deleteMany({ where: { case: { companyId } } }).catch(() => undefined);
    await prisma.note.deleteMany({ where: { case: { companyId } } }).catch(() => undefined);
    await prisma.case.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.customer.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.product.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.manufacturer.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.contractor.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.role.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.caseStatusDefinition.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    await app.close();
  });

  const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('case.created → case.created.customer (tylko gdy clientPortalEnabled=true)', () => {
    it('NIE tworzy powiadomienia, gdy clientPortalEnabled=false (domyślnie)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/cases')
        .set(authHeader(adminAccessToken))
        .send({ customerId, complaintType: 'Warranty', requestedResolution: 'Naprawa', description: 'Opis', items: [{ productId, description: 'Rysa', purchaseProofNumber: 'FV/2026/001' }] });
      expect(res.status).toBe(201);

      const notifications = await prisma.notification.findMany({ where: { relatedCaseId: res.body.id } });
      expect(notifications).toHaveLength(0);
    });

    it('tworzy Notification (Pending, Email, treść z podstawionymi zmiennymi), gdy clientPortalEnabled=true', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/cases')
        .set(authHeader(adminAccessToken))
        .send({ customerId, complaintType: 'Warranty', requestedResolution: 'Naprawa', description: 'Opis', clientPortalEnabled: true, items: [{ productId, description: 'Rysa', purchaseProofNumber: 'FV/2026/001' }] });
      expect(res.status).toBe(201);
      const caseId = res.body.id;

      const notifications = await prisma.notification.findMany({ where: { relatedCaseId: caseId, channel: 'Email' } });
      expect(notifications).toHaveLength(1);
      expect(notifications[0].status).toBe('Pending');
      expect(notifications[0].recipientEmail).toBe(customerEmail);
      expect(notifications[0].body).toContain(res.body.caseNumber);
      expect(notifications[0].body).toContain('Rower X');
    });
  });

  describe('case.status_changed → szablon per status', () => {
    let caseId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/cases')
        .set(authHeader(adminAccessToken))
        .send({ customerId, complaintType: 'Warranty', requestedResolution: 'Naprawa', description: 'Opis', items: [{ productId, description: 'Rysa', purchaseProofNumber: 'FV/2026/001' }] });
      caseId = res.body.id;
    });

    it('Przyjeta (status "Nie" w WORKFLOW.md §7) — NIE tworzy powiadomienia', async () => {
      const res = await request(app.getHttpServer()).put(`/api/cases/${caseId}/status`).set(authHeader(adminAccessToken)).send({ status: 'Przyjeta' });
      expect(res.status).toBe(200);

      const notifications = await prisma.notification.findMany({ where: { relatedCaseId: caseId } });
      expect(notifications).toHaveLength(0);
    });

    it('anulowanie tworzy Notification z szablonu case.cancelled.customer, z powodem z Note', async () => {
      const res = await request(app.getHttpServer()).post(`/api/cases/${caseId}/cancel`).set(authHeader(adminAccessToken)).send({ reason: 'Klient zrezygnował' });
      expect(res.status).toBe(201);

      const notifications = await prisma.notification.findMany({ where: { relatedCaseId: caseId } });
      expect(notifications).toHaveLength(1);
      expect(notifications[0].body).toContain('Klient zrezygnował');
    });
  });

  describe('GET /api/notifications (widok administracyjny firmy)', () => {
    it('odmawia dostępu bez uprawnienia `notifications.view`', async () => {
      const res = await request(app.getHttpServer()).get('/api/notifications').set(authHeader(noPermAccessToken));
      expect(res.status).toBe(403);
    });

    it('zwraca listę powiadomień firmy', async () => {
      const res = await request(app.getHttpServer()).get('/api/notifications').set(authHeader(adminAccessToken));
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe('Moje powiadomienia (zasób osobisty, bez notifications.view)', () => {
    it('GET /api/notifications/me działa BEZ uprawnienia notifications.view (użytkownik noPermAccessToken)', async () => {
      const res = await request(app.getHttpServer()).get('/api/notifications/me').set(authHeader(noPermAccessToken));
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/notification-templates (RBAC + walidacja)', () => {
    it('odmawia dostępu bez uprawnienia `notifications.templates.manage`', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/notification-templates')
        .set(authHeader(noPermAccessToken))
        .send({ code: 'x.y.z', channel: 'Email', bodyTemplate: 'test', variables: [] });
      expect(res.status).toBe(403);
    });

    it('tworzy nadpisanie szablonu dla własnej firmy', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/notification-templates')
        .set(authHeader(adminAccessToken))
        .send({ code: 'case.created.customer', channel: 'System', bodyTemplate: 'test wewnętrzny', variables: [] });
      expect(res.status).toBe(201);
      expect(res.body.companyId).toBe(companyId);
    });

    it('PATCH zwraca 404 dla nieistniejącego szablonu', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/notification-templates/00000000-0000-0000-0000-000000000000')
        .set(authHeader(adminAccessToken))
        .send({ active: false });
      expect(res.status).toBe(404);
    });
  });
});
