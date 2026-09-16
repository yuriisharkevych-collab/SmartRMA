import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { toValidationException } from '../src/common/validation/to-validation-exception';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import { PrismaService } from '../src/prisma/prisma.service';

/** Ministerstwo Finansów, powszechnie używany w środowiskach testowych — `Company.nip` nie ma unikalności w bazie. */
const TEST_NIP = '5260001246';

/**
 * Fundament „Fresh Install" — e2e dla rejestracji (Shop/Producent/Dystrybutor
 * + NIP), potwierdzenia e-maila, samoobsługowego resetu hasła i Platform
 * Admina. `.overrideProvider(MailService)` przechwytuje treść e-maili
 * (`sendPlatformEmail`) zamiast realnej wysyłki — patrz doc-comment w
 * `company-onboarding.e2e-spec.ts`, ta sama technika.
 */
describe('Fundament „Fresh Install" — rejestracja, weryfikacja e-mail, reset hasła, Platform Admin (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const capturedEmails: Array<{ to: string; subject: string; html: string }> = [];
  const companyIdsToClean: string[] = [];

  function lastEmailTo(email: string) {
    return capturedEmails
      .slice()
      .reverse()
      .find((e) => e.to === email);
  }

  function extractToken(html: string): string | undefined {
    return html.match(/token=([0-9a-f]{64})/)?.[1];
  }

  function decodeCompanyId(accessToken: string): string {
    return JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8')).companyId;
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      // `POST /companies/signup` jest limitowany do 5/godz./IP (`@Throttle`,
      // Etap 6) — TEN plik samodzielnie zakłada więcej niż 5 firm (rejestracja
      // ×3 typów + walidacja + duplikat + weryfikacja + reset + Platform Admin),
      // więc test throttlingu samego w sobie byłby osobnym, wąskim testem.
      // `overrideGuard(ThrottlerGuard)` NIE DZIAŁA tutaj — `ThrottlerGuard` jest
      // rejestrowany WYŁĄCZNIE jako jeden z wielu providerów pod tokenem
      // `APP_GUARD` (globalny, `AppModule`), nigdy pod własnym tokenem klasy,
      // więc override "pod klasą" nie trafia w nic (ten sam wzorzec problemu co
      // `MailService`/`MAIL_SERVICE` wyżej w tym pliku) — potwierdzone empirycznie
      // (429 mimo override). Zamiast tego nadpisujemy `ThrottlerStorage`
      // (jedyny, jednoznaczny token — Symbol eksportowany przez `@nestjs/throttler`,
      // którego `ThrottlerGuard` faktycznie używa) fałszywym magazynem,
      // który zawsze zgłasza "brak limitu".
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: () =>
          Promise.resolve({ totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 }),
      })
      .overrideProvider(MAIL_SERVICE)
      .useValue({
        send: jest.fn().mockResolvedValue({ ok: true }),
        sendPlatformEmail: jest.fn((email: { to: string; subject: string; html: string }) => {
          capturedEmails.push(email);
          return Promise.resolve({ ok: true });
        }),
      })
      .compile();
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
  }, 60_000);

  afterAll(async () => {
    for (const companyId of companyIdsToClean) {
      await prisma.userRoleAssignment.deleteMany({ where: { user: { companyId } } }).catch(() => undefined);
      await prisma.loginEvent.deleteMany({ where: { user: { companyId } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.brand.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.manufacturer.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.contractor.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.caseStatusDefinition.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.shop.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.companySettings.deleteMany({ where: { companyId } }).catch(() => undefined);
      await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    }
    await app.close();
  }, 30_000);

  describe('Rejestracja — trzy typy organizacji + NIP wymagany', () => {
    it.each([
      ['Shop', 'Shop'],
      ['Producent', 'Producent'],
      ['Dystrybutor', 'Dystrybutor'],
    ] as const)('orgType=%s — 201, konto NIE jest zalogowane automatycznie (breaking change)', async (_label, orgType) => {
      const email = `${orgType.toLowerCase()}-${suffix}@example.local`;
      const res = await request(app.getHttpServer()).post('/api/companies/signup').send({
        companyName: `Org ${orgType} ${suffix}`,
        orgType,
        nip: TEST_NIP,
        adminFirstName: 'Test',
        adminLastName: orgType,
        adminEmail: email,
        password: 'Bezpieczne-Haslo-123!',
      });
      expect(res.status).toBe(201);
      expect(res.body).not.toHaveProperty('accessToken');
      expect(res.body.email).toBe(email);

      const user = await prisma.user.findFirst({ where: { email } });
      expect(user).toBeTruthy();
      expect(user!.emailVerifiedAt).toBeNull();
      companyIdsToClean.push(user!.companyId);
    });

    it('VALIDATION-006 — NIP pusty jest odrzucony 422 (pole wymagane, w przeciwieństwie do PATCH /companies/me)', async () => {
      const res = await request(app.getHttpServer()).post('/api/companies/signup').send({
        companyName: `Bez NIP ${suffix}`,
        orgType: 'Shop',
        nip: '',
        adminFirstName: 'Test',
        adminLastName: 'BrakNip',
        adminEmail: `brak-nip-${suffix}@example.local`,
        password: 'Bezpieczne-Haslo-123!',
      });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION-006');
    });

    it('VALIDATION-006 — NIP o nieprawidłowej sumie kontrolnej jest odrzucony 422', async () => {
      const res = await request(app.getHttpServer()).post('/api/companies/signup').send({
        companyName: `Zly NIP ${suffix}`,
        orgType: 'Shop',
        nip: '1234567890',
        adminFirstName: 'Test',
        adminLastName: 'ZlyNip',
        adminEmail: `zly-nip-${suffix}@example.local`,
        password: 'Bezpieczne-Haslo-123!',
      });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION-006');
    });

    it('AUTH-004 — hasło poniżej minimalnej długości jest odrzucone 400 (status AUTH-004 z ERROR_CODES.md, nie 422)', async () => {
      const res = await request(app.getHttpServer()).post('/api/companies/signup').send({
        companyName: `Slabe Haslo ${suffix}`,
        orgType: 'Shop',
        nip: TEST_NIP,
        adminFirstName: 'Test',
        adminLastName: 'SlabeHaslo',
        adminEmail: `slabe-haslo-${suffix}@example.local`,
        password: 'krotkie',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('AUTH-004');
    });

    it('USER-001 — e-mail administratora już zajęty przez istniejące konto Password → 409, bez wysyłki e-maila', async () => {
      const email = `duplikat-${suffix}@example.local`;
      const first = await request(app.getHttpServer()).post('/api/companies/signup').send({
        companyName: `Duplikat A ${suffix}`,
        orgType: 'Shop',
        nip: TEST_NIP,
        adminFirstName: 'Test',
        adminLastName: 'A',
        adminEmail: email,
        password: 'Bezpieczne-Haslo-123!',
      });
      expect(first.status).toBe(201);
      const userA = await prisma.user.findFirst({ where: { email } });
      companyIdsToClean.push(userA!.companyId);
      const emailsBefore = capturedEmails.length;

      const second = await request(app.getHttpServer()).post('/api/companies/signup').send({
        companyName: `Duplikat B ${suffix}`,
        orgType: 'Shop',
        nip: TEST_NIP,
        adminFirstName: 'Test',
        adminLastName: 'B',
        adminEmail: email,
        password: 'Inne-Bezpieczne-Haslo-456!',
      });
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('USER-001');
      expect(capturedEmails.length).toBe(emailsBefore);
    });
  });

  describe('Potwierdzenie e-maila (AUTH-007/AUTH-008)', () => {
    const email = `weryfikacja-${suffix}@example.local`;
    const password = 'Bezpieczne-Haslo-Weryfikacja-123!';

    beforeAll(async () => {
      const res = await request(app.getHttpServer()).post('/api/companies/signup').send({
        companyName: `Weryfikacja Org ${suffix}`,
        orgType: 'Shop',
        nip: TEST_NIP,
        adminFirstName: 'Wery',
        adminLastName: 'Fikacja',
        adminEmail: email,
        password,
      });
      const user = await prisma.user.findFirst({ where: { email } });
      companyIdsToClean.push(user!.companyId);
    });

    it('AUTH-007 — logowanie PRZED potwierdzeniem e-maila jest zablokowane, mimo poprawnego hasła', async () => {
      const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH-007');
    });

    it('AUTH-008 — token nieprawidłowy (zgadywany) jest odrzucony', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ token: 'a'.repeat(64) });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH-008');
    });

    it('potwierdzenie poprawnym tokenem → 204, logowanie działa od razu potem', async () => {
      const token = extractToken(lastEmailTo(email)!.html)!;
      expect(token).toMatch(/^[0-9a-f]{64}$/);

      const verify = await request(app.getHttpServer()).post('/api/auth/verify-email').send({ token });
      expect(verify.status).toBe(204);

      const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password });
      expect(login.status).toBe(200);
      expect(login.body.accessToken).toBeTruthy();
    });

    it('AUTH-008 — TEN SAM token użyty drugi raz jest odrzucony (jednorazowy)', async () => {
      const token = extractToken(lastEmailTo(email)!.html)!;
      const verify = await request(app.getHttpServer()).post('/api/auth/verify-email').send({ token });
      expect(verify.status).toBe(401);
      expect(verify.body.error.code).toBe('AUTH-008');
    });

    it('POST /auth/verify-email/resend — 204 neutralne, NIEZALEŻNIE od tego, czy e-mail istnieje', async () => {
      const unknown = await request(app.getHttpServer())
        .post('/api/auth/verify-email/resend')
        .send({ email: `nieistnieje-${suffix}@example.local` });
      expect(unknown.status).toBe(204);

      const emailsBefore = capturedEmails.length;
      const alreadyVerified = await request(app.getHttpServer())
        .post('/api/auth/verify-email/resend')
        .send({ email });
      expect(alreadyVerified.status).toBe(204);
      // Konto JUŻ zweryfikowane (test wyżej) — resend nie wysyła nowego e-maila.
      expect(capturedEmails.length).toBe(emailsBefore);
    });
  });

  describe('Reset hasła (AUTH-009) — żądanie/reset/jednorazowość/unieważnienie sesji', () => {
    const email = `reset-${suffix}@example.local`;
    const oldPassword = 'Stare-Bezpieczne-Haslo-123!';
    const newPassword = 'Nowe-Bezpieczne-Haslo-456!';
    let refreshTokenBeforeReset: string;

    beforeAll(async () => {
      const signup = await request(app.getHttpServer()).post('/api/companies/signup').send({
        companyName: `Reset Org ${suffix}`,
        orgType: 'Shop',
        nip: TEST_NIP,
        adminFirstName: 'Re',
        adminLastName: 'Set',
        adminEmail: email,
        password: oldPassword,
      });
      expect(signup.status).toBe(201);
      const user = await prisma.user.findFirst({ where: { email } });
      companyIdsToClean.push(user!.companyId);

      const verifyToken = extractToken(lastEmailTo(email)!.html)!;
      await request(app.getHttpServer()).post('/api/auth/verify-email').send({ token: verifyToken });

      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: oldPassword });
      expect(login.status).toBe(200);
      refreshTokenBeforeReset = login.body.refreshToken;
    });

    it('POST /auth/forgot-password — 204 neutralne dla e-mail NIEISTNIEJĄCY (przeciw enumeracji kont)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: `nieistnieje-reset-${suffix}@example.local` });
      expect(res.status).toBe(204);
    });

    it('AUTH-009 — token resetu nieprawidłowy (zgadywany) jest odrzucony', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: 'b'.repeat(64), password: newPassword });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH-009');
    });

    it('POST /auth/forgot-password dla konta ISTNIEJĄCEGO — 204, wysyła e-mail z tokenem', async () => {
      const res = await request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email });
      expect(res.status).toBe(204);
      expect(lastEmailTo(email)!.subject).toContain('Reset hasła');
    });

    it('reset poprawnym tokenem → 204; stare hasło jest odrzucone, nowe działa; refresh token sprzed resetu jest unieważniony', async () => {
      const token = extractToken(lastEmailTo(email)!.html)!;
      const reset = await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token, password: newPassword });
      expect(reset.status).toBe(204);

      const oldLogin = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: oldPassword });
      expect(oldLogin.status).toBe(401);
      expect(oldLogin.body.error.code).toBe('AUTH-001');

      const newLogin = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: newPassword });
      expect(newLogin.status).toBe(200);

      const staleRefresh = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: refreshTokenBeforeReset });
      expect(staleRefresh.status).toBe(401);
      expect(staleRefresh.body.error.code).toBe('AUTH-003');
    });

    it('AUTH-009 — TEN SAM token resetu użyty drugi raz jest odrzucony (jednorazowy)', async () => {
      const emailsBefore = capturedEmails.length;
      await request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email });
      expect(capturedEmails.length).toBe(emailsBefore + 1);
      const token = extractToken(lastEmailTo(email)!.html)!;

      const first = await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token, password: 'Jeszcze-Inne-Haslo-789!' });
      expect(first.status).toBe(204);

      const second = await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token, password: 'Kolejne-Haslo-000!' });
      expect(second.status).toBe(401);
      expect(second.body.error.code).toBe('AUTH-009');
    });
  });

  describe('Platform Admin — izolacja od Auth pracowniczego (nieskonfigurowany w tym środowisku, celowo — sekcja 14 zadania)', () => {
    it('POST /platform-auth/login — PLATFORM-001, bo PLATFORM_JWT_SECRET nie jest ustawiony (funkcja nieaktywna do świadomej konfiguracji)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/platform-auth/login')
        .send({ email: 'ktokolwiek@example.local', password: 'cokolwiek' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('PLATFORM-001');
    });

    it('GET /platform-admin/me — AUTH-003 bez tokenu', async () => {
      const res = await request(app.getHttpServer()).get('/api/platform-admin/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH-003');
    });

    it('GET /platform-admin/me — AUTH-003 z tokenem PRACOWNIKA (inny sekret JWT — nigdy nie przejdzie)', async () => {
      const email = `platform-izolacja-${suffix}@example.local`;
      const password = 'Bezpieczne-Haslo-Platform-123!';
      const signup = await request(app.getHttpServer()).post('/api/companies/signup').send({
        companyName: `Platform Izolacja ${suffix}`,
        orgType: 'Shop',
        nip: TEST_NIP,
        adminFirstName: 'Plat',
        adminLastName: 'Form',
        adminEmail: email,
        password,
      });
      expect(signup.status).toBe(201);
      const user = await prisma.user.findFirst({ where: { email } });
      companyIdsToClean.push(user!.companyId);
      const verifyToken = extractToken(lastEmailTo(email)!.html)!;
      await request(app.getHttpServer()).post('/api/auth/verify-email').send({ token: verifyToken });
      const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password });
      expect(login.status).toBe(200);

      const res = await request(app.getHttpServer())
        .get('/api/platform-admin/me')
        .set(auth(login.body.accessToken));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH-003');
      // Dowód, że to NAPRAWDĘ poprawny token pracowniczy (inny endpoint działa) — odrzucenie
      // wyżej jest specyficzne dla granicy Platform Admin, nie ogólną awarią guardu.
      const meCompany = await request(app.getHttpServer())
        .get('/api/companies/me')
        .set(auth(login.body.accessToken));
      expect(meCompany.status).toBe(200);
      expect(decodeCompanyId(login.body.accessToken)).toBe(meCompany.body.id);
    });
  });
});
