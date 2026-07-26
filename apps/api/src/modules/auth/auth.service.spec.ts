import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../../common/exceptions/app.exception';
import { AuthorizationService } from '../../rbac/authorization.service';
import { UsersRepository } from '../users/users.repository';
import { UserWithRoles } from '../users/mappers/user.mapper';
import { AuthService } from './auth.service';
import { PasswordService } from './services/password.service';
import { RefreshTokenStoreService } from './services/refresh-token-store.service';

function buildUser(overrides: Partial<UserWithRoles> = {}): UserWithRoles {
  return {
    id: 'user-1',
    companyId: 'company-1',
    shopId: null,
    firstName: 'Jan',
    lastName: 'Kowalski',
    email: 'jan.kowalski@sklep.pl',
    passwordHash: 'hashed-password',
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
  let usersRepository: jest.Mocked<Pick<UsersRepository, 'findByEmail' | 'findById' | 'touchLastLogin'>>;
  let authorizationService: jest.Mocked<Pick<AuthorizationService, 'getEffectivePermissions'>>;
  let passwordService: jest.Mocked<PasswordService>;
  let refreshTokenStore: jest.Mocked<RefreshTokenStoreService>;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync'>>;
  let config: ConfigService;
  let service: AuthService;

  beforeEach(() => {
    usersRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      touchLastLogin: jest.fn().mockResolvedValue(undefined),
    };
    authorizationService = { getEffectivePermissions: jest.fn().mockResolvedValue(['cases.view']) };
    passwordService = { hash: jest.fn(), compare: jest.fn() } as unknown as jest.Mocked<PasswordService>;
    refreshTokenStore = { store: jest.fn(), isValid: jest.fn(), revoke: jest.fn() } as unknown as jest.Mocked<RefreshTokenStoreService>;
    jwtService = { signAsync: jest.fn().mockImplementation((_payload, opts) => Promise.resolve(`signed-with-${opts.secret}`)) };
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
      jwtService as unknown as JwtService,
      config,
    );
  });

  describe('validateCredentials (AUTH-001/AUTH-002)', () => {
    it('rzuca AUTH-001, gdy użytkownik o podanym e-mailu nie istnieje', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      await expect(service.validateCredentials('brak@sklep.pl', 'haslo')).rejects.toMatchObject({ code: 'AUTH-001' });
    });

    it('rzuca AUTH-002, gdy konto jest nieaktywne — NIE porównuje hasła w ogóle', async () => {
      usersRepository.findByEmail.mockResolvedValue(buildUser({ active: false }));
      await expect(service.validateCredentials('jan.kowalski@sklep.pl', 'haslo')).rejects.toMatchObject({
        code: 'AUTH-002',
      });
      expect(passwordService.compare).not.toHaveBeenCalled();
    });

    it('rzuca AUTH-001, gdy hasło się nie zgadza', async () => {
      usersRepository.findByEmail.mockResolvedValue(buildUser());
      passwordService.compare.mockResolvedValue(false);
      await expect(service.validateCredentials('jan.kowalski@sklep.pl', 'zle-haslo')).rejects.toMatchObject({
        code: 'AUTH-001',
      });
    });

    it('zwraca użytkownika, gdy e-mail/hasło poprawne i konto aktywne', async () => {
      const user = buildUser();
      usersRepository.findByEmail.mockResolvedValue(user);
      passwordService.compare.mockResolvedValue(true);
      await expect(service.validateCredentials('jan.kowalski@sklep.pl', 'dobre-haslo')).resolves.toBe(user);
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
      const accessCall = jwtService.signAsync.mock.calls.find((call) => (call[0] as { type: string }).type === 'access')!;
      const refreshCall = jwtService.signAsync.mock.calls.find((call) => (call[0] as { type: string }).type === 'refresh')!;

      expect(accessCall[0]).toMatchObject({ sub: 'user-1', email: 'jan.kowalski@sklep.pl', roles: ['Pracownik'] });
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
