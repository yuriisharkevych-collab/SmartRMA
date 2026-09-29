import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { toValidationException } from '../src/common/validation/to-validation-exception';
import { PasswordService } from '../src/modules/auth/services/password.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Etap 6 (Partnerzy B2B — "Połącz z istniejącą firmą") — NA ŻYWO przez
 * prawdziwe żądania HTTP przeciw prawdziwej bazie. Pokrywa `POST
 * /partnerships/search-company` i `POST /partnerships/request-connection`:
 * symetryczne łączenie DWÓCH JUŻ ISTNIEJĄCYCH firm (w odróżnieniu od
 * `partner-onboarding.e2e-spec.ts`, który pokrywa zapraszanie firmy JESZCZE
 * NIEISTNIEJĄCEJ). Właściciel, specyfikacja: żadnego kopiowania danych/marek,
 * żadnego nowego `Company`/`User`, wyłącznie `Partnership{status:Invited}` do
 * zaakceptowania przez drugą stronę.
 */
describe('Partnerzy B2B — połączenie z istniejącą firmą (e2e) — Etap 6', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;

  const password = 'Test-Password-123!';
  const suffix = Date.now();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /**
   * Suma kontrolna NIP (jak w `partner-onboarding.e2e-spec.ts`) —
   * `Company.nip` ma dziś globalny częściowy unikalny indeks, więc każda
   * firma testowa potrzebuje WŁASNEGO, poprawnego NIP-u. LOSOWA baza (nie
   * `Date.now()`+offset) — deterministyczny seed kolidował między RÓŻNYMI
   * plikami e2e uruchomionymi RÓWNOLEGLE (dwa procesy jest workera czytają
   * `Date.now()` w tej samej milisekundzie, więc małe, przewidywalne
   * offsety w dwóch plikach mogą wylądować na TYM SAMYM NIP-ie — odkryte
   * empirycznie: `partner-onboarding.e2e-spec.ts` i ten plik, uruchomione
   * razem, wygenerowały identyczny NIP mimo osobnych funkcji generujących).
   */
  function makeValidNip(): string {
    const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const base = String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0').slice(-9);
      const digits = base.split('').map(Number);
      const sum = weights.reduce((acc, w, i) => acc + w * digits[i], 0);
      const checkDigit = sum % 11;
      if (checkDigit !== 10) return base + checkDigit;
    }
    throw new Error('Nie udało się wygenerować poprawnego NIP-u testowego.');
  }

  type Org = { companyId: string; nip: string; name: string; token: string };
  let shopA: Org;
  let distB: Org;
  let shopC: Org; // "outsider" + druga firma typu Shop, do testu niezgodnej pary typów

  async function createOrg(
    name: string,
    type: 'Shop' | 'ManufacturerDistributor',
    opts: { email?: string } = {},
  ): Promise<Org> {
    const nip = makeValidNip();
    const company = await prisma.company.create({
      data: { name: `${name} ${suffix}`, type, nip, email: opts.email },
    });

    const permissionCodes = ['partnerships.view', 'partnerships.manage'];
    const permissions = await Promise.all(
      permissionCodes.map((code) =>
        prisma.permission.upsert({
          where: { code },
          update: {},
          create: { code, module: 'partnerships', description: code },
        }),
      ),
    );
    const role = await prisma.role.create({
      data: {
        companyId: company.id,
        name: `${name} Admin ${suffix}`,
        code: `${name.toLowerCase()}-conn-admin-${suffix}`,
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });
    const email = `e2e-conn-${name.toLowerCase()}-${suffix}@example.com`;
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
    return { companyId: company.id, nip: company.nip!, name: company.name, token: login.body.accessToken };
  }

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

    shopA = await createOrg('ShopA', 'Shop');
    distB = await createOrg('DistB', 'ManufacturerDistributor', {
      email: `kontakt-distb-${suffix}@example.com`,
    });
    shopC = await createOrg('ShopC', 'Shop');
  }, 60_000);

  afterAll(async () => {
    const companyIds = [shopA.companyId, distB.companyId, shopC.companyId];
    for (const companyId of companyIds) {
      await prisma.notification.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.auditLog.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.partnershipBrand
        .deleteMany({ where: { partnership: { OR: [{ shopCompanyId: companyId }, { distributorCompanyId: companyId }] } } })
        .catch(() => undefined);
      await prisma.partnership
        .deleteMany({ where: { OR: [{ shopCompanyId: companyId }, { distributorCompanyId: companyId }] } })
        .catch(() => undefined);
      await prisma.userRoleAssignment.deleteMany({ where: { user: { companyId } } }).catch(() => undefined);
      await prisma.rolePermission.deleteMany({ where: { role: { companyId } } }).catch(() => undefined);
      await prisma.loginEvent.deleteMany({ where: { user: { companyId } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.role.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    }
    await app.close();
  }, 30_000);

  describe('POST /partnerships/search-company', () => {
    it('bez tokenu — 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/search-company')
        .send({ nip: distB.nip });
      expect(res.status).toBe(401);
    });

    it('422 VALIDATION-006 — NIP o nieprawidłowej sumie kontrolnej', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/search-company')
        .set(auth(shopA.token))
        .send({ nip: '9876543211' }); // 10 cyfr, ale cyfra kontrolna nie zgadza się z sumą ważoną
      expect(res.status).toBe(422);
    });

    it('200, body={} — NIP nie należy do żadnej firmy w SmartRMA', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/search-company')
        .set(auth(shopA.token))
        .send({ nip: makeValidNip() });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
    });

    it('200, body={} — wyszukanie WŁASNEGO NIP-u (nie można połączyć się z samym sobą)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/search-company')
        .set(auth(shopA.token))
        .send({ nip: shopA.nip });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
    });

    it('bezpieczeństwo tenantów (punkt 9) — zwraca WYŁĄCZNIE id/name/nip/type/alreadyConnected/pendingRequest, zero innych pól', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/search-company')
        .set(auth(shopA.token))
        .send({ nip: distB.nip });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: distB.companyId,
        name: distB.name,
        nip: distB.nip,
        type: 'ManufacturerDistributor',
        alreadyConnected: false,
        pendingRequest: false,
      });
      expect(Object.keys(res.body).sort()).toEqual(
        ['alreadyConnected', 'id', 'name', 'nip', 'pendingRequest', 'type'].sort(),
      );
    });

    it('para niezgodnych typów (Shop szuka Shopa) — firma znaleziona, ale obie flagi false (partnerstwo nigdy by nie powstało)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/search-company')
        .set(auth(shopA.token))
        .send({ nip: shopC.nip });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(shopC.companyId);
      expect(res.body.alreadyConnected).toBe(false);
      expect(res.body.pendingRequest).toBe(false);
    });
  });

  describe('POST /partnerships/request-connection', () => {
    let partnershipId: string;

    it('bez tokenu — 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/request-connection')
        .send({ targetCompanyId: distB.companyId });
      expect(res.status).toBe(401);
    });

    it('PARTNERSHIP-010 — nie można wysłać prośby do samego siebie', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/request-connection')
        .set(auth(shopA.token))
        .send({ targetCompanyId: shopA.companyId });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PARTNERSHIP-010');
    });

    it('404 — cel nie istnieje', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/request-connection')
        .set(auth(shopA.token))
        .send({ targetCompanyId: '00000000-0000-0000-0000-000000000000' });
      expect(res.status).toBe(404);
    });

    it('PARTNERSHIP-001 — para niezgodnych typów (Shop → Shop)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/request-connection')
        .set(auth(shopA.token))
        .send({ targetCompanyId: shopC.companyId });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PARTNERSHIP-001');
    });

    it('201 — tworzy prośbę o połączenie (status Invited), BEZ tworzenia Company/User, BEZ kopiowania danych/marek, i powiadamia drugą firmę e-mailem', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/request-connection')
        .set(auth(shopA.token))
        .send({ targetCompanyId: distB.companyId });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('Invited');
      expect(res.body.shopCompanyId).toBe(shopA.companyId);
      expect(res.body.distributorCompanyId).toBe(distB.companyId);
      expect(res.body.brands).toEqual([]);
      partnershipId = res.body.id;

      const companiesAfter = await prisma.company.count({
        where: { id: { in: [shopA.companyId, distB.companyId] } },
      });
      expect(companiesAfter).toBe(2); // zero nowych firm

      const notification = await prisma.notification.findFirst({
        where: { companyId: distB.companyId, template: { code: 'partnership.connection.requested' } },
        orderBy: { createdAt: 'desc' },
      });
      expect(notification).not.toBeNull();
      expect(notification!.recipientEmail).toBe(`kontakt-distb-${suffix}@example.com`);
    });

    it('szukanie po NIP teraz pokazuje pendingRequest=true po OBU stronach', async () => {
      const fromShop = await request(app.getHttpServer())
        .post('/api/partnerships/search-company')
        .set(auth(shopA.token))
        .send({ nip: distB.nip });
      expect(fromShop.body.pendingRequest).toBe(true);

      const fromDist = await request(app.getHttpServer())
        .post('/api/partnerships/search-company')
        .set(auth(distB.token))
        .send({ nip: shopA.nip });
      expect(fromDist.body.pendingRequest).toBe(true);
    });

    it('PARTNERSHIP-009 — nie można wysłać drugiej prośby, gdy poprzednia jeszcze oczekuje', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/request-connection')
        .set(auth(shopA.token))
        .send({ targetCompanyId: distB.companyId });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PARTNERSHIP-009');
    });

    it('Outsider (trzecia firma) NIE widzi oczekującej prośby w swojej liście partnerstw (izolacja tenantów)', async () => {
      const res = await request(app.getHttpServer()).get('/api/partnerships').set(auth(shopC.token));
      expect(res.body.find((p: { id: string }) => p.id === partnershipId)).toBeUndefined();
    });

    it('druga strona (Dystrybutor) akceptuje — partnerstwo Active, oba tenanty widzą wyłącznie SWOJE dane', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/partnerships/${partnershipId}/accept`)
        .set(auth(distB.token));
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('Active');
    });

    it('PARTNERSHIP-002 — po aktywacji kolejna prośba o połączenie tej samej pary jest odrzucona jako "już partner"', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/partnerships/request-connection')
        .set(auth(shopA.token))
        .send({ targetCompanyId: distB.companyId });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PARTNERSHIP-002');
    });
  });

  describe('Ponowienie ODRZUCONEJ prośby (Rejected → Invited, decyzja właściciela punkt 2)', () => {
    let partnershipId: string;

    it('przygotowanie: shopC wysyła prośbę do distB, distB odrzuca', async () => {
      const sent = await request(app.getHttpServer())
        .post('/api/partnerships/request-connection')
        .set(auth(shopC.token))
        .send({ targetCompanyId: distB.companyId });
      expect(sent.status).toBe(201);
      partnershipId = sent.body.id;

      const rejected = await request(app.getHttpServer())
        .post(`/api/partnerships/${partnershipId}/reject`)
        .set(auth(distB.token));
      expect(rejected.status).toBe(201);
      expect(rejected.body.status).toBe('Rejected');
    });

    it('ponowna prośba tej samej pary AKTUALIZUJE ten sam wiersz (Rejected → Invited), NIE tworzy drugiego Partnership', async () => {
      const before = await prisma.partnership.count({
        where: { shopCompanyId: shopC.companyId, distributorCompanyId: distB.companyId },
      });
      expect(before).toBe(1);

      const res = await request(app.getHttpServer())
        .post('/api/partnerships/request-connection')
        .set(auth(shopC.token))
        .send({ targetCompanyId: distB.companyId });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(partnershipId); // ten sam wiersz, nie nowy
      expect(res.body.status).toBe('Invited');
      expect(res.body.acceptedAt).toBeNull();
      expect(res.body.deactivatedAt).toBeNull();

      const after = await prisma.partnership.count({
        where: { shopCompanyId: shopC.companyId, distributorCompanyId: distB.companyId },
      });
      expect(after).toBe(1); // wciąż jeden wiersz — zaktualizowany, nie zdublowany
    });

    it('druga strona nadal może zaakceptować zresetowaną prośbę', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/partnerships/${partnershipId}/accept`)
        .set(auth(distB.token));
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('Active');
    });
  });
});
