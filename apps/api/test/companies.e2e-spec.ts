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

/**
 * Test integracyjny/e2e — WYMAGA prawdziwego Postgresa i Redisa (jak
 * `test/auth.e2e-spec.ts`/`test/users.e2e-spec.ts`). Nieuruchomiony w tym
 * środowisku — patrz raport końcowy Zadania 12. Fixtury (`Permission` przez
 * `upsert`, nie `create`) są bezpieczne niezależnie od tego, czy `seed.ts`
 * już działał na tej bazie.
 */
describe('Companies (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emitter: EventEmitter2;

  let companyId: string;
  let adminAccessToken: string;
  let noPermAccessToken: string;
  const adminEmail = `e2e-companies-admin-${Date.now()}@sklep.pl`;
  const noPermEmail = `e2e-companies-noperm-${Date.now()}@sklep.pl`;
  const password = 'Test-Password-123!';

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

    const company = await prisma.company.create({ data: { name: `E2E Companies ${Date.now()}`, nip: '1112223330' } });
    companyId = company.id;

    const permissionCodes = ['company.manage', 'shops.manage'];
    const permissions = await Promise.all(
      permissionCodes.map((code) =>
        prisma.permission.upsert({ where: { code }, update: {}, create: { code, module: 'Companies', description: code } }),
      ),
    );

    const adminRole = await prisma.role.create({
      data: {
        companyId,
        name: `E2E Companies Admin ${Date.now()}`,
        code: `e2e-companies-admin-${Date.now()}`,
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });
    const noPermRole = await prisma.role.create({
      data: { companyId, name: `E2E Companies No Perms ${Date.now()}`, code: `e2e-companies-no-perms-${Date.now()}` },
    });

    await prisma.user.create({
      data: {
        companyId,
        firstName: 'Admin',
        lastName: 'E2E',
        email: adminEmail,
        passwordHash: await passwordService.hash(password),
        active: true,
        emailVerifiedAt: new Date(),
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
        emailVerifiedAt: new Date(),
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
    await prisma.shop.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.role.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    await app.close();
  });

  const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('GET /api/companies/me', () => {
    it('zwraca firmę dowolnemu zalogowanemu użytkownikowi (bez wymogu `company.manage`)', async () => {
      const res = await request(app.getHttpServer()).get('/api/companies/me').set(authHeader(noPermAccessToken));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(companyId);
    });
  });

  describe('PATCH /api/companies/me', () => {
    it('odmawia dostępu bez uprawnienia `company.manage` (RBAC-001)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/companies/me')
        .set(authHeader(noPermAccessToken))
        .send({ name: 'Nowa Nazwa' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('RBAC-001');
    });

    it('aktualizuje dane firmy, zapisuje AuditLog i publikuje `company.updated`', async () => {
      const received: unknown[] = [];
      emitter.once(EVENT_NAMES.COMPANY_UPDATED, (event) => received.push(event));

      const res = await request(app.getHttpServer())
        .patch('/api/companies/me')
        .set(authHeader(adminAccessToken))
        .send({ name: 'Zaktualizowana Nazwa' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Zaktualizowana Nazwa');
      expect(received).toHaveLength(1);

      const auditEntries = await prisma.auditLog.findMany({ where: { companyId, action: 'COMPANY_UPDATED' } });
      expect(auditEntries.length).toBeGreaterThan(0);
    });

    it('odrzuca próbę zmiany pola spoza DTO (VALIDATION-001 — pole nieznane)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/companies/me')
        .set(authHeader(adminAccessToken))
        .send({ active: false });
      expect(res.status).toBe(422);
    });

    // Walidacja NIP (`IsPolishNip`) — patrz `nip.validator.spec.ts` dla testów
    // samej funkcji w izolacji; te trzy testy potwierdzają, że jest realnie
    // podłączona do `PATCH /companies/me` (nie tylko istnieje jako plik).
    it('przyjmuje prawidłowy NIP z myślnikami i zapisuje go znormalizowanym do 10 cyfr', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/companies/me')
        .set(authHeader(adminAccessToken))
        .send({ nip: '526-000-12-46' });
      expect(res.status).toBe(200);
      expect(res.body.nip).toBe('5260001246');
    });

    it('VALIDATION-006 — odrzuca NIP z nieprawidłową sumą kontrolną', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/companies/me')
        .set(authHeader(adminAccessToken))
        .send({ nip: '5260001247' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION-006');
    });

    it('puste pole NIP nadal jest dozwolone (pole opcjonalne)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/companies/me')
        .set(authHeader(adminAccessToken))
        .send({ name: 'Zaktualizowana Nazwa Bez NIP' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/shops i GET /api/shops', () => {
    let shopId: string;

    it('odmawia dostępu bez uprawnienia `shops.manage` (RBAC-001)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/shops')
        .set(authHeader(noPermAccessToken))
        .send({ name: 'Sklep Centrum' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('RBAC-001');
    });

    it('tworzy placówkę, zapisuje AuditLog i publikuje `shop.created`', async () => {
      const received: unknown[] = [];
      emitter.once(EVENT_NAMES.SHOP_CREATED, (event) => received.push(event));

      const res = await request(app.getHttpServer())
        .post('/api/shops')
        .set(authHeader(adminAccessToken))
        .send({ name: 'Sklep Centrum', city: 'Warszawa' });

      expect(res.status).toBe(201);
      expect(res.body.companyId).toBe(companyId);
      expect(received).toHaveLength(1);
      shopId = res.body.id;

      const auditEntries = await prisma.auditLog.findMany({ where: { companyId, action: 'SHOP_CREATED', entityId: shopId } });
      expect(auditEntries).toHaveLength(1);
    });

    it('zwraca listę placówek zawierającą nowo utworzoną', async () => {
      const res = await request(app.getHttpServer()).get('/api/shops').set(authHeader(adminAccessToken));
      expect(res.status).toBe(200);
      expect(res.body.some((shop: { id: string }) => shop.id === shopId)).toBe(true);
    });

    it('PATCH /api/shops/:id zwraca 404 dla nieistniejącej placówki', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/shops/00000000-0000-0000-0000-000000000000')
        .set(authHeader(adminAccessToken))
        .send({ city: 'Kraków' });
      expect(res.status).toBe(404);
    });

    it('PATCH /api/shops/:id aktualizuje placówkę i publikuje `shop.updated`', async () => {
      const received: unknown[] = [];
      emitter.once(EVENT_NAMES.SHOP_UPDATED, (event) => received.push(event));

      const res = await request(app.getHttpServer())
        .patch(`/api/shops/${shopId}`)
        .set(authHeader(adminAccessToken))
        .send({ city: 'Kraków' });

      expect(res.status).toBe(200);
      expect(res.body.city).toBe('Kraków');
      expect(received).toHaveLength(1);
    });

    it('POST /api/shops/:id/deactivate dezaktywuje placówkę (active=false) i publikuje `shop.deactivated`', async () => {
      const received: unknown[] = [];
      emitter.once(EVENT_NAMES.SHOP_DEACTIVATED, (event) => received.push(event));

      const res = await request(app.getHttpServer())
        .post(`/api/shops/${shopId}/deactivate`)
        .set(authHeader(adminAccessToken));

      expect(res.status).toBe(201);
      expect(res.body.active).toBe(false);
      expect(received).toHaveLength(1);
    });

    it('POST /api/shops/:id/deactivate zwraca 404 dla nieistniejącej placówki', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/shops/00000000-0000-0000-0000-000000000000/deactivate')
        .set(authHeader(adminAccessToken));
      expect(res.status).toBe(404);
    });
  });
});
