import { PrismaService } from '../../prisma/prisma.service';
import { AuditRepository } from '../audit/audit.repository';
import { CaseStatusesService } from '../case-statuses/case-statuses.service';
import { CasesRepository } from '../cases/cases.repository';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { RolesRepository } from '../roles/roles.repository';
import { PasswordService } from '../auth/services/password.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserWithRoles } from './mappers/user.mapper';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

const TX_MARKER = { __tx: true } as const;

function buildUser(overrides: Partial<UserWithRoles> = {}): UserWithRoles {
  return {
    id: 'user-1',
    companyId: 'company-1',
    shopId: null,
    firstName: 'Jan',
    lastName: 'Kowalski',
    email: 'jan.kowalski@sklep.pl',
    loginMethod: 'Password',
    passwordHash: 'hashed',
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

describe('UsersService', () => {
  let usersRepository: jest.Mocked<
    Pick<
      UsersRepository,
      | 'findByIdForCompany'
      | 'findPasswordAccountByEmail'
      | 'findAllByCompany'
      | 'create'
      | 'update'
      | 'updatePasswordHash'
      | 'updatePinHash'
      | 'replaceRoles'
      | 'countActivityFootprint'
      | 'deleteRelationsForHardDelete'
      | 'hardDelete'
    >
  >;
  let passwordService: jest.Mocked<PasswordService>;
  let casesRepository: jest.Mocked<Pick<CasesRepository, 'countActiveByOwner'>>;
  let caseStatusesService: jest.Mocked<Pick<CaseStatusesService, 'findAllForCompany'>>;
  let companySettingsService: jest.Mocked<
    Pick<
      CompanySettingsService,
      'assertPasswordMeetsPolicy' | 'assertPinMeetsPolicy' | 'getSettings'
    >
  >;
  let rolesRepository: jest.Mocked<Pick<RolesRepository, 'findCodesByIds'>>;
  let prisma: { $transaction: jest.Mock };
  let auditRepository: jest.Mocked<Pick<AuditRepository, 'create'>>;
  let service: UsersService;

  beforeEach(() => {
    usersRepository = {
      findByIdForCompany: jest.fn(),
      findPasswordAccountByEmail: jest.fn(),
      findAllByCompany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updatePasswordHash: jest.fn(),
      updatePinHash: jest.fn(),
      replaceRoles: jest.fn(),
      countActivityFootprint: jest.fn(),
      deleteRelationsForHardDelete: jest.fn(),
      hardDelete: jest.fn(),
    };
    passwordService = {
      hash: jest.fn().mockResolvedValue('hashed-value'),
      compare: jest.fn(),
    } as unknown as jest.Mocked<PasswordService>;
    casesRepository = { countActiveByOwner: jest.fn().mockResolvedValue(0) };
    // Status Workflow Refactor — "status końcowy" nie jest już hardcodowanym zbiorem 3 nazw
    // enuma, tylko `isFinal:true` na katalogu statusów firmy; `deactivate()` wylicza tę listę
    // przed policzeniem aktywnych spraw właściciela (patrz `UsersService.deactivate`).
    caseStatusesService = {
      findAllForCompany: jest.fn().mockResolvedValue([
        { code: 'Nowa', isFinal: false },
        { code: 'Zakonczona', isFinal: true },
      ]),
    };
    companySettingsService = {
      assertPasswordMeetsPolicy: jest.fn().mockResolvedValue(undefined),
      assertPinMeetsPolicy: jest.fn().mockResolvedValue(undefined),
      getSettings: jest.fn().mockResolvedValue({ passwordMinLength: 8, pinLength: 6 }),
    };
    rolesRepository = { findCodesByIds: jest.fn().mockResolvedValue(['Pracownik']) };
    prisma = { $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(TX_MARKER)) };
    auditRepository = { create: jest.fn() };

    service = new UsersService(
      usersRepository as unknown as UsersRepository,
      passwordService,
      casesRepository as unknown as CasesRepository,
      caseStatusesService as unknown as CaseStatusesService,
      companySettingsService as unknown as CompanySettingsService,
      prisma as unknown as PrismaService,
      auditRepository as unknown as AuditRepository,
      rolesRepository as unknown as RolesRepository,
    );
  });

  describe('findById', () => {
    it('rzuca USER-002, gdy użytkownik nie istnieje', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(null);
      await expect(service.findById('brak', 'company-1')).rejects.toMatchObject({
        code: 'USER-002',
      });
    });

    it('zwraca UserEntity BEZ passwordHash, gdy istnieje', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(buildUser());
      const result = await service.findById('user-1', 'company-1');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.roles).toEqual(['Pracownik']);
    });
  });

  describe('create', () => {
    const dto: CreateUserDto = {
      firstName: 'Jan',
      lastName: 'Kowalski',
      email: 'jan.kowalski@sklep.pl',
      password: 'Bardzo-Tajne-123',
      roleIds: ['role-1'],
    };

    it('rzuca USER-001, gdy e-mail jest już zajęty przez INNE konto Password — NIE hashuje hasła w ogóle', async () => {
      usersRepository.findPasswordAccountByEmail.mockResolvedValue(buildUser());
      await expect(service.create('company-1', dto)).rejects.toMatchObject({ code: 'USER-001' });
      expect(passwordService.hash).not.toHaveBeenCalled();
    });

    it('hashuje hasło przez PasswordService — NIGDY nie przekazuje hasła jawnego do repozytorium', async () => {
      usersRepository.findPasswordAccountByEmail.mockResolvedValue(null);
      usersRepository.create.mockResolvedValue(buildUser());

      await service.create('company-1', dto);

      expect(passwordService.hash).toHaveBeenCalledWith('Bardzo-Tajne-123');
      const createArg = usersRepository.create.mock.calls[0][0];
      expect(createArg.passwordHash).toBe('hashed-value');
      expect(createArg).not.toHaveProperty('password');
      expect(createArg.companyId).toBe('company-1');
      expect(createArg.loginMethod).toBe('Password');
    });

    describe('loginMethod=Pin', () => {
      const pinDto: CreateUserDto = {
        firstName: 'Ala',
        lastName: 'Nowak',
        email: 'biuro@sklep.pl',
        loginMethod: 'Pin' as never,
        pin: '123456',
        roleIds: ['role-pracownik'],
      };

      it('NIE sprawdza kolizji e-maila (Pin dzieli e-mail świadomie) i hashuje PIN zamiast hasła', async () => {
        usersRepository.create.mockResolvedValue(buildUser({ loginMethod: 'Pin' as never }));

        await service.create('company-1', pinDto);

        expect(usersRepository.findPasswordAccountByEmail).not.toHaveBeenCalled();
        expect(companySettingsService.assertPinMeetsPolicy).toHaveBeenCalledWith(
          'company-1',
          '123456',
        );
        const createArg = usersRepository.create.mock.calls[0][0];
        expect(createArg.pinHash).toBe('hashed-value');
        expect(createArg).not.toHaveProperty('password');
        expect(createArg.loginMethod).toBe('Pin');
      });

      it('USER-006 — blokuje utworzenie konta Pin z rolą Administrator', async () => {
        rolesRepository.findCodesByIds.mockResolvedValue(['Administrator']);
        await expect(service.create('company-1', pinDto)).rejects.toMatchObject({
          code: 'USER-006',
        });
        expect(usersRepository.create).not.toHaveBeenCalled();
      });

      it('USER-006 — blokuje utworzenie konta Pin z rolą Kierownik', async () => {
        rolesRepository.findCodesByIds.mockResolvedValue(['Kierownik']);
        await expect(service.create('company-1', pinDto)).rejects.toMatchObject({
          code: 'USER-006',
        });
      });
    });
  });

  describe('update', () => {
    it('rzuca USER-002, gdy użytkownik docelowy nie istnieje', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(null);
      await expect(service.update('brak', 'company-1', { firstName: 'X' })).rejects.toMatchObject({
        code: 'USER-002',
      });
    });

    it('rzuca USER-001, gdy nowy e-mail należy do INNEGO użytkownika Password', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(buildUser({ id: 'user-1' }));
      usersRepository.findPasswordAccountByEmail.mockResolvedValue(
        buildUser({ id: 'user-2', email: 'zajety@sklep.pl' }),
      );

      await expect(
        service.update('user-1', 'company-1', { email: 'zajety@sklep.pl' }),
      ).rejects.toMatchObject({ code: 'USER-001' });
    });

    it('POZWALA zapisać e-mail, jeśli "kolizja" to ten sam użytkownik (edycja bez zmiany e-maila)', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(buildUser({ id: 'user-1' }));
      usersRepository.findPasswordAccountByEmail.mockResolvedValue(buildUser({ id: 'user-1' }));
      usersRepository.update.mockResolvedValue(buildUser({ id: 'user-1' }));

      await expect(
        service.update('user-1', 'company-1', { email: 'jan.kowalski@sklep.pl' }),
      ).resolves.toBeDefined();
    });

    it('nie sprawdza unikalności e-maila, gdy e-mail nie jest w ogóle zmieniany', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(buildUser());
      usersRepository.update.mockResolvedValue(buildUser());

      await service.update('user-1', 'company-1', { firstName: 'Inne Imię' });
      expect(usersRepository.findPasswordAccountByEmail).not.toHaveBeenCalled();
    });

    it('konto Pin — NIE sprawdza kolizji e-maila nawet przy zmianie e-maila (dzielenie jest świadome)', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(
        buildUser({ id: 'user-1', loginMethod: 'Pin' as never }),
      );
      usersRepository.update.mockResolvedValue(
        buildUser({ id: 'user-1', loginMethod: 'Pin' as never }),
      );

      await service.update('user-1', 'company-1', { email: 'biuro@sklep.pl' });
      expect(usersRepository.findPasswordAccountByEmail).not.toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('rzuca USER-002, gdy użytkownik nie istnieje', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(null);
      await expect(service.deactivate('brak', 'company-1')).rejects.toMatchObject({
        code: 'USER-002',
      });
    });

    it('dezaktywuje BEZ ostrzeżenia, gdy brak aktywnych spraw', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(buildUser());
      casesRepository.countActiveByOwner.mockResolvedValue(0);
      usersRepository.update.mockResolvedValue(buildUser({ active: false }));

      const result = await service.deactivate('user-1', 'company-1');
      expect(usersRepository.update).toHaveBeenCalledWith('user-1', { active: false });
      expect(casesRepository.countActiveByOwner).toHaveBeenCalledWith('user-1', ['Zakonczona']);
      expect(result.warnings).toEqual([]);
    });

    it('dezaktywuje Z ostrzeżeniem USER-003, gdy użytkownik jest właścicielem otwartych spraw — dezaktywacja i tak się udaje', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(buildUser());
      casesRepository.countActiveByOwner.mockResolvedValue(3);
      usersRepository.update.mockResolvedValue(buildUser({ active: false }));

      const result = await service.deactivate('user-1', 'company-1');
      expect(result.warnings).toEqual(['USER-003']);
      expect(result.user.active).toBe(false);
    });
  });

  describe('assignRoles', () => {
    it('rzuca USER-002, gdy użytkownik nie istnieje', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(null);
      await expect(service.assignRoles('brak', 'company-1', ['role-1'])).rejects.toMatchObject({
        code: 'USER-002',
      });
    });

    it('zastępuje role przez replaceRoles()', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(buildUser());
      usersRepository.replaceRoles.mockResolvedValue(buildUser());
      await service.assignRoles('user-1', 'company-1', ['role-2']);
      expect(usersRepository.replaceRoles).toHaveBeenCalledWith('user-1', ['role-2']);
    });

    it('USER-006 — blokuje nadanie roli Administrator kontu logującemu się PIN-em', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(
        buildUser({ loginMethod: 'Pin' as never }),
      );
      rolesRepository.findCodesByIds.mockResolvedValue(['Administrator']);

      await expect(
        service.assignRoles('user-1', 'company-1', ['role-admin']),
      ).rejects.toMatchObject({ code: 'USER-006' });
      expect(usersRepository.replaceRoles).not.toHaveBeenCalled();
    });

    it('konto Password może dostać rolę Administrator bez ograniczeń (rola-gating dotyczy tylko Pin)', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(
        buildUser({ loginMethod: 'Password' as never }),
      );
      usersRepository.replaceRoles.mockResolvedValue(buildUser());
      rolesRepository.findCodesByIds.mockResolvedValue(['Administrator']);

      await expect(
        service.assignRoles('user-1', 'company-1', ['role-admin']),
      ).resolves.toBeDefined();
    });
  });

  describe('resetPassword', () => {
    it('rzuca USER-002, gdy użytkownik nie istnieje', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(null);
      await expect(service.resetPassword('brak', 'company-1')).rejects.toMatchObject({
        code: 'USER-002',
      });
    });

    it('hashuje wygenerowane hasło przez PasswordService przed zapisem', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(buildUser());
      await service.resetPassword('user-1', 'company-1');
      expect(passwordService.hash).toHaveBeenCalled();
      expect(usersRepository.updatePasswordHash).toHaveBeenCalledWith('user-1', 'hashed-value');
    });

    it('USER-009 — odmawia resetu hasła kontu logującemu się PIN-em', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(
        buildUser({ loginMethod: 'Pin' as never }),
      );
      await expect(service.resetPassword('user-1', 'company-1')).rejects.toMatchObject({
        code: 'USER-009',
      });
      expect(usersRepository.updatePasswordHash).not.toHaveBeenCalled();
    });
  });

  describe('resetPin', () => {
    it('rzuca USER-002, gdy użytkownik nie istnieje', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(null);
      await expect(service.resetPin('brak', 'company-1')).rejects.toMatchObject({
        code: 'USER-002',
      });
    });

    it('USER-009 — odmawia resetu PIN-u kontu logującemu się hasłem', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(
        buildUser({ loginMethod: 'Password' as never }),
      );
      await expect(service.resetPin('user-1', 'company-1')).rejects.toMatchObject({
        code: 'USER-009',
      });
      expect(usersRepository.updatePinHash).not.toHaveBeenCalled();
    });

    it('hashuje wygenerowany PIN przez PasswordService przed zapisem', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(
        buildUser({ loginMethod: 'Pin' as never }),
      );
      const { temporaryPin } = await service.resetPin('user-1', 'company-1');
      expect(temporaryPin).toHaveLength(6);
      expect(passwordService.hash).toHaveBeenCalledWith(temporaryPin);
      expect(usersRepository.updatePinHash).toHaveBeenCalledWith('user-1', 'hashed-value');
    });
  });

  describe('hardDelete', () => {
    it('rzuca USER-005, gdy administrator próbuje usunąć własne konto — bez odpytywania repozytorium', async () => {
      await expect(service.hardDelete('user-1', 'company-1', 'user-1')).rejects.toMatchObject({
        code: 'USER-005',
      });
      expect(usersRepository.findByIdForCompany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rzuca USER-002, gdy konto docelowe nie istnieje dla tej firmy (IDOR-safe)', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(null);
      await expect(service.hardDelete('user-2', 'company-1', 'user-1')).rejects.toMatchObject({
        code: 'USER-002',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('USER-004 — blokuje usunięcie, gdy konto ma ślad realnej pracy w systemie', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(buildUser({ id: 'user-2' }));
      usersRepository.countActivityFootprint.mockResolvedValue(1);

      await expect(service.hardDelete('user-2', 'company-1', 'user-1')).rejects.toMatchObject({
        code: 'USER-004',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('bez śladu aktywności — kasuje relacje kontowe, zapisuje AuditLog, kasuje User, wszystko w jednej transakcji', async () => {
      usersRepository.findByIdForCompany.mockResolvedValue(buildUser({ id: 'user-2' }));
      usersRepository.countActivityFootprint.mockResolvedValue(0);

      await service.hardDelete('user-2', 'company-1', 'user-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(usersRepository.deleteRelationsForHardDelete).toHaveBeenCalledWith(
        'user-2',
        TX_MARKER,
      );
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-1',
          userId: 'user-1',
          action: 'USER_DELETED',
          entityType: 'User',
          entityId: 'user-2',
        }),
        TX_MARKER,
      );
      expect(usersRepository.hardDelete).toHaveBeenCalledWith('user-2', TX_MARKER);
    });
  });
});
