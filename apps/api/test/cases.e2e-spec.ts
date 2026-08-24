import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { toValidationException } from '../src/common/validation/to-validation-exception';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { PasswordService } from '../src/modules/auth/services/password.service';
import { EVENT_NAMES } from '../src/events/event-names.const';
import { PortalStage } from '@prisma/client';
import { CaseStatusesService } from '../src/modules/case-statuses/case-statuses.service';

/**
 * Test integracyjny/e2e — WYMAGA prawdziwego Postgresa i Redisa (jak
 * `test/orders.e2e-spec.ts`).
 *
 * Zaktualizowane po „Status Workflow Refactor" (Faza 7 stabilizacji, sierpień
 * 2026): status to dziś wiersz `CaseStatusDefinition` per firma, nie sztywny
 * enum — katalog musi być jawnie zasiany (`CaseStatusesService.seedDefaultCatalog`,
 * dokładnie tak, jak przy zakładaniu nowej firmy w produkcji), a nazwy statusów
 * w scenariuszach poniżej to `DEFAULT_STATUS_CATALOG`
 * (`case-statuses.service.ts`), nie dawne `GotowaDoWysylki`/`WyslanaDoProducenta`/
 * `RealizacjaDecyzji`/`Zamknieta`. `CASE-001` ("nielegalne przejście") jest od
 * tego refactoru martwe — pracownik może wybrać KAŻDY aktywny status w
 * dowolnym momencie; jedyny sposób odrzucenia to nieznany/nieaktywny kod
 * (CASE-016).
 */
