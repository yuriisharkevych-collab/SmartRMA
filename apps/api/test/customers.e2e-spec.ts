import { INestApplication, ValidationPipe } from '@nestjs/common';
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
 * `test/companies.e2e-spec.ts`). Nieuruchomiony w tym środowisku — patrz
 * raport końcowy Zadania 13.
 */
describe('Customers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emitter: EventEmitter2;

  let companyId: string;
  let adminAccessToken: string;
  let noPermAccessToken: string;
  const adminEmail = `e2e-customers-admin-${Date.now()}@sklep.pl`;
  const noPermEmail = `e2e-customers-noperm-${Date.now()}@sklep.pl`;
  const password = 'Test-Password-123!';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix('api', { exclude: ['health', 'version'] });
    await app.init();

    prisma = app.get(PrismaService);
    emitter = app.get(EventEmitter2);
    const passwordService = app.get(PasswordService);

    const company = await prisma.company.create({ data: { name: `E2E Customers ${Date.now()}` } });
    companyId = company.id;

    const permissionCodes = ['customers.view', 'customers.create', 'customers.edit'];
    const permissions = await Promise.all(
      permissionCodes.map((code) =>
        prisma.permission.upsert({ where: { code }, update: {}, create: { code, module: 'Customers', description: code } }),
      ),
    );

    const adminRole = await prisma.role.create({
      data: {
        companyId,
        name: `E2E Customers Admin ${Date.now()}`,
        code: `e2e-customers-admin-${Date.now()}`,
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });
    const noPermRole = await prisma.role.create({
      data: { companyId, name: `E2E Customers No Perms ${Date.now()}`, code: `e2e-customers-no-perms-${Date.now()}` },
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
    await prisma.customer.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.role.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    await app.close();
  });

  const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('POST /api/customers', () => {
    it('odmawia dostępu bez uprawnienia `customers.create` (RBAC-001)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/customers')
        .set(authHeader(noPermAccessToken))
        .send({ firstName: 'Jan', lastName: 'Kowalski', phone: '600000000' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('RBAC-001');
    });

    it('zwraca 422 dla brakującego wymaganego pola (phone)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/customers')
        .set(authHeader(adminAccessToken))
        .send({ firstName: 'Jan', lastName: 'Kowalski' });
      expect(res.status).toBe(422);
    });

    it('zwraca 422 VALIDATION-002 dla nieprawidłowego formatu e-maila', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/customers')
        .set(authHeader(adminAccessToken))
        .send({ firstName: 'Jan', lastName: 'Kowalski', phone: '600000000', email: 'nie-jest-emailem' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION-002');
    });

    it('odrzuca próbę ustawienia pola systemowego spoza DTO (companyId) — VALIDATION-001', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/customers')
        .set(authHeader(adminAccessToken))
        .send({ firstName: 'Jan', lastName: 'Kowalski', phone: '600000000', companyId: '00000000-0000-0000-0000-000000000000' });
      expect(res.status).toBe(422);
    });

    it('tworzy klienta, zapisuje AuditLog i publikuje `customer.created`', async () => {
      const received: unknown[] = [];
      emitter.once(EVENT_NAMES.CUSTOMER_CREATED, (event) => received.push(event));

      const res = await request(app.getHttpServer())
        .post('/api/customers')
        .set(authHeader(adminAccessToken))
        .send({ firstName: 'Jan', lastName: 'Kowalski', phone: '600000000', email: 'jan.kowalski@example.com' });

      expect(res.status).toBe(201);
      expect(res.body.companyId).toBe(companyId);
      expect(received).toHaveLength(1);

      const auditEntries = await prisma.auditLog.findMany({ where: { companyId, action: 'CUSTOMER_CREATED', entityId: res.body.id } });
      expect(auditEntries).toHaveLength(1);
    });
  });

  describe('GET /api/customers i GET /api/customers/:id', () => {
    let customerId: string;

    beforeAll(async () => {
      const created = await prisma.customer.create({
        data: { companyId, firstName: 'Anna', lastName: 'Nowak', phone: '600000001', email: 'anna.nowak@example.com' },
      });
      customerId = created.id;
    });

    it('odmawia dostępu bez uprawnienia `customers.view` (RBAC-001)', async () => {
      const res = await request(app.getHttpServer()).get('/api/customers').set(authHeader(noPermAccessToken));
      expect(res.status).toBe(403);
    });

    it('zwraca pełną listę klientów bez `query`', async () => {
      const res = await request(app.getHttpServer()).get('/api/customers').set(authHeader(adminAccessToken));
      expect(res.status).toBe(200);
      expect(res.body.some((c: { id: string }) => c.id === customerId)).toBe(true);
    });

    it('zwraca wyniki wyszukiwania po nazwisku z `query`', async () => {
      const res = await request(app.getHttpServer()).get('/api/customers').query({ query: 'Nowak' }).set(authHeader(adminAccessToken));
      expect(res.status).toBe(200);
      expect(res.body.every((c: { lastName: string }) => c.lastName.includes('Nowak'))).toBe(true);
    });

    it('zwraca 404 dla nieistniejącego id', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/customers/00000000-0000-0000-0000-000000000000')
        .set(authHeader(adminAccessToken));
      expect(res.status).toBe(404);
    });

    it('zwraca dane klienta po id', async () => {
      const res = await request(app.getHttpServer()).get(`/api/customers/${customerId}`).set(authHeader(adminAccessToken));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(customerId);
    });
  });

  describe('PATCH /api/customers/:id', () => {
    let customerId: string;

    beforeAll(async () => {
      const created = await prisma.customer.create({
        data: { companyId, firstName: 'Piotr', lastName: 'Zieliński', phone: '600000002' },
      });
      customerId = created.id;
    });

    it('odmawia dostępu bez uprawnienia `customers.edit` (RBAC-001)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/customers/${customerId}`)
        .set(authHeader(noPermAccessToken))
        .send({ lastName: 'Kowalski' });
      expect(res.status).toBe(403);
    });

    it('zwraca 404 dla nieistniejącego klienta', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/customers/00000000-0000-0000-0000-000000000000')
        .set(authHeader(adminAccessToken))
        .send({ lastName: 'Kowalski' });
      expect(res.status).toBe(404);
    });

    it('aktualizuje dane, zapisuje AuditLog i publikuje `customer.updated`', async () => {
      const received: unknown[] = [];
      emitter.once(EVENT_NAMES.CUSTOMER_UPDATED, (event) => received.push(event));

      const res = await request(app.getHttpServer())
        .patch(`/api/customers/${customerId}`)
        .set(authHeader(adminAccessToken))
        .send({ lastName: 'Kowalska' });

      expect(res.status).toBe(200);
      expect(res.body.lastName).toBe('Kowalska');
      expect(received).toHaveLength(1);

      const auditEntries = await prisma.auditLog.findMany({ where: { companyId, action: 'CUSTOMER_UPDATED', entityId: customerId } });
      expect(auditEntries).toHaveLength(1);
    });

    it('odrzuca próbę zmiany pola spoza DTO (id) — VALIDATION-001', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/customers/${customerId}`)
        .set(authHeader(adminAccessToken))
        .send({ id: '00000000-0000-0000-0000-000000000000' });
      expect(res.status).toBe(422);
    });
  });
});
