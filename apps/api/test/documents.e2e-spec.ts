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
 * `test/cases.e2e-spec.ts`). Nieuruchomiony w tym środowisku — patrz raport
 * końcowy Zadania 17.
 */
describe('Documents (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emitter: EventEmitter2;

  let companyId: string;
  let caseId: string;
  let caseItemId: string;
  let otherCompanyCaseId: string;
  let adminAccessToken: string;
  let noPermAccessToken: string;
  const adminEmail = `e2e-documents-admin-${Date.now()}@sklep.pl`;
  const noPermEmail = `e2e-documents-noperm-${Date.now()}@sklep.pl`;
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

    const company = await prisma.company.create({ data: { name: `E2E Documents ${Date.now()}` } });
    companyId = company.id;
    const customer = await prisma.customer.create({ data: { companyId, firstName: 'Jan', lastName: 'Kowalski', phone: '600000000' } });
    const contractor = await prisma.contractor.create({ data: { companyId, name: `E2E Producent ${Date.now()}` } });
    const manufacturer = await prisma.manufacturer.create({ data: { companyId, contractorId: contractor.id } });
    const product = await prisma.product.create({ data: { companyId, manufacturerId: manufacturer.id, name: 'Rower X' } });

    const caseRecord = await prisma.case.create({
      data: {
        companyId,
        customerId: customer.id,
        caseNumber: `RMA/E2E-DOCS/${Date.now()}`,
        complaintType: 'Warranty',
        requestedResolution: 'Naprawa',
        description: 'Opis usterki',
        items: { create: [{ productId: product.id, description: 'Rysa' }] },
      },
      include: { items: true },
    });
    caseId = caseRecord.id;
    caseItemId = caseRecord.items[0].id;

    // Sprawa w INNEJ firmie — do testu izolacji dzierżawy (BR-086).
    const otherCompany = await prisma.company.create({ data: { name: `E2E Documents Other ${Date.now()}` } });
    const otherCustomer = await prisma.customer.create({ data: { companyId: otherCompany.id, firstName: 'Anna', lastName: 'Nowak', phone: '600000001' } });
    const otherCase = await prisma.case.create({
      data: { companyId: otherCompany.id, customerId: otherCustomer.id, caseNumber: `RMA/E2E-DOCS-OTHER/${Date.now()}`, complaintType: 'Warranty', requestedResolution: 'Naprawa', description: 'Opis' },
    });
    otherCompanyCaseId = otherCase.id;

    const permissionCodes = ['documents.view', 'documents.upload', 'documents.markInvalid'];
    const permissions = await Promise.all(
      permissionCodes.map((code) => prisma.permission.upsert({ where: { code }, update: {}, create: { code, module: 'Documents', description: code } })),
    );

    const adminRole = await prisma.role.create({
      data: { companyId, name: `E2E Documents Admin ${Date.now()}`, code: `e2e-documents-admin-${Date.now()}`, permissions: { create: permissions.map((p) => ({ permissionId: p.id })) } },
    });
    const noPermRole = await prisma.role.create({ data: { companyId, name: `E2E Documents No Perms ${Date.now()}`, code: `e2e-documents-no-perms-${Date.now()}` } });

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
    await prisma.auditLog.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.document.deleteMany({ where: { case: { companyId } } }).catch(() => undefined);
    await prisma.caseHistory.deleteMany({ where: { case: { companyId } } }).catch(() => undefined);
    await prisma.case.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.customer.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.product.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.manufacturer.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.contractor.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.role.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    await prisma.case.deleteMany({ where: { id: otherCompanyCaseId } }).catch(() => undefined);
    await app.close();
  });

  const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });
  const uploadBody = (overrides: Record<string, unknown> = {}) => ({
    fileName: 'zdjecie.jpg',
    fileType: 'JPG',
    mimeType: 'image/jpeg',
    fileSize: 204800,
    storagePath: '/uploads/zdjecie.jpg',
    ...overrides,
  });

  describe('POST /api/cases/:caseId/documents', () => {
    it('odmawia dostępu bez uprawnienia `documents.upload` (RBAC-001)', async () => {
      const res = await request(app.getHttpServer()).post(`/api/cases/${caseId}/documents`).set(authHeader(noPermAccessToken)).send(uploadBody());
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('RBAC-001');
    });

    it('zwraca 404 dla nieistniejącej sprawy', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/cases/00000000-0000-0000-0000-000000000000/documents')
        .set(authHeader(adminAccessToken))
        .send(uploadBody());
      expect(res.status).toBe(404);
    });

    it('zwraca 404 dla sprawy należącej do INNEJ firmy (izolacja dzierżawy)', async () => {
      const res = await request(app.getHttpServer()).post(`/api/cases/${otherCompanyCaseId}/documents`).set(authHeader(adminAccessToken)).send(uploadBody());
      expect(res.status).toBe(404);
    });

    it('zwraca 422 dla nieprawidłowego fileType (poza enumem DocumentType)', async () => {
      const res = await request(app.getHttpServer()).post(`/api/cases/${caseId}/documents`).set(authHeader(adminAccessToken)).send(uploadBody({ fileType: 'BMP' }));
      expect(res.status).toBe(422);
    });

    it('zwraca 404, gdy caseItemId nie należy do tej sprawy', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/cases/${caseId}/documents`)
        .set(authHeader(adminAccessToken))
        .send(uploadBody({ caseItemId: '00000000-0000-0000-0000-000000000000' }));
      expect(res.status).toBe(404);
    });

    it('odrzuca próbę ustawienia pola systemowego spoza DTO (status) — VALIDATION-001', async () => {
      const res = await request(app.getHttpServer()).post(`/api/cases/${caseId}/documents`).set(authHeader(adminAccessToken)).send(uploadBody({ status: 'Bledny' }));
      expect(res.status).toBe(422);
    });

    it('przesyła dokument, zapisuje AuditLog+CaseHistory(DocumentAdded) i publikuje `document.uploaded`', async () => {
      const received: unknown[] = [];
      emitter.once(EVENT_NAMES.DOCUMENT_UPLOADED, (event) => received.push(event));

      const res = await request(app.getHttpServer())
        .post(`/api/cases/${caseId}/documents`)
        .set(authHeader(adminAccessToken))
        .send(uploadBody({ caseItemId, category: 'Photo', visibility: 'Public' }));

      expect(res.status).toBe(201);
      expect(res.body.caseId).toBe(caseId);
      expect(received).toHaveLength(1);

      const auditEntries = await prisma.auditLog.findMany({ where: { action: 'DOCUMENT_UPLOADED', entityId: res.body.id } });
      expect(auditEntries).toHaveLength(1);

      const history = await prisma.caseHistory.findMany({ where: { caseId, action: 'DocumentAdded' } });
      expect(history).toHaveLength(1);
      expect(history[0].visibleForCustomer).toBe(true);
    });
  });

  describe('GET /api/cases/:caseId/documents i /:documentId', () => {
    let documentId: string;

    beforeAll(async () => {
      const doc = await prisma.document.create({
        data: { caseId, fileName: 'faktura.pdf', fileType: 'PDF', mimeType: 'application/pdf', fileSize: 5000, storagePath: '/uploads/faktura.pdf', uploadedById: (await prisma.user.findFirstOrThrow({ where: { email: adminEmail } })).id },
      });
      documentId = doc.id;
    });

    it('odmawia dostępu bez uprawnienia `documents.view`', async () => {
      const res = await request(app.getHttpServer()).get(`/api/cases/${caseId}/documents`).set(authHeader(noPermAccessToken));
      expect(res.status).toBe(403);
    });

    it('zwraca listę dokumentów sprawy', async () => {
      const res = await request(app.getHttpServer()).get(`/api/cases/${caseId}/documents`).set(authHeader(adminAccessToken));
      expect(res.status).toBe(200);
      expect(res.body.some((d: { id: string }) => d.id === documentId)).toBe(true);
    });

    it('zwraca 404 dla dokumentu należącego do innej sprawy niż w URL', async () => {
      const res = await request(app.getHttpServer()).get(`/api/cases/${otherCompanyCaseId}/documents/${documentId}`).set(authHeader(adminAccessToken));
      expect(res.status).toBe(404);
    });

    it('zwraca dokument po id', async () => {
      const res = await request(app.getHttpServer()).get(`/api/cases/${caseId}/documents/${documentId}`).set(authHeader(adminAccessToken));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(documentId);
    });
  });

  describe('POST /api/cases/:caseId/documents/:documentId/mark-invalid', () => {
    let documentId: string;

    beforeAll(async () => {
      const doc = await prisma.document.create({
        data: { caseId, fileName: 'rozmazane.jpg', fileType: 'JPG', mimeType: 'image/jpeg', fileSize: 1000, storagePath: '/uploads/rozmazane.jpg', uploadedById: (await prisma.user.findFirstOrThrow({ where: { email: adminEmail } })).id },
      });
      documentId = doc.id;
    });

    it('odmawia dostępu bez uprawnienia `documents.markInvalid`', async () => {
      const res = await request(app.getHttpServer()).post(`/api/cases/${caseId}/documents/${documentId}/mark-invalid`).set(authHeader(noPermAccessToken)).send({ reason: 'nieczytelne' });
      expect(res.status).toBe(403);
    });

    it('oznacza dokument jako błędny, zapisuje AuditLog+CaseHistory i publikuje `document.marked_invalid`', async () => {
      const received: unknown[] = [];
      emitter.once(EVENT_NAMES.DOCUMENT_MARKED_INVALID, (event) => received.push(event));

      const res = await request(app.getHttpServer())
        .post(`/api/cases/${caseId}/documents/${documentId}/mark-invalid`)
        .set(authHeader(adminAccessToken))
        .send({ reason: 'zdjęcie nieczytelne' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('Bledny');
      expect(received).toHaveLength(1);

      const history = await prisma.caseHistory.findMany({ where: { caseId, action: 'DocumentMarkedInvalid' } });
      expect(history).toHaveLength(1);
      expect(history[0].newValue).toBe('zdjęcie nieczytelne');
    });

    it('jest IDEMPOTENTNE — druga próba na już błędnym dokumencie zwraca 201 bez nowego wpisu CaseHistory', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/cases/${caseId}/documents/${documentId}/mark-invalid`)
        .set(authHeader(adminAccessToken))
        .send({ reason: 'ponowna próba' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('Bledny');

      const history = await prisma.caseHistory.findMany({ where: { caseId, action: 'DocumentMarkedInvalid' } });
      expect(history).toHaveLength(1);
    });

    it('zwraca 422 bez powodu (reason wymagany, min. 1 znak)', async () => {
      const res = await request(app.getHttpServer()).post(`/api/cases/${caseId}/documents/${documentId}/mark-invalid`).set(authHeader(adminAccessToken)).send({ reason: '' });
      expect(res.status).toBe(422);
    });
  });
});