describe('Cases (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emitter: EventEmitter2;

  let companyId: string;
  let customerId: string;
  let productId: string;
  let adminAccessToken: string;
  let noPermAccessToken: string;
  const adminEmail = `e2e-cases-admin-${Date.now()}@sklep.pl`;
  const noPermEmail = `e2e-cases-noperm-${Date.now()}@sklep.pl`;
  const password = 'Test-Password-123!';

  const ALL_CASES_PERMISSIONS = [
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
    'notes.create',
    'notes.view',
    'messages.send',
    'messages.view',
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
    emitter = app.get(EventEmitter2);
    const passwordService = app.get(PasswordService);

    const company = await prisma.company.create({ data: { name: `E2E Cases ${Date.now()}` } });
    companyId = company.id;

    // Bez tego `POST /api/cases` rzuca (500) — `CasesService.create` szuka statusu
    // `isDefaultForNew:true` w katalogu firmy, który dla nowo utworzonej firmy jest
    // pusty, dopóki ktoś (tu: test, w produkcji: zakładanie firmy) go nie zasieje.
    const caseStatusesService = app.get(CaseStatusesService);
    await caseStatusesService.seedDefaultCatalog(companyId);
    // Status dodatkowy spoza katalogu domyślnego — jedyny sposób na wywołanie
    // ścieżki CASE-009 (`requiredCheck`), której ŻADEN z 9 domyślnych statusów
    // nie ustawia (patrz `DEFAULT_STATUS_CATALOG`); w produkcji taki status
    // zakłada administrator ręcznie w Ustawieniach → Statusy reklamacji.
    await prisma.caseStatusDefinition.create({
      data: {
        companyId,
        code: 'RealizacjaDecyzji',
        label: 'Realizacja decyzji',
        order: 10,
        isFinal: false,
        isDefaultForNew: false,
        requiresConfirmation: false,
        requiredCheck: 'CASE-009',
        portalStage: PortalStage.Decyzja,
        isSystem: false,
      },
    });

    const customer = await prisma.customer.create({ data: { companyId, firstName: 'Jan', lastName: 'Kowalski', phone: '600000000' } });
    customerId = customer.id;

    const contractor = await prisma.contractor.create({ data: { companyId, name: `E2E Producent ${Date.now()}` } });
    const manufacturer = await prisma.manufacturer.create({ data: { companyId, contractorId: contractor.id } });
    const product = await prisma.product.create({ data: { companyId, manufacturerId: manufacturer.id, name: 'Rower X' } });
    productId = product.id;

    const permissions = await Promise.all(
      ALL_CASES_PERMISSIONS.map((code) =>
        prisma.permission.upsert({ where: { code }, update: {}, create: { code, module: 'Cases', description: code } }),
      ),
    );

    const adminRole = await prisma.role.create({
      data: {
        companyId,
        name: `E2E Cases Admin ${Date.now()}`,
        code: `e2e-cases-admin-${Date.now()}`,
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });
    const noPermRole = await prisma.role.create({
      data: { companyId, name: `E2E Cases No Perms ${Date.now()}`, code: `e2e-cases-no-perms-${Date.now()}` },
    });

    await prisma.user.create({
      data: {
        companyId,
        firstName: 'Admin',
        lastName: 'E2E',
        email: adminEmail,
        passwordHash: await passwordService.hash(password),
        active: true,
        roles: { create: [{ roleId: adminRole.id }] },
      },
    });
    await prisma.user.create({
      data: {
        companyId,
        firstName: 'NoPerm',
        lastName: 'E2E',
        email: noPermEmail,
        passwordHash: await passwordService.hash(password),
        active: true,
        roles: { create: [{ roleId: noPermRole.id }] },
      },
    });

    const adminLogin = await request(app.getHttpServer()).post('/api/auth/login').send({ email: adminEmail, password });
    adminAccessToken = adminLogin.body.accessToken;
    const noPermLogin = await request(app.getHttpServer()).post('/api/auth/login').send({ email: noPermEmail, password });
    noPermAccessToken = noPermLogin.body.accessToken;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.note.deleteMany({ where: { case: { companyId } } }).catch(() => undefined);
    await prisma.message.deleteMany({ where: { case: { companyId } } }).catch(() => undefined);
    await prisma.caseHistory.deleteMany({ where: { case: { companyId } } }).catch(() => undefined);
    await prisma.caseItem.deleteMany({ where: { case: { companyId } } }).catch(() => undefined);
    await prisma.case.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.product.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.manufacturer.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.contractor.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.customer.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.role.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.caseStatusDefinition.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    await app.close();
  });

  const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });
  // `purchaseProofNumber` — `Manufacturer.requiresProofOfPurchase` domyślnie
  // `true` (CASE-006, UAT Zadania „Manufacturer requirement enforcement"), więc
  // producent testowy bez nadpisania wymaga dowodu zakupu jak każdy realny.
  const baseCaseBody = () => ({
    customerId,
    complaintType: 'Warranty',
    requestedResolution: 'Naprawa',
    description: 'Opis usterki',
    items: [{ productId, description: 'Rysa na ramie', purchaseProofNumber: 'FV/2026/001' }],
  });

  describe('POST /api/cases', () => {
    it('odmawia dostępu bez uprawnienia `cases.create` (RBAC-001)', async () => {
      const res = await request(app.getHttpServer()).post('/api/cases').set(authHeader(noPermAccessToken)).send(baseCaseBody());
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('RBAC-001');
    });

    it('zwraca 422 VALIDATION-001, gdy brak description poza ścieżką monitorowaną (BR-105)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/cases')
        .set(authHeader(adminAccessToken))
        .send({ ...baseCaseBody(), description: undefined });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION-001');
    });

    it('zwraca 404, gdy customerId nie istnieje', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/cases')
        .set(authHeader(adminAccessToken))
        .send({ ...baseCaseBody(), customerId: '00000000-0000-0000-0000-000000000000' });
      expect(res.status).toBe(404);
    });

    it('zwraca 422 CASE-007, gdy BezposrednioDoProducenta łączy się z StatutoryWarranty', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/cases')
        .set(authHeader(adminAccessToken))
        .send({ ...baseCaseBody(), complaintType: 'StatutoryWarranty', submissionMode: 'BezposrednioDoProducenta' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('CASE-007');
    });

    it('tworzy sprawę, zapisuje AuditLog i publikuje `case.created`', async () => {
      const received: unknown[] = [];
      emitter.once(EVENT_NAMES.CASE_CREATED, (event) => received.push(event));

      const res = await request(app.getHttpServer()).post('/api/cases').set(authHeader(adminAccessToken)).send(baseCaseBody());

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('Nowa');
      expect(res.body.caseNumber).toMatch(/^RMA\/\d{4}\/\d{5}$/);
      expect(received).toHaveLength(1);

      const auditEntries = await prisma.auditLog.findMany({ where: { companyId, action: 'CASE_CREATED', entityId: res.body.id } });
      expect(auditEntries).toHaveLength(1);
      const history = await prisma.caseHistory.findMany({ where: { caseId: res.body.id } });
      expect(history.map((h) => h.action)).toContain('CaseCreated');
    });
  });

  describe('Pełny cykl workflow jednej sprawy', () => {
    let caseId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer()).post('/api/cases').set(authHeader(adminAccessToken)).send(baseCaseBody());
      caseId = res.body.id;
    });

    it('GET /api/cases/:id zwraca sprawę', async () => {
      const res = await request(app.getHttpServer()).get(`/api/cases/${caseId}`).set(authHeader(adminAccessToken));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(caseId);
    });

    it('GET /api/cases/:id zwraca 404 dla nieistniejącej sprawy (CASE-012)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/cases/00000000-0000-0000-0000-000000000000')
        .set(authHeader(adminAccessToken));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CASE-012');
    });

    it('PUT /api/cases/:id/status odrzuca nieznany/nieaktywny kod statusu (CASE-016 — następca CASE-001 po Status Workflow Refactor)', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/cases/${caseId}/status`)
        .set(authHeader(adminAccessToken))
        .send({ status: 'NieIstniejacyStatus' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('CASE-016');
    });

    it('PUT /api/cases/:id/status odmawia dostępu bez żadnego z uprawnień statusowych', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/cases/${caseId}/status`)
        .set(authHeader(noPermAccessToken))
        .send({ status: 'Przyjeta' });
      expect(res.status).toBe(403);
    });

    it('przechodzi Nowa → Przyjeta → PrzekazanaDoProducenta → DecyzjaPozytywna → TowarWyslanyDoSerwisu → TowarWrocilZSerwisu (DEFAULT_STATUS_CATALOG)', async () => {
      const received: unknown[] = [];
      emitter.on(EVENT_NAMES.CASE_STATUS_CHANGED, (event) => received.push(event));

      for (const status of ['Przyjeta', 'PrzekazanaDoProducenta', 'DecyzjaPozytywna', 'TowarWyslanyDoSerwisu', 'TowarWrocilZSerwisu']) {
        const res = await request(app.getHttpServer()).put(`/api/cases/${caseId}/status`).set(authHeader(adminAccessToken)).send({ status });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe(status);
      }

      expect(received.length).toBeGreaterThanOrEqual(5);
      emitter.removeAllListeners(EVENT_NAMES.CASE_STATUS_CHANGED);
    });

    it('PUT /api/cases/:id/status do statusu z requiredCheck=CASE-009 zwraca 422 bez ustawionej decyzji', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/cases/${caseId}/status`)
        .set(authHeader(adminAccessToken))
        .send({ status: 'RealizacjaDecyzji' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('CASE-009');
    });

    it('PUT /api/cases/:id/decision ustawia decyzję i publikuje `case.decision_set`', async () => {
      const received: unknown[] = [];
      emitter.once(EVENT_NAMES.CASE_DECISION_SET, (event) => received.push(event));

      const res = await request(app.getHttpServer()).put(`/api/cases/${caseId}/decision`).set(authHeader(adminAccessToken)).send({ decision: 'Naprawa' });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('Naprawa');
      expect(received).toHaveLength(1);
    });

    it('teraz przejście do RealizacjaDecyzji jest legalne', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/cases/${caseId}/status`)
        .set(authHeader(adminAccessToken))
        .send({ status: 'RealizacjaDecyzji' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('RealizacjaDecyzji');
    });

    it('PUT /api/cases/:id/owner przypisuje opiekuna i zapisuje AuditLog', async () => {
      const admin = await prisma.user.findFirst({ where: { email: adminEmail } });
      const res = await request(app.getHttpServer())
        .put(`/api/cases/${caseId}/owner`)
        .set(authHeader(adminAccessToken))
        .send({ ownerId: admin!.id });
      expect(res.status).toBe(200);
      expect(res.body.ownerId).toBe(admin!.id);

      const auditEntries = await prisma.auditLog.findMany({ where: { companyId, action: 'CASE_OWNER_CHANGED', entityId: caseId } });
      expect(auditEntries).toHaveLength(1);
    });

    it('POST /api/cases/:id/notes dodaje notatkę i publikuje `case.note_added`', async () => {
      const received: unknown[] = [];
      emitter.once(EVENT_NAMES.CASE_NOTE_ADDED, (event) => received.push(event));

      const res = await request(app.getHttpServer()).post(`/api/cases/${caseId}/notes`).set(authHeader(adminAccessToken)).send({ content: 'Wewnetrzna notatka' });

      expect(res.status).toBe(201);
      expect(received).toHaveLength(1);

      const notesRes = await request(app.getHttpServer()).get(`/api/cases/${caseId}/notes`).set(authHeader(adminAccessToken));
      expect(notesRes.body.some((n: { content: string }) => n.content === 'Wewnetrzna notatka')).toBe(true);
    });

    it('POST /api/cases/:id/messages wysyła wiadomość i publikuje `case.message_added`', async () => {
      const received: unknown[] = [];
      emitter.once(EVENT_NAMES.CASE_MESSAGE_ADDED, (event) => received.push(event));

      const res = await request(app.getHttpServer())
        .post(`/api/cases/${caseId}/messages`)
        .set(authHeader(adminAccessToken))
        .send({ channel: 'Email', content: 'Sprawa jest w trakcie realizacji.' });

      expect(res.status).toBe(201);
      expect(received).toHaveLength(1);
    });

    it('GET /api/cases/:id/history zawiera CaseCreated i StatusChanged', async () => {
      const res = await request(app.getHttpServer()).get(`/api/cases/${caseId}/history`).set(authHeader(adminAccessToken));
      expect(res.status).toBe(200);
      const actions = res.body.map((h: { action: string }) => h.action);
      expect(actions).toContain('CaseCreated');
      expect(actions).toContain('StatusChanged');
    });

    it('POST /api/cases/:id/cancel zwraca 422 CASE-011 bez powodu', async () => {
      const res = await request(app.getHttpServer()).post(`/api/cases/${caseId}/cancel`).set(authHeader(adminAccessToken)).send({ reason: '' });
      expect(res.status).toBe(422);
    });

    it('PATCH /api/cases/:id edytuje priorytet i pozostawia CaseHistory(PriorityChanged)', async () => {
      const res = await request(app.getHttpServer()).patch(`/api/cases/${caseId}`).set(authHeader(adminAccessToken)).send({ priority: 'Wysoki' });
      expect(res.status).toBe(200);
      expect(res.body.priority).toBe('Wysoki');

      const history = await prisma.caseHistory.findMany({ where: { caseId, action: 'PriorityChanged' } });
      expect(history).toHaveLength(1);
    });
  });

  describe('Anulowanie sprawy', () => {
    it('anuluje sprawę aktywną z powodem i CASE-008 blokuje dalszą edycję', async () => {
      const created = await request(app.getHttpServer()).post('/api/cases').set(authHeader(adminAccessToken)).send(baseCaseBody());
      const caseId = created.body.id;

      const cancelRes = await request(app.getHttpServer())
        .post(`/api/cases/${caseId}/cancel`)
        .set(authHeader(adminAccessToken))
        .send({ reason: 'Klient zrezygnował' });
      expect(cancelRes.status).toBe(201);
      // Status Workflow Refactor — "Anulowana" nie jest już osobnym statusem;
      // anulowanie to przejście do `Zakonczona` + `cancelledAt` ustawione
      // (patrz `CasesService.cancel`/`performTransition`).
      expect(cancelRes.body.status).toBe('Zakonczona');
      expect(cancelRes.body.cancelledAt).not.toBeNull();

      const editRes = await request(app.getHttpServer()).patch(`/api/cases/${caseId}`).set(authHeader(adminAccessToken)).send({ priority: 'Wysoki' });
      expect(editRes.status).toBe(409);
      expect(editRes.body.error.code).toBe('CASE-008');
    });
  });

  describe('Współbieżność — blokada wiersza przy równoczesnej zmianie statusu', () => {
    it('dwa równoczesne żądania PUT /status na tej samej sprawie: blokada wiersza serializuje zapisy — oba 200, ale dokładnie JEDEN realny zapis (drugi to no-op idempotentny, Status Workflow Refactor)', async () => {
      const created = await request(app.getHttpServer()).post('/api/cases').set(authHeader(adminAccessToken)).send(baseCaseBody());
      const caseId = created.body.id;

      const [first, second] = await Promise.all([
        request(app.getHttpServer()).put(`/api/cases/${caseId}/status`).set(authHeader(adminAccessToken)).send({ status: 'Przyjeta' }),
        request(app.getHttpServer()).put(`/api/cases/${caseId}/status`).set(authHeader(adminAccessToken)).send({ status: 'Przyjeta' }),
      ]);

      // Status Workflow Refactor — wybór statusu, w którym sprawa JUŻ jest, jest
      // zawsze no-opem (bez CASE-001, martwe od tego refactoru — patrz
      // `performTransition`), nie konfliktem: kto przyjdzie drugi po zwolnieniu
      // blokady wiersza, zastaje już docelowy status i dostaje 200 (nie 409).
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(first.body.status).toBe('Przyjeta');
      expect(second.body.status).toBe('Przyjeta');

      // Dokładnie JEDEN wpis StatusChanged Nowa→Przyjeta — brak podwójnego zapisu / utraconej aktualizacji.
      const history = await prisma.caseHistory.findMany({ where: { caseId, action: 'StatusChanged', previousValue: 'Nowa', newValue: 'Przyjeta' } });
      expect(history).toHaveLength(1);

      const finalCase = await request(app.getHttpServer()).get(`/api/cases/${caseId}`).set(authHeader(adminAccessToken));
      expect(finalCase.body.status).toBe('Przyjeta');
    });

    it('dwa równoczesne POST /cancel na tej samej sprawie: idempotentne — oba zwracają 2xx, ale tylko jeden zapis CaseHistory(CaseCancelled)', async () => {
      const created = await request(app.getHttpServer()).post('/api/cases').set(authHeader(adminAccessToken)).send(baseCaseBody());
      const caseId = created.body.id;

      const [first, second] = await Promise.all([
        request(app.getHttpServer()).post(`/api/cases/${caseId}/cancel`).set(authHeader(adminAccessToken)).send({ reason: 'Powod A' }),
        request(app.getHttpServer()).post(`/api/cases/${caseId}/cancel`).set(authHeader(adminAccessToken)).send({ reason: 'Powod B' }),
      ]);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.status).toBe('Zakonczona');
      expect(second.body.status).toBe('Zakonczona');

      const history = await prisma.caseHistory.findMany({ where: { caseId, action: 'CaseCancelled' } });
      expect(history).toHaveLength(1);
    });
  });
});
