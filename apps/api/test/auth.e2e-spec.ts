import { Controller, Get, HttpStatus, INestApplication, UseGuards, ValidationPipe } from '@nestjs/common';
import { toValidationException } from '../src/common/validation/to-validation-exception';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { CurrentUser } from '../src/common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { PasswordService } from '../src/modules/auth/services/password.service';
import { Roles } from '../src/modules/auth/decorators/roles.decorator';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard';

/**
 * Test integracyjny/e2e — WYMAGA prawdziwego Postgresa i Redisa
 * (`docker compose up db redis`, `DATABASE_URL`/`REDIS_URL` wskazujące na
 * nie realny, ale DZIAŁAJĄCY test/dev target — patrz .env.example). Nie
 * mockuje Prisma/Redis: to jest cały sens testu integracyjnego względem
 * `auth.service.spec.ts` (jednostkowy, wszystko mockowane).
 *
 * Nieuruchomione w tym środowisku (brak Node.js/Dockera) — patrz raport
 * końcowy Zadania 1. Napisane pod realne `npm run test:e2e`.
 *
 * `TestOnlyController` poniżej to jednorazowy, testowy kontroler wyłącznie
 * do sprawdzenia `RolesGuard`/`@Roles()` na prawdziwym cyklu HTTP — NIE jest
 * to nowy moduł biznesowy (zakaz z zadania, punkt 17), tylko sposób na
 * przetestowanie guarda, który dziś nie jest jeszcze podpięty do żadnego
 * prawdziwego endpointu (patrz uzasadnienie w `roles.decorator.ts`).
 * `@UseGuards(RolesGuard)` na metodzie (nie globalny `APP_GUARD`) celowo —
 * gwarantuje wykonanie PO już globalnym `JwtAuthGuard` (kolejność Nest:
 * globalne guardy → guardy kontrolera/metody), więc `request.user` jest na
 * pewno ustawiony, zanim `RolesGuard` go odczyta.
 */
@Controller('test-only')
class TestOnlyController {
  @Get('kierownik-only')
  @UseGuards(RolesGuard)
  @Roles('Kierownik', 'Administrator')
  kierownikOnly(@CurrentUser() user: AuthenticatedUser) {
    return { userId: user.userId };
  }
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;

  let companyId: string;
  let userId: string;
  let loginOnlyUserId: string;
  const email = `e2e-auth-${Date.now()}@sklep.pl`;
  const password = 'Test-Password-123!';
  // Zadanie "Pracownicy bez e-maila" — konto BEZ e-maila, logujące się loginem.
  const login = `e2e-login-${Date.now()}`;
  const loginPassword = 'Test-Login-Password-123!';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestOnlyController],
    }).compile();

    app = moduleRef.createNestApplication();
    // Powiela istotną część main.ts (whitelist/transform/forbidNonWhitelisted) —
    // main.ts celowo nie eksportuje `bootstrap()` do ponownego użycia (fire-and-forget).
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

    const company = await prisma.company.create({ data: { name: `E2E Auth ${Date.now()}` } });
    companyId = company.id;
    const user = await prisma.user.create({
      data: {
        companyId,
        firstName: 'Test',
        lastName: 'User',
        email,
        passwordHash: await passwordService.hash(password),
        active: true,
        emailVerifiedAt: new Date(),
      },
    });
    userId = user.id;

    const loginOnlyUser = await prisma.user.create({
      data: {
        companyId,
        firstName: 'BezEmaila',
        lastName: 'Pracownik',
        email: null,
        login,
        passwordHash: await passwordService.hash(loginPassword),
        active: true,
        emailVerifiedAt: new Date(),
      },
    });
    loginOnlyUserId = loginOnlyUser.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: loginOnlyUserId } }).catch(() => undefined);
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    await app.close();
  });

  describe('POST /api/auth/login', () => {
    it('zwraca 401 AUTH-001 dla nieistniejącego e-maila', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nikt-taki@sklep.pl', password: 'cokolwiek' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH-001');
    });

    it('zwraca 401 AUTH-001 dla złego hasła (nie ujawnia, że e-mail jest poprawny)', async () => {
      const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'zle-haslo' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH-001');
    });

    /**
     * Zadanie "Pracownicy bez e-maila" — pole `email` niesie teraz ALBO
     * e-mail, ALBO login, więc string niewyglądający jak e-mail NIE jest już
     * odrzucany formatem (mógłby być czyimś loginem) — trafia w zwykłą
     * ścieżkę "nie znaleziono żadnego konta", tak samo jak nieistniejący
     * e-mail wyżej (celowo ten sam AUTH-001, przeciw enumeracji formatów
     * identyfikatora logowania).
     */
    it('zwraca 401 AUTH-001 dla stringa, który nie jest ani e-mailem, ani istniejącym loginem', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nie-jest-emailem-ani-loginem', password: 'cokolwiek' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH-001');
    });

    it('zwraca 200 z parą tokenów dla poprawnych danych', async () => {
      const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresIn: expect.any(Number),
      });
    });

    /** Zadanie "Pracownicy bez e-maila" — konto BEZ e-maila (`email: null`), loguje się `login`+hasłem, dokładnie tym samym endpointem/polem `email` co konta e-mailowe. */
    it('zwraca 200 z parą tokenów dla pracownika logującego się loginem (bez e-maila)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: login, password: loginPassword });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresIn: expect.any(Number),
      });
    });

    it('zwraca 401 AUTH-001 dla poprawnego loginu, ale złego hasła', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: login, password: 'zle-haslo' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH-001');
    });
  });

  describe('Guard JwtAuthGuard na chronionych trasach', () => {
    it('zwraca 401 AUTH-003 bez tokenu', async () => {
      const res = await request(app.getHttpServer()).get('/api/cases');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH-003');
    });

    it('zwraca 401 AUTH-003 z nieprawidłowym tokenem', async () => {
      const res = await request(app.getHttpServer()).get('/api/cases').set('Authorization', 'Bearer nie-jest-jwt');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH-003');
    });
  });

  describe('POST /api/auth/refresh i rotacja', () => {
    it('stary refresh token przestaje działać po odświeżeniu (rotacja)', async () => {
      const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password });
      const firstRefreshToken = login.body.refreshToken;

      const refreshed = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: firstRefreshToken });
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.refreshToken).not.toBe(firstRefreshToken);

      const reuseOld = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: firstRefreshToken });
      expect(reuseOld.status).toBe(401);
      expect(reuseOld.body.error.code).toBe('AUTH-003');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('unieważnia refresh token — kolejna próba /auth/refresh zwraca AUTH-003', async () => {
      const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password });
      const { refreshToken } = login.body;

      const logout = await request(app.getHttpServer()).post('/api/auth/logout').send({ refreshToken });
      expect(logout.status).toBe(204);

      const afterLogout = await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken });
      expect(afterLogout.status).toBe(401);
      expect(afterLogout.body.error.code).toBe('AUTH-003');
    });
  });

  describe('RolesGuard + @Roles() na prawdziwym cyklu HTTP', () => {
    it('zwraca RBAC-001, gdy zalogowany użytkownik nie ma żadnej z wymaganych ról', async () => {
      const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password });
      const res = await request(app.getHttpServer())
        .get('/api/test-only/kierownik-only')
        .set('Authorization', `Bearer ${login.body.accessToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('RBAC-001');
    });
  });
});
