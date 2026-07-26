import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { PasswordService } from '../src/modules/auth/services/password.service';

/**
 * Test integracyjny/e2e — WYMAGA prawdziwego Postgresa i Redisa (jak
 * `test/auth.e2e-spec.ts`). Nieuruchomiony w tym środowisku — patrz raport
 * końcowy Zadania 2. Fixtury (`Permission` przez `upsert`, nie `create`) są
 * bezpieczne niezależnie od tego, czy `seed.ts` już działał na tej bazie.
 */
describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;

  let companyId: string;
  let adminAccessToken: string;
  let noPermRoleId: string;
  let noPermAccessToken: string;
  const createdUserIds: string[] = [];
  const adminEmail = `e2e-users-admin-${Date.now()}@sklep.pl`;
  const noPermEmail = `e2e-users-noperm-${Date.now()}@sklep.pl`;
  const password = 'Test-Password-123!';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix('api', { exclude: ['health', 'version'] });
    await app.init();

    prisma = app.get(PrismaService);
    passwordService = app.get(PasswordService);

    const company = await prisma.company.create({ data: { name: `E2E Users ${Date.now()}` } });
    companyId = company.id;

    // Uprawnienia przez upsert(code) — bezpieczne, jeśli seed.ts już je utworzył.
    const permissionCodes = ['users.view', 'users.create', 'users.edit', 'users.deactivate'];
    const permissions = await Promise.all(
      permissionCodes.map((code) =>
        prisma.permission.upsert({
          where: { code },
          update: {},
          create: { code, module: 'Users', description: code },
        }),
      ),
    );

    const adminRole = await prisma.role.create({
      data: {
        companyId,
        name: `E2E Users Admin ${Date.now()}`,
        code: `e2e-users-admin-${Date.now()}`,
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });

    const noPermRole = await prisma.role.create({
      data: { companyId, name: `E2E No Perms ${Date.now()}`, code: `e2e-no-perms-${Date.now()}` },
    });
    noPermRoleId = noPermRole.id;

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
    await prisma.user.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.role.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    await app.close();
  });

  const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('POST /api/users (utworzenie)', () => {
    it('odmawia dostępu użytkownikowi bez uprawnienia `users.create` (RBAC-001)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users')
        .set(authHeader(noPermAccessToken))
        .send({ firstName: 'X', lastName: 'Y', email: 'x@sklep.pl', password: 'Haslo-1234', roleIds: [noPermRoleId] });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('RBAC-001');
    });

    it('tworzy użytkownika i NIGDY nie zwraca passwordHash', async () => {
      const email = `e2e-created-${Date.now()}@sklep.pl`;
      const res = await request(app.getHttpServer())
        .post('/api/users')
        .set(authHeader(adminAccessToken))
        .send({
          firstName: 'Nowy',
          lastName: 'Pracownik',
          email,
          password: 'Bardzo-Tajne-123',
          roleIds: [noPermRoleId],
        });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe(email);
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('password');
      createdUserIds.push(res.body.id);
    });

    it('zwraca 409 USER-001 dla zduplikowanego e-maila (roleIds poprawne — test celuje w regułę biznesową, nie walidację DTO)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users')
        .set(authHeader(adminAccessToken))
        .send({
          firstName: 'Duplikat',
          lastName: 'Testowy',
          email: adminEmail,
          password: 'Bardzo-Tajne-123',
          roleIds: [noPermRoleId],
        });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('USER-001');
    });

    it('zwraca 422 RBAC-004 dla pustej listy ról (walidacja DTO, nie dociera do serwisu)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users')
        .set(authHeader(adminAccessToken))
        .send({
          firstName: 'Bez',
          lastName: 'Roli',
          email: `e2e-no-role-${Date.now()}@sklep.pl`,
          password: 'Bardzo-Tajne-123',
          roleIds: [],
        });
      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/users/:id (szczegóły)', () => {
    it('zwraca 404 USER-002 dla nieistniejącego id', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users/00000000-0000-0000-0000-000000000000')
        .set(authHeader(adminAccessToken));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('USER-002');
    });

    it('zwraca dane utworzonego użytkownika', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/users/${createdUserIds[0]}`)
        .set(authHeader(adminAccessToken));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdUserIds[0]);
    });
  });

  describe('PATCH /api/users/:id (edycja)', () => {
    it('aktualizuje dane profilu', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/users/${createdUserIds[0]}`)
        .set(authHeader(adminAccessToken))
        .send({ firstName: 'Zaktualizowane' });
      expect(res.status).toBe(200);
      expect(res.body.firstName).toBe('Zaktualizowane');
    });

    it('odrzuca próbę zmiany `active` przez ten endpoint (VALIDATION-001 — pole nieznane)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/users/${createdUserIds[0]}`)
        .set(authHeader(adminAccessToken))
        .send({ active: false });
      expect(res.status).toBe(422);
    });

    it('zwraca 409 USER-001, gdy nowy e-mail należy do innego użytkownika', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/users/${createdUserIds[0]}`)
        .set(authHeader(adminAccessToken))
        .send({ email: adminEmail });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('USER-001');
    });
  });

  describe('POST /api/users/:id/deactivate (dezaktywacja)', () => {
    it('odmawia dostępu bez uprawnienia `users.deactivate`', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/users/${createdUserIds[0]}/deactivate`)
        .set(authHeader(noPermAccessToken));
      expect(res.status).toBe(403);
    });

    it('dezaktywuje konto (active=false) i zwraca warnings: [] (brak otwartych spraw)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/users/${createdUserIds[0]}/deactivate`)
        .set(authHeader(adminAccessToken));
      expect(res.status).toBe(201);
      expect(res.body.user.active).toBe(false);
      expect(res.body.warnings).toEqual([]);
    });
  });
});
