import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { toValidationException } from '../src/common/validation/to-validation-exception';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { PasswordService } from '../src/modules/auth/services/password.service';

/**
 * Audyt (uzupełnienie `hardDelete` o `CaseHandoff`) — dowód NA ŻYWEJ,
 * prawdziwej bazie (dwa prawdziwe, niezależne tenanty + prawdziwy
 * `CaseHandoff`), że `DELETE /cases/:id`:
 *
 *   A. działa bez zmian dla sprawy BEZ przekazania,
 *   B. dla sprawy będącej ŹRÓDŁEM (`originCaseId`) przekazania — usuwa
 *      łącznik `CaseHandoff` i samą sprawę, NIGDY sprawy-celu (inny tenant),
 *   C. dla sprawy będącej CELEM (`targetCaseId`) przekazania — lustrzane C,
 *   D. w obu przypadkach B/C: sprawa po drugiej stronie i WSZYSTKIE jej
 *      własne zależności (dokumenty/wiadomości/notatki) przeżywają w 100%
 *      nienaruszone, zweryfikowane bezpośrednio w bazie (nie tylko przez API).
 *
 * Ten sam wzorzec fixture co `test/multi-tenant-idor.e2e-spec.ts` (Faza 7) —
 * `createOrg` zakłada kompletną, prawdziwą organizację z zalogowanym tokenem;
 * różnica: tu obie strony dostają `cases.delete`, żeby móc wywołać hardDelete
 * z KAŻDEJ strony przekazania (scenariusz B usuwa ze strony Sklepu, C ze
 * strony Dystrybutora). Wszystkie dane tworzone i czyszczone przez ten plik —
 * zero operacji na DAWIDAM/Veresmeble czy jakimkolwiek innym, istniejącym tenancie.
 */
