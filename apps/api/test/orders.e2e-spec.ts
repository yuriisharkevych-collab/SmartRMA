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
 * `test/products.e2e-spec.ts`). Nieuruchomiony w tym środowisku — patrz
 * raport końcowy Zadania 15.
 */
describe('Orders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emitter: EventEmitter2;

  let companyId: string;
  let customerId: string;
  let shopId: string;
  let productId: string;
  let adminAccessToken: string;
  let noPermAccessToken: string;
  const adminEmail = `e2e-orders-admin-${Date.now()}@sklep.pl`;
  const noPermEmail = `e2e-orders-noperm-${Date.now()}@sklep.pl`;
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

    const company = await prisma.company.create({ data: { name: `E2E Orders ${Date.now()}` } });
    companyId = company.id;

    const customer = await prisma.customer.create({ data: { companyId, firstName: 'Jan', lastName: 'Kowalski', phone: '600000000' } });
    customerId = customer.id;

    const shop = await prisma.shop.create({ data: { companyId, name: `E2E Sklep ${Date.now()}` } });
    shopId = shop.id;

    const contractor = await prisma.contractor.create({ data: { companyId, name: `E2E Producent ${Date.now()}` } });
    const manufacturer = await prisma.manufacturer.create({ data: { companyId, contractorId: contractor.id } });
    const product = await prisma.product.create({ data: { companyId, manufacturerId: manufacturer.id, name: 'Rower X' } });
    productId = product.id;

    const permissionCodes = ['orders.view', 'orders.manage', 'cases.create'];
    const permissions = await Promise.all(
      permissionCodes.map((code) =>
        prisma.permission.upsert({ where: { code }, update: {}, create: { code, module: 'Orders', description: code } }),
      ),
    );

    const adminRole = await prisma.role.create({
      data: {
        companyId,
        name: `E2E Orders Admin ${Date.now()}`,
        code: `e2e-orders-admin-${Date.now()}`,
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });
    const noPermRole = await prisma.role.create({
      data: { companyId, name: `E2E Orders No Perms ${Date.now()}`, code: `e2e-orders-no-perms-${Date.now()}` },
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
    await prisma.order.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.product.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.manufacturer.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.contractor.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.shop.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.customer.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.role.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    await app.close();
  });

  const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('POST /api/orders', () => {
    it('odmawia dostępu bez uprawnienia `orders.manage` (RBAC-001)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set(authHeader(noPermAccessToken))
        .send({ customerId, orderNumber: 'ZAM/E2E/001', orderDate: '2026-01-01', items: [{ productId }] });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('RBAC-001');
    });

    it('zwraca 422 dla pustej listy pozycji', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set(authHeader(adminAccessToken))
        .send({ customerId, orderNumber: 'ZAM/E2E/002', orderDate: '2026-01-01', items: [] });
      expect(res.status).toBe(422);
    });

    it('zwraca 404, gdy customerId nie istnieje', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set(authHeader(adminAccessToken))
        .send({ customerId: '00000000-0000-0000-0000-000000000000', orderNumber: 'ZAM/E2E/003', orderDate: '2026-01-01', items: [{ productId }] });
      expect(res.status).toBe(404);
    });

    it('zwraca 404, gdy shopId nie istnieje', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set(authHeader(adminAccessToken))
        .send({ customerId, shopId: '00000000-0000-0000-0000-000000000000', orderNumber: 'ZAM/E2E/004', orderDate: '2026-01-01', items: [{ productId }] });
      expect(res.status).toBe(404);
    });

    it('zwraca 404, gdy productId w pozycji nie istnieje', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set(authHeader(adminAccessToken))
        .send({ customerId, orderNumber: 'ZAM/E2E/005', orderDate: '2026-01-01', items: [{ productId: '00000000-0000-0000-0000-000000000000' }] });
      expect(res.status).toBe(404);
    });

    it('tworzy zamówienie, zapisuje AuditLog i publikuje `order.created`', async () => {
      const received: unknown[] = [];
      emitter.once(EVENT_NAMES.ORDER_CREATED, (event) => received.push(event));

      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set(authHeader(adminAccessToken))
        .send({ customerId, shopId, orderNumber: 'ZAM/E2E/006', orderDate: '2026-01-01', items: [{ productId, quantity: 2 }] });

      expect(res.status).toBe(201);
      expect(res.body.companyId).toBe(companyId);
      expect(res.body.items).toHaveLength(1);
      expect(received).toHaveLength(1);

      const auditEntries = await prisma.auditLog.findMany({ where: { companyId, action: 'ORDER_CREATED', entityId: res.body.id } });
      expect(auditEntries).toHaveLength(1);
    });

    it('zwraca 409 ORDER-002 dla zduplikowanego numeru zamówienia w tej samej firmie', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set(authHeader(adminAccessToken))
        .send({ customerId, orderNumber: 'ZAM/E2E/006', orderDate: '2026-01-01', items: [{ productId }] });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ORDER-002');
    });
  });

  describe('GET /api/orders, GET /api/orders/search, GET /api/orders/:id', () => {
    it('odmawia dostępu do listy bez uprawnienia `orders.view` (RBAC-001)', async () => {
      const res = await request(app.getHttpServer()).get('/api/orders').set(authHeader(noPermAccessToken));
      expect(res.status).toBe(403);
    });

    it('zwraca pełną listę zamówień bez `query`', async () => {
      const res = await request(app.getHttpServer()).get('/api/orders').set(authHeader(adminAccessToken));
      expect(res.status).toBe(200);
      expect(res.body.some((o: { orderNumber: string }) => o.orderNumber === 'ZAM/E2E/006')).toBe(true);
    });

    it('GET /api/orders/search zwraca `null` (nie 404) dla nieistniejącego numeru — ORDER-001', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/orders/search')
        .query({ orderNumber: 'NIE-ISTNIEJE' })
        .set(authHeader(adminAccessToken));
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    it('GET /api/orders/search zwraca zamówienie dla dokładnego numeru', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/orders/search')
        .query({ orderNumber: 'ZAM/E2E/006' })
        .set(authHeader(adminAccessToken));
      expect(res.status).toBe(200);
      expect(res.body.orderNumber).toBe('ZAM/E2E/006');
    });

    it('GET /api/orders/:id zwraca 404 dla nieistniejącego id', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/orders/00000000-0000-0000-0000-000000000000')
        .set(authHeader(adminAccessToken));
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/orders/:id', () => {
    let orderId: string;

    beforeAll(async () => {
      const order = await prisma.order.create({
        data: { companyId, customerId, orderNumber: 'ZAM/E2E/007', orderDate: new Date('2026-01-02'), items: { create: [{ productId }] } },
      });
      orderId = order.id;
    });

    it('odmawia dostępu bez uprawnienia `orders.manage` (RBAC-001)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/orders/${orderId}`)
        .set(authHeader(noPermAccessToken))
        .send({ totalAmount: 100 });
      expect(res.status).toBe(403);
    });

    it('zwraca 404 dla nieistniejącego zamówienia', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/orders/00000000-0000-0000-0000-000000000000')
        .set(authHeader(adminAccessToken))
        .send({ totalAmount: 100 });
      expect(res.status).toBe(404);
    });

    it('odrzuca próbę edycji pozycji zamówienia (items) — pole spoza DTO, VALIDATION-001', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/orders/${orderId}`)
        .set(authHeader(adminAccessToken))
        .send({ items: [{ productId, quantity: 5 }] });
      expect(res.status).toBe(422);
    });

    it('zwraca 409 ORDER-002 przy próbie zmiany numeru na już istniejący w tej firmie', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/orders/${orderId}`)
        .set(authHeader(adminAccessToken))
        .send({ orderNumber: 'ZAM/E2E/006' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ORDER-002');
    });

    it('aktualizuje dane, zapisuje AuditLog i publikuje `order.updated`', async () => {
      const received: unknown[] = [];
      emitter.once(EVENT_NAMES.ORDER_UPDATED, (event) => received.push(event));

      const res = await request(app.getHttpServer())
        .patch(`/api/orders/${orderId}`)
        .set(authHeader(adminAccessToken))
        .send({ totalAmount: 250 });

      expect(res.status).toBe(200);
      expect(res.body.totalAmount).toBe('250');
      expect(received).toHaveLength(1);

      const auditEntries = await prisma.auditLog.findMany({ where: { companyId, action: 'ORDER_UPDATED', entityId: orderId } });
      expect(auditEntries).toHaveLength(1);
    });
  });
});
