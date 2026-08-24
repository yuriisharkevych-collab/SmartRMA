import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../../common/exceptions/app.exception';
import { AuthorizationService } from '../../rbac/authorization.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { UsersRepository } from '../users/users.repository';
import { UserWithRoles } from '../users/mappers/user.mapper';
import { AuthService } from './auth.service';
import { PasswordService } from './services/password.service';
import { PinLoginAttemptStoreService } from './services/pin-login-attempt-store.service';
import { RefreshTokenStoreService } from './services/refresh-token-store.service';

function buildUser(overrides: Partial<UserWithRoles> = {}): UserWithRoles {
  return {
    id: 'user-1',
    companyId: 'company-1',
    shopId: null,
    firstName: 'Jan',
    lastName: 'Kowalski',
    email: 'jan.kowalski@sklep.pl',
    loginMethod: 'Password',
    passwordHash: 'hashed-password',
    pinHash: null,
    active: true,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01'),
    roles: [
      {
        userId: 'user-1',
        roleId: 'role-1',
        assignedAt: new Date('2026-01-01'),
        role: {
          id: 'role-1',
          companyId: null,
          name: 'Pracownik Działu Reklamacji',
          code: 'Pracownik',
          description: null,
          isSystem: true,
          createdAt: new Date('2026-01-01'),
        },
      },
    ],
    ...overrides,
  } as UserWithRoles;
}