describe('CaseHandoff — hardDelete (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;

  const password = 'Test-Password-123!';
  const suffix = Date.now();

  type Org = {
    companyId: string;
    slug: string;
    manufacturerId: string;
    brandId: string;
    productId: string;
    customerId: string;
    token: string;
  };
  let shop: Org;
  let dist: Org;

  const ALL_PERMISSIONS = [
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
    'cases.portal.manage',
    'cases.handoff.send',
    'cases.delete',
    'documents.upload',
    'documents.view',
    'documents.markInvalid',
    'notes.create',
    'notes.view',
    'messages.send',
    'messages.view',
    'partnerships.view',
    'partnerships.manage',
    'brands.manage',
    'manufacturers.manage',
  ];

  /** Ten sam wzorzec co `multi-tenant-idor.e2e-spec.ts` — kompletna, prawdziwa organizacja + zalogowany token. */
  async function createOrg(name: string): Promise<Org> {
    const company = await prisma.company.create({
      data: { name: `${name} ${suffix}`, slug: `${name.toLowerCase()}-handoffdel-${suffix}` },
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
        requiresSerialNumber: false,
        requiresFrameNumber: false,
        requiresProofOfPurchase: false,
      },
    });
    const brand = await prisma.brand.create({
      data: { companyId: company.id, manufacturerId: manufacturer.id, name: `${name} marka ${suffix}` },
    });
    const product = await prisma.product.create({
      data: { companyId: company.id, manufacturerId: manufacturer.id, brandId: brand.id, name: `${name} produkt ${suffix}` },
    });
    const customer = await prisma.customer.create({
      data: { companyId: company.id, firstName: 'Jan', lastName: 'Testowy', phone: '600000000' },
    });

    const permissions = await Promise.all(
      ALL_PERMISSIONS.map((code) =>
        prisma.permission.upsert({ where: { code }, update: {}, create: { code, module: code.split('.')[0], description: code } }),
      ),
    );
    const role = await prisma.role.create({
      data: {
        companyId: company.id,
        name: `${name} Admin ${suffix}`,
        code: `${name.toLowerCase()}-handoffdel-admin-${suffix}`,
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });
    const email = `e2e-handoffdel-${name.toLowerCase()}-${suffix}@example.com`;
    await prisma.user.create({
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
      productId: product.id,
      customerId: customer.id,
      token: login.body.accessToken,
    };
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createCase(org: Org, description: string): Promise<{ id: string; caseNumber: string }> {
    const res = await request(app.getHttpServer())
      .post('/api/cases')
      .set(auth(org.token))
      .send({
        customerId: org.customerId,
        complaintType: 'Warranty',
        requestedResolution: 'Naprawa',
        description,
        items: [{ productId: org.productId, description: 'Opis usterki.' }],
      });
    return { id: res.body.id, caseNumber: res.body.caseNumber };
  }

  /** Przekazanie `origin` (strona Sklepu) → `distributor`, tworzy nową, niezależną sprawę w tenancie dystrybutora. Zwraca id sprawy-celu. */
  async function handoff(
    originOrg: Org,
    originCaseId: string,
    partnershipId: string,
    brandId: string,
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/api/cases/${originCaseId}/handoff`)
      .set(auth(originOrg.token))
      .send({ partnershipId, brandId });
    const targetCaseNumber = res.body.targetCaseNumber;
    const distCases = await request(app.getHttpServer()).get('/api/cases').set(auth(dist.token));
    return distCases.body.find((c: { caseNumber: string }) => c.caseNumber === targetCaseNumber).id;
  }

  async function addDependents(org: Org, caseId: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`/api/cases/${caseId}/notes`)
      .set(auth(org.token))
      .send({ content: `Notatka ${suffix}` });
    await request(app.getHttpServer())
      .post(`/api/cases/${caseId}/messages`)
      .set(auth(org.token))
      .send({ channel: 'Email', content: `Wiadomość ${suffix}` });
    await request(app.getHttpServer())
      .post(`/api/cases/${caseId}/documents`)
      .set(auth(org.token))
      .attach('file', Buffer.from('%PDF-1.4 handoff-delete-test'), 'handoffdel-test.pdf');
  }

  let partnershipId: string;

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

    shop = await createOrg('HdShop');
    dist = await createOrg('HdDist');
    await prisma.company.update({ where: { id: dist.companyId }, data: { type: 'ManufacturerDistributor', orgKind: 'Dystrybutor' } });

    const invite = await request(app.getHttpServer())
      .post('/api/partnerships/invite')
      .set(auth(shop.token))
      .send({ distributorSlug: dist.slug, brandIds: [dist.brandId] });
    partnershipId = invite.body.id;
    await request(app.getHttpServer()).post(`/api/partnerships/${partnershipId}/accept`).set(auth(dist.token));
  }, 60_000);

  afterAll(async () => {
    for (const companyId of [shop.companyId, dist.companyId]) {
      await prisma.auditLog.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.caseHandoff.deleteMany({ where: { OR: [{ originCompanyId: companyId }, { targetCompanyId: companyId }] } }).catch(() => undefined);
      await prisma.partnershipBrand.deleteMany({ where: { partnership: { OR: [{ shopCompanyId: companyId }, { distributorCompanyId: companyId }] } } }).catch(() => undefined);
      await prisma.partnership.deleteMany({ where: { OR: [{ shopCompanyId: companyId }, { distributorCompanyId: companyId }] } }).catch(() => undefined);
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
      await prisma.user.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.role.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    }
    await app.close();
  }, 30_000);

  it('Scenariusz A — sprawa BEZ przekazania: hardDelete działa jak dotychczas (204, sprawa i zależności znikają)', async () => {
    const caseA = await createCase(shop, 'Scenariusz A — brak handoffu.');
    await addDependents(shop, caseA.id);

    const del = await request(app.getHttpServer()).delete(`/api/cases/${caseA.id}`).set(auth(shop.token));
    expect(del.status).toBe(204);

    const getAfter = await request(app.getHttpServer()).get(`/api/cases/${caseA.id}`).set(auth(shop.token));
    expect(getAfter.status).toBe(404);

    const dbCase = await prisma.case.findUnique({ where: { id: caseA.id } });
    expect(dbCase).toBeNull();
    const dbNotes = await prisma.note.count({ where: { caseId: caseA.id } });
    expect(dbNotes).toBe(0);
  });

  it('Scenariusz B + D — usunięcie sprawy-ŹRÓDŁA (Sklep): kasuje CaseHandoff i sprawę Sklepu, sprawa-CEL Dystrybutora i jej zależności przeżywają w 100%', async () => {
    const caseA = await createCase(shop, 'Scenariusz B — origin, ma zostać usunięta.');
    const targetCaseId = await handoff(shop, caseA.id, partnershipId, dist.brandId);
    await addDependents(dist, targetCaseId); // zależności PO STRONIE CELU — mają przeżyć

    // Kontrola przed usunięciem — handoff realnie istnieje w bazie.
    const handoffBefore = await prisma.caseHandoff.findUnique({ where: { originCaseId: caseA.id } });
    expect(handoffBefore).not.toBeNull();
    expect(handoffBefore!.targetCaseId).toBe(targetCaseId);

    const del = await request(app.getHttpServer()).delete(`/api/cases/${caseA.id}`).set(auth(shop.token));
    expect(del.status).toBe(204);

    // Sprawa-źródło (Sklep) — rzeczywiście skasowana.
    expect(await prisma.case.findUnique({ where: { id: caseA.id } })).toBeNull();
    // Łącznik CaseHandoff — skasowany (inaczej samo `Case` nie dałoby się usunąć — FK).
    expect(await prisma.caseHandoff.findUnique({ where: { originCaseId: caseA.id } })).toBeNull();

    // AuditLog — ślad usunięcia sprawy-źródła istnieje mimo skasowania samej sprawy.
    const audit = await prisma.auditLog.findFirst({ where: { action: 'CASE_DELETED', entityId: caseA.id } });
    expect(audit).not.toBeNull();

    // Sprawa-CEL (INNY tenant — Dystrybutor) — w 100% nienaruszona: sam wiersz i jej
    // własne zależności (dokument/notatka/wiadomość dodane PO STRONIE CELU wyżej).
    const targetCase = await prisma.case.findUnique({ where: { id: targetCaseId } });
    expect(targetCase).not.toBeNull();
    expect(targetCase!.companyId).toBe(dist.companyId);
    expect(await prisma.document.count({ where: { caseId: targetCaseId } })).toBe(1);
    expect(await prisma.note.count({ where: { caseId: targetCaseId } })).toBe(1);
    expect(await prisma.message.count({ where: { caseId: targetCaseId } })).toBe(1);

    // Potwierdzone też przez API (nie tylko bezpośredni odczyt bazy) — z tokenem Dystrybutora.
    const getTarget = await request(app.getHttpServer()).get(`/api/cases/${targetCaseId}`).set(auth(dist.token));
    expect(getTarget.status).toBe(200);
  });

  it('Scenariusz C + D — usunięcie sprawy-CELU (Dystrybutor): kasuje CaseHandoff i sprawę Dystrybutora, sprawa-ŹRÓDŁO Sklepu i jej zależności przeżywają w 100%', async () => {
    const caseA2 = await createCase(shop, 'Scenariusz C — origin, ma PRZETRWAĆ.');
    await addDependents(shop, caseA2.id); // zależności PO STRONIE ŹRÓDŁA — mają przeżyć
    const targetCaseId2 = await handoff(shop, caseA2.id, partnershipId, dist.brandId);

    const handoffBefore = await prisma.caseHandoff.findUnique({ where: { targetCaseId: targetCaseId2 } });
    expect(handoffBefore).not.toBeNull();
    expect(handoffBefore!.originCaseId).toBe(caseA2.id);

    // Usuwamy sprawę-CEL, nie źródło — mirror scenariusza B, z drugiej strony granicy tenanta.
    const del = await request(app.getHttpServer()).delete(`/api/cases/${targetCaseId2}`).set(auth(dist.token));
    expect(del.status).toBe(204);

    expect(await prisma.case.findUnique({ where: { id: targetCaseId2 } })).toBeNull();
    expect(await prisma.caseHandoff.findUnique({ where: { targetCaseId: targetCaseId2 } })).toBeNull();

    const audit = await prisma.auditLog.findFirst({ where: { action: 'CASE_DELETED', entityId: targetCaseId2 } });
    expect(audit).not.toBeNull();

    // Sprawa-ŹRÓDŁO (INNY tenant — Sklep) — w 100% nienaruszona.
    const originCase = await prisma.case.findUnique({ where: { id: caseA2.id } });
    expect(originCase).not.toBeNull();
    expect(originCase!.companyId).toBe(shop.companyId);
    expect(await prisma.document.count({ where: { caseId: caseA2.id } })).toBe(1);
    expect(await prisma.note.count({ where: { caseId: caseA2.id } })).toBe(1);
    expect(await prisma.message.count({ where: { caseId: caseA2.id } })).toBe(1);

    const getOrigin = await request(app.getHttpServer()).get(`/api/cases/${caseA2.id}`).set(auth(shop.token));
    expect(getOrigin.status).toBe(200);
  });
});
