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
 * `test/companies.e2e-spec.ts`/`test/customers.e2e-spec.ts`).
 */
describe('Products (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emitter: EventEmitter2;

  let companyId: string;
  let manufacturerId: string;
  let adminAccessToken: string;
  let noPermAccessToken: string;
  const adminEmail = `e2e-products-admin-${Date.now()}@sklep.pl`;
  const noPermEmail = `e2e-products-noperm-${Date.now()}@sklep.pl`;
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

    const company = await prisma.company.create({ data: { name: `E2E Products ${Date.now()}` } });
    companyId = company.id;

    const contractor = await prisma.contractor.create({ data: { companyId, name: `E2E Producent ${Date.now()}` } });
    const manufacturer = await prisma.manufacturer.create({ data: { companyId, contractorId: contractor.id } });
    manufacturerId = manufacturer.id;

    const permissionCodes = ['products.view', 'products.manage', 'brands.manage'];
    const permissions = await Promise.all(
      permissionCodes.map((code) =>
        prisma.permission.upsert({ where: { code }, update: {}, create: { code, module: 'Products', description: code } }),
      ),
    );

    const adminRole = await prisma.role.create({
      data: {
        companyId,
        name: `E2E Products Admin ${Date.now()}`,
        code: `e2e-products-admin-${Date.now()}`,
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });
    const noPermRole = await prisma.role.create({
      data: { companyId, name: `E2E Products No Perms ${Date.now()}`, code: `e2e-products-no-perms-${Date.now()}` },
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
    await prisma.product.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.productCategory.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.brand.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.manufacturer.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.contractor.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.role.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    await app.close();
  });

  const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('POST /api/products', () => {
    it('odmawia dostępu bez uprawnienia `products.manage` (RBAC-001)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/products')
        .set(authHeader(noPermAccessToken))
        .send({ manufacturerId, name: 'Rower X' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('RBAC-001');
    });

    it('zwraca 422 dla brakującego wymaganego pola (name)', async () => {
      const res = await request(app.getHttpServer()).post('/api/products').set(authHeader(adminAccessToken)).send({ manufacturerId });
      expect(res.status).toBe(422);
    });

    it('zwraca 404, gdy manufacturerId nie istnieje', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/products')
        .set(authHeader(adminAccessToken))
        .send({ manufacturerId: '00000000-0000-0000-0000-000000000000', name: 'Rower X' });
      expect(res.status).toBe(404);
    });

    it('tworzy produkt z kategorią (Etap 4 — categoryId), zapisuje AuditLog i publikuje `product.created`', async () => {
      const category = await prisma.productCategory.create({
        data: { companyId, manufacturerId, name: 'Rowery' },
      });

      const received: unknown[] = [];
      emitter.once(EVENT_NAMES.PRODUCT_CREATED, (event) => received.push(event));

      const res = await request(app.getHttpServer())
        .post('/api/products')
        .set(authHeader(adminAccessToken))
        .send({ manufacturerId, name: 'Rower X', sku: 'SKU-1', categoryId: category.id });

      expect(res.status).toBe(201);
      expect(res.body.companyId).toBe(companyId);
      expect(res.body.categoryId).toBe(category.id);
      expect(received).toHaveLength(1);

      const auditEntries = await prisma.auditLog.findMany({ where: { companyId, action: 'PRODUCT_CREATED', entityId: res.body.id } });
      expect(auditEntries).toHaveLength(1);
    });

    it('zwraca 404, gdy categoryId nie istnieje', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/products')
        .set(authHeader(adminAccessToken))
        .send({ manufacturerId, name: 'Rower Y', categoryId: '00000000-0000-0000-0000-000000000000' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/products i GET /api/products/:id', () => {
    let productId: string;

    beforeAll(async () => {
      const created = await prisma.product.create({ data: { companyId, manufacturerId, name: 'Deska SUP', sku: 'SUP-1' } });
      productId = created.id;
    });

    it('odmawia dostępu bez uprawnienia `products.view` (RBAC-001)', async () => {
      const res = await request(app.getHttpServer()).get('/api/products').set(authHeader(noPermAccessToken));
      expect(res.status).toBe(403);
    });

    it('zwraca pełną listę produktów bez `query`', async () => {
      const res = await request(app.getHttpServer()).get('/api/products').set(authHeader(adminAccessToken));
      expect(res.status).toBe(200);
      expect(res.body.some((p: { id: string }) => p.id === productId)).toBe(true);
    });

    it('zwraca wyniki wyszukiwania po nazwie z `query`', async () => {
      const res = await request(app.getHttpServer()).get('/api/products').query({ query: 'SUP' }).set(authHeader(adminAccessToken));
      expect(res.status).toBe(200);
      expect(res.body.some((p: { id: string }) => p.id === productId)).toBe(true);
    });

    it('zwraca 404 dla nieistniejącego id', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/products/00000000-0000-0000-0000-000000000000')
        .set(authHeader(adminAccessToken));
      expect(res.status).toBe(404);
    });

    it('zwraca dane produktu po id', async () => {
      const res = await request(app.getHttpServer()).get(`/api/products/${productId}`).set(authHeader(adminAccessToken));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(productId);
    });
  });

  describe('PATCH /api/products/:id', () => {
    let productId: string;

    beforeAll(async () => {
      const created = await prisma.product.create({ data: { companyId, manufacturerId, name: 'Kask MTB' } });
      productId = created.id;
    });

    it('odmawia dostępu bez uprawnienia `products.manage` (RBAC-001)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/products/${productId}`)
        .set(authHeader(noPermAccessToken))
        .send({ name: 'X' });
      expect(res.status).toBe(403);
    });

    it('zwraca 404 dla nieistniejącego produktu', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/products/00000000-0000-0000-0000-000000000000')
        .set(authHeader(adminAccessToken))
        .send({ name: 'X' });
      expect(res.status).toBe(404);
    });

    it('aktualizuje dane, zapisuje AuditLog i publikuje `product.updated`', async () => {
      const received: unknown[] = [];
      emitter.once(EVENT_NAMES.PRODUCT_UPDATED, (event) => received.push(event));

      const res = await request(app.getHttpServer())
        .patch(`/api/products/${productId}`)
        .set(authHeader(adminAccessToken))
        .send({ name: 'Kask MTB Pro' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Kask MTB Pro');
      expect(received).toHaveLength(1);
    });

    it('odrzuca próbę zmiany pola systemowego spoza DTO (createdAt) — VALIDATION-001', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/products/${productId}`)
        .set(authHeader(adminAccessToken))
        .send({ createdAt: '2020-01-01T00:00:00.000Z' });
      expect(res.status).toBe(422);
    });

    it('Etap 4 — dezaktywuje produkt przez `active:false` (panel "Dezaktywuj"), NIE usuwa go — pozostaje w danych historycznych', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/products/${productId}`)
        .set(authHeader(adminAccessToken))
        .send({ active: false });

      expect(res.status).toBe(200);
      expect(res.body.active).toBe(false);
      expect(res.body.id).toBe(productId);

      const stillFound = await request(app.getHttpServer())
        .get(`/api/products/${productId}`)
        .set(authHeader(adminAccessToken));
      expect(stillFound.status).toBe(200);
      expect(stillFound.body.active).toBe(false);

      // Reaktywacja — ta sama ścieżka działa w obie strony.
      const reactivated = await request(app.getHttpServer())
        .patch(`/api/products/${productId}`)
        .set(authHeader(adminAccessToken))
        .send({ active: true });
      expect(reactivated.status).toBe(200);
      expect(reactivated.body.active).toBe(true);
    });
  });

  describe('POST /api/brands i GET /api/brands', () => {
    let brandId: string;

    it('odmawia dostępu bez uprawnienia `brands.manage` (RBAC-001)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/brands')
        .set(authHeader(noPermAccessToken))
        .send({ manufacturerId, name: 'Acme' });
      expect(res.status).toBe(403);
    });

    it('zwraca 404, gdy manufacturerId nie istnieje', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/brands')
        .set(authHeader(adminAccessToken))
        .send({ manufacturerId: '00000000-0000-0000-0000-000000000000', name: 'Acme' });
      expect(res.status).toBe(404);
    });

    it('tworzy markę, zapisuje AuditLog i publikuje `brand.created`', async () => {
      const received: unknown[] = [];
      emitter.once(EVENT_NAMES.BRAND_CREATED, (event) => received.push(event));

      const res = await request(app.getHttpServer())
        .post('/api/brands')
        .set(authHeader(adminAccessToken))
        .send({ manufacturerId, name: 'Acme' });

      expect(res.status).toBe(201);
      expect(res.body.companyId).toBe(companyId);
      expect(received).toHaveLength(1);
      brandId = res.body.id;

      const auditEntries = await prisma.auditLog.findMany({ where: { companyId, action: 'BRAND_CREATED', entityId: brandId } });
      expect(auditEntries).toHaveLength(1);
    });

    it('zwraca listę marek zawierającą nowo utworzoną', async () => {
      const res = await request(app.getHttpServer()).get('/api/brands').set(authHeader(adminAccessToken));
      expect(res.status).toBe(200);
      expect(res.body.some((b: { id: string }) => b.id === brandId)).toBe(true);
    });

    it('GET /api/brands/:id zwraca 404 dla nieistniejącej marki', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/brands/00000000-0000-0000-0000-000000000000')
        .set(authHeader(adminAccessToken));
      expect(res.status).toBe(404);
    });

    it('PATCH /api/brands/:id aktualizuje markę i publikuje `brand.updated`', async () => {
      const received: unknown[] = [];
      emitter.once(EVENT_NAMES.BRAND_UPDATED, (event) => received.push(event));

      const res = await request(app.getHttpServer())
        .patch(`/api/brands/${brandId}`)
        .set(authHeader(adminAccessToken))
        .send({ name: 'Acme Corp' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Acme Corp');
      expect(received).toHaveLength(1);
    });
  });
});