describe('AuthService', () => {
  let usersRepository: jest.Mocked<
    Pick<
      UsersRepository,
      | 'findPasswordAccountByEmail'
      | 'findPinAccountsByEmail'
      | 'findById'
      | 'touchLastLogin'
      | 'countRecentFailedLoginEvents'
      | 'recordLoginEvent'
    >
  >;
  let authorizationService: jest.Mocked<Pick<AuthorizationService, 'getEffectivePermissions'>>;
  let passwordService: jest.Mocked<PasswordService>;
  let refreshTokenStore: jest.Mocked<RefreshTokenStoreService>;
  let pinLoginAttemptStore: jest.Mocked<PinLoginAttemptStoreService>;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync'>>;
  let config: ConfigService;
  let companySettingsService: jest.Mocked<Pick<CompanySettingsService, 'getSettings'>>;
  let service: AuthService;

  beforeEach(() => {
    usersRepository = {
      findPasswordAccountByEmail: jest.fn(),
      findPinAccountsByEmail: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      touchLastLogin: jest.fn().mockResolvedValue(undefined),
      countRecentFailedLoginEvents: jest.fn().mockResolvedValue(0),
      recordLoginEvent: jest.fn().mockResolvedValue(undefined),
    };
    authorizationService = { getEffectivePermissions: jest.fn().mockResolvedValue(['cases.view']) };
    companySettingsService = {
      getSettings: jest.fn().mockResolvedValue({
        maxLoginAttempts: 5,
        lockoutDurationMinutes: 15,
        sessionTimeoutMinutes: 10080, // 7 dni w minutach — zgodne z dotychczasowym 'jwt.refreshExpiresIn'='7d' w testach niżej
        maxPinAttempts: 3,
        pinLockoutDurationMinutes: 30,
      }),
    };
    passwordService = {
      hash: jest.fn(),
      compare: jest.fn(),
    } as unknown as jest.Mocked<PasswordService>;
    refreshTokenStore = {
      store: jest.fn(),
      isValid: jest.fn(),
      revoke: jest.fn(),
    } as unknown as jest.Mocked<RefreshTokenStoreService>;
    pinLoginAttemptStore = {
      getFailedCount: jest.fn().mockResolvedValue(0),
      recordFailedAttempt: jest.fn().mockResolvedValue(undefined),
      resetFailedCount: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PinLoginAttemptStoreService>;
    jwtService = {
      signAsync: jest
        .fn()
        .mockImplementation((_payload, opts) => Promise.resolve(`signed-with-${opts.secret}`)),
    };
    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'jwt.accessSecret': 'access-secret',
          'jwt.accessExpiresIn': '15m',
          'jwt.refreshSecret': 'refresh-secret',
          'jwt.refreshExpiresIn': '7d',
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    service = new AuthService(
      usersRepository as unknown as UsersRepository,
      authorizationService as unknown as AuthorizationService,
      passwordService,
      refreshTokenStore,
      pinLoginAttemptStore,
      jwtService as unknown as JwtService,
      config,
      companySettingsService as unknown as CompanySettingsService,
    );
  });

  describe('validateCredentials — logowanie hasłem (AUTH-001/AUTH-002)', () => {
    it('rzuca AUTH-001, gdy e-mail nie odpowiada ŻADNEMU kontu (Password ani Pin)', async () => {
      usersRepository.findPasswordAccountByEmail.mockResolvedValue(null);
      usersRepository.findPinAccountsByEmail.mockResolvedValue([]);
      await expect(service.validateCredentials('brak@sklep.pl', 'haslo')).rejects.toMatchObject({
        code: 'AUTH-001',
      });
    });

    it('rzuca AUTH-002, gdy konto jest nieaktywne — NIE porównuje hasła w ogóle', async () => {
      usersRepository.findPasswordAccountByEmail.mockResolvedValue(buildUser({ active: false }));
      await expect(
        service.validateCredentials('jan.kowalski@sklep.pl', 'haslo'),
      ).rejects.toMatchObject({
        code: 'AUTH-002',
      });
      expect(passwordService.compare).not.toHaveBeenCalled();
    });

    it('rzuca AUTH-001, gdy hasło się nie zgadza', async () => {
      usersRepository.findPasswordAccountByEmail.mockResolvedValue(buildUser());
      passwordService.compare.mockResolvedValue(false);
      await expect(
        service.validateCredentials('jan.kowalski@sklep.pl', 'zle-haslo'),
      ).rejects.toMatchObject({
        code: 'AUTH-001',
      });
    });

    it('zwraca użytkownika, gdy e-mail/hasło poprawne i konto aktywne', async () => {
      const user = buildUser();
      usersRepository.findPasswordAccountByEmail.mockResolvedValue(user);
      passwordService.compare.mockResolvedValue(true);
      await expect(
        service.validateCredentials('jan.kowalski@sklep.pl', 'dobre-haslo'),
      ).resolves.toBe(user);
    });
  });

  describe('validateCredentials — blokada konta (AUTH-005)', () => {
    it('rzuca AUTH-005, gdy liczba niedawnych nieudanych prób osiągnęła próg z Ustawień — NIE porównuje hasła', async () => {
      usersRepository.findPasswordAccountByEmail.mockResolvedValue(buildUser());
      usersRepository.countRecentFailedLoginEvents.mockResolvedValue(5);
      await expect(
        service.validateCredentials('jan.kowalski@sklep.pl', 'dobre-haslo'),
      ).rejects.toMatchObject({
        code: 'AUTH-005',
      });
      expect(passwordService.compare).not.toHaveBeenCalled();
    });

    it('pozwala się zalogować, gdy liczba niedawnych niepowodzeń jest poniżej progu', async () => {
      const user = buildUser();
      usersRepository.findPasswordAccountByEmail.mockResolvedValue(user);
      usersRepository.countRecentFailedLoginEvents.mockResolvedValue(4);
      passwordService.compare.mockResolvedValue(true);
      await expect(
        service.validateCredentials('jan.kowalski@sklep.pl', 'dobre-haslo'),
      ).resolves.toBe(user);
    });

    it('próg blokady jest konfigurowalny per firma (maxLoginAttempts z CompanySettings)', async () => {
      usersRepository.findPasswordAccountByEmail.mockResolvedValue(buildUser());
      companySettingsService.getSettings.mockResolvedValue({
        maxLoginAttempts: 2,
        lockoutDurationMinutes: 15,
        sessionTimeoutMinutes: 10080,
      } as never);
      usersRepository.countRecentFailedLoginEvents.mockResolvedValue(2);
      await expect(
        service.validateCredentials('jan.kowalski@sklep.pl', 'dobre-haslo'),
      ).rejects.toMatchObject({
        code: 'AUTH-005',
      });
    });
  });

  describe('validateCredentials — logowanie PIN-em (wspólny e-mail, wielu kandydatów)', () => {
    function buildPinUser(overrides: Partial<UserWithRoles> = {}): UserWithRoles {
      return buildUser({
        loginMethod: 'Pin',
        passwordHash: null,
        pinHash: 'hashed-pin',
        ...overrides,
      });
    }

    it('konto Password pod tym e-mailem ma PIERWSZEŃSTWO — kandydaci Pin nawet nie są pobierani', async () => {
      const passwordUser = buildUser();
      usersRepository.findPasswordAccountByEmail.mockResolvedValue(passwordUser);
      passwordService.compare.mockResolvedValue(true);
      await service.validateCredentials('biuro@sklep.pl', 'haslo-admina');
      expect(usersRepository.findPinAccountsByEmail).not.toHaveBeenCalled();
    });

    it('trafia właściwego kandydata spośród kilku kont dzielących e-mail', async () => {
      usersRepository.findPasswordAccountByEmail.mockResolvedValue(null);
      const alice = buildPinUser({ id: 'user-alice', pinHash: 'hash-alice' });
      const bob = buildPinUser({ id: 'user-bob', pinHash: 'hash-bob' });
      usersRepository.findPinAccountsByEmail.mockResolvedValue([alice, bob]);
      passwordService.compare.mockImplementation((pin, hash) =>
        Promise.resolve(hash === 'hash-bob' && pin === '654321'),
      );

      const result = await service.validateCredentials('biuro@sklep.pl', '654321');
      expect(result.id).toBe('user-bob');
      expect(pinLoginAttemptStore.resetFailedCount).toHaveBeenCalledWith('biuro@sklep.pl');
    });

    it('rzuca AUTH-001 (bez ujawniania istnienia konta) i zapisuje nieudaną próbę per e-mail, gdy żaden PIN nie pasuje', async () => {
      usersRepository.findPasswordAccountByEmail.mockResolvedValue(null);
      usersRepository.findPinAccountsByEmail.mockResolvedValue([buildPinUser()]);
      passwordService.compare.mockResolvedValue(false);

      await expect(service.validateCredentials('biuro@sklep.pl', '000000')).rejects.toMatchObject({
        code: 'AUTH-001',
      });
      expect(pinLoginAttemptStore.recordFailedAttempt).toHaveBeenCalledWith(
        'biuro@sklep.pl',
        30 * 60,
      );
      expect(usersRepository.recordLoginEvent).not.toHaveBeenCalled();
    });

    it('rzuca AUTH-006, gdy licznik Redis dla e-maila osiągnął próg — NIE próbuje żadnego porównania PIN-u', async () => {
      usersRepository.findPasswordAccountByEmail.mockResolvedValue(null);
      usersRepository.findPinAccountsByEmail.mockResolvedValue([buildPinUser()]);
      pinLoginAttemptStore.getFailedCount.mockResolvedValue(3);

      await expect(service.validateCredentials('biuro@sklep.pl', '123456')).rejects.toMatchObject({
        code: 'AUTH-006',
      });
      expect(passwordService.compare).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('wydaje access+refresh token podpisane osobnymi sekretami i zapisuje jti w Redis', async () => {
      const tokens = await service.login(buildUser());

      expect(usersRepository.touchLastLogin).toHaveBeenCalledWith('user-1');
      expect(tokens.accessToken).toBe('signed-with-access-secret');
      expect(tokens.refreshToken).toBe('signed-with-refresh-secret');
      expect(tokens.expiresIn).toBe(900); // 15m

      expect(refreshTokenStore.store).toHaveBeenCalledTimes(1);
      const [userId, jti, ttl] = refreshTokenStore.store.mock.calls[0];
      expect(userId).toBe('user-1');
      expect(typeof jti).toBe('string');
      expect(jti.length).toBeGreaterThan(0);
      expect(ttl).toBe(604800); // 7d
    });

    it('payload access tokenu niesie role/uprawnienia, ale refresh token TYLKO sub+jti+type (BR-077-podobna minimalizacja)', async () => {
      await service.login(buildUser());
      const accessCall = jwtService.signAsync.mock.calls.find(
        (call) => (call[0] as { type: string }).type === 'access',
      )!;
      const refreshCall = jwtService.signAsync.mock.calls.find(
        (call) => (call[0] as { type: string }).type === 'refresh',
      )!;

      expect(accessCall[0]).toMatchObject({
        sub: 'user-1',
        email: 'jan.kowalski@sklep.pl',
        roles: ['Pracownik'],
      });
      expect(Object.keys(refreshCall[0] as object).sort()).toEqual(['jti', 'sub', 'type']);
    });

    it('dwa kolejne logowania wydają RÓŻNE jti (nowa sesja nadpisuje starą w Redis)', async () => {
      await service.login(buildUser());
      await service.login(buildUser());
      const [, jtiFirst] = refreshTokenStore.store.mock.calls[0];
      const [, jtiSecond] = refreshTokenStore.store.mock.calls[1];
      expect(jtiFirst).not.toBe(jtiSecond);
    });
  });

  describe('refresh', () => {
    it('rzuca AUTH-003, gdy użytkownik z tokenu już nie istnieje', async () => {
      usersRepository.findById.mockResolvedValue(null);
      await expect(service.refresh('user-1')).rejects.toMatchObject({ code: 'AUTH-003' });
    });

    it('rzuca AUTH-003, gdy konto zostało dezaktywowane od czasu wydania tokenu', async () => {
      usersRepository.findById.mockResolvedValue(buildUser({ active: false }));
      await expect(service.refresh('user-1')).rejects.toMatchObject({ code: 'AUTH-003' });
    });

    it('zwraca NOWĄ parę tokenów, gdy użytkownik istnieje i jest aktywny', async () => {
      usersRepository.findById.mockResolvedValue(buildUser());
      const tokens = await service.refresh('user-1');
      expect(tokens.accessToken).toBe('signed-with-access-secret');
      expect(refreshTokenStore.store).toHaveBeenCalledTimes(1); // rotacja = nowy zapis, nadpisuje stary klucz
    });
  });

  describe('logout', () => {
    it('woła revoke() z Redis allowlist dla danego użytkownika', async () => {
      await service.logout('user-1');
      expect(refreshTokenStore.revoke).toHaveBeenCalledWith('user-1');
    });
  });
});
