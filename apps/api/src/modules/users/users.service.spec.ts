import { CasesRepository } from '../cases/cases.repository';
import { PasswordService } from '../auth/services/password.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserWithRoles } from './mappers/user.mapper';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

function buildUser(overrides: Partial<UserWithRoles> = {}): UserWithRoles {
  return {
    id: 'user-1',
    companyId: 'company-1',
    shopId: null,
    firstName: 'Jan',
    lastName: 'Kowalski',
    email: 'jan.kowalski@sklep.pl',
    passwordHash: 'hashed',
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
    Pick<UsersRepository, 'findById' | 'findByEmail' | 'findAllByCompany' | 'create' | 'update' | 'updatePasswordHash' | 'replaceRoles'>
  >;
  let passwordService: jest.Mocked<PasswordService>;
  let casesRepository: jest.Mocked<Pick<CasesRepository, 'countActiveByOwner'>>;
  let service: UsersService;

  beforeEach(() => {
    usersRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findAllByCompany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updatePasswordHash: jest.fn(),
      replaceRoles: jest.fn(),
    };
    passwordService = { hash: jest.fn().mockResolvedValue('hashed-value'), compare: jest.fn() } as unknown as jest.Mocked<PasswordService>;
    casesRepository = { countActiveByOwner: jest.fn().mockResolvedValue(0) };

    service = new UsersService(
      usersRepository as unknown as UsersRepository,
      passwordService,
      casesRepository as unknown as CasesRepository,
    );
  });

  describe('findById', () => {
    it('rzuca USER-002, gdy użytkownik nie istnieje', async () => {
      usersRepository.findById.mockResolvedValue(null);
      await expect(service.findById('brak')).rejects.toMatchObject({ code: 'USER-002' });
    });

    it('zwraca UserEntity BEZ passwordHash, gdy istnieje', async () => {
      usersRepository.findById.mockResolvedValue(buildUser());
      const result = await service.findById('user-1');
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

    it('rzuca USER-001, gdy e-mail jest już zajęty — NIE hashuje hasła w ogóle', async () => {
      usersRepository.findByEmail.mockResolvedValue(buildUser());
      await expect(service.create('company-1', dto)).rejects.toMatchObject({ code: 'USER-001' });
      expect(passwordService.hash).not.toHaveBeenCalled();
    });

    it('hashuje hasło przez PasswordService — NIGDY nie przekazuje hasła jawnego do repozytorium', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      usersRepository.create.mockResolvedValue(buildUser());

      await service.create('company-1', dto);

      expect(passwordService.hash).toHaveBeenCalledWith('Bardzo-Tajne-123');
      const createArg = usersRepository.create.mock.calls[0][0];
      expect(createArg.passwordHash).toBe('hashed-value');
      expect(createArg).not.toHaveProperty('password');
      expect(createArg.companyId).toBe('company-1');
    });
  });

  describe('update', () => {
    it('rzuca USER-002, gdy użytkownik docelowy nie istnieje', async () => {
      usersRepository.findById.mockResolvedValue(null);
      await expect(service.update('brak', { firstName: 'X' })).rejects.toMatchObject({ code: 'USER-002' });
    });

    it('rzuca USER-001, gdy nowy e-mail należy do INNEGO użytkownika', async () => {
      usersRepository.findById.mockResolvedValue(buildUser({ id: 'user-1' }));
      usersRepository.findByEmail.mockResolvedValue(buildUser({ id: 'user-2', email: 'zajety@sklep.pl' }));

      await expect(service.update('user-1', { email: 'zajety@sklep.pl' })).rejects.toMatchObject({ code: 'USER-001' });
    });

    it('POZWALA zapisać e-mail, jeśli "kolizja" to ten sam użytkownik (edycja bez zmiany e-maila)', async () => {
      usersRepository.findById.mockResolvedValue(buildUser({ id: 'user-1' }));
      usersRepository.findByEmail.mockResolvedValue(buildUser({ id: 'user-1' }));
      usersRepository.update.mockResolvedValue(buildUser({ id: 'user-1' }));

      await expect(service.update('user-1', { email: 'jan.kowalski@sklep.pl' })).resolves.toBeDefined();
    });

    it('nie sprawdza unikalności e-maila, gdy e-mail nie jest w ogóle zmieniany', async () => {
      usersRepository.findById.mockResolvedValue(buildUser());
      usersRepository.update.mockResolvedValue(buildUser());

      await service.update('user-1', { firstName: 'Inne Imię' });
      expect(usersRepository.findByEmail).not.toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('rzuca USER-002, gdy użytkownik nie istnieje', async () => {
      usersRepository.findById.mockResolvedValue(null);
      await expect(service.deactivate('brak')).rejects.toMatchObject({ code: 'USER-002' });
    });

    it('dezaktywuje BEZ ostrzeżenia, gdy brak aktywnych spraw', async () => {
      usersRepository.findById.mockResolvedValue(buildUser());
      casesRepository.countActiveByOwner.mockResolvedValue(0);
      usersRepository.update.mockResolvedValue(buildUser({ active: false }));

      const result = await service.deactivate('user-1');
      expect(usersRepository.update).toHaveBeenCalledWith('user-1', { active: false });
      expect(result.warnings).toEqual([]);
    });

    it('dezaktywuje Z ostrzeżeniem USER-003, gdy użytkownik jest właścicielem otwartych spraw — dezaktywacja i tak się udaje', async () => {
      usersRepository.findById.mockResolvedValue(buildUser());
      casesRepository.countActiveByOwner.mockResolvedValue(3);
      usersRepository.update.mockResolvedValue(buildUser({ active: false }));

      const result = await service.deactivate('user-1');
      expect(result.warnings).toEqual(['USER-003']);
      expect(result.user.active).toBe(false);
    });
  });

  describe('assignRoles', () => {
    it('rzuca USER-002, gdy użytkownik nie istnieje', async () => {
      usersRepository.findById.mockResolvedValue(null);
      await expect(service.assignRoles('brak', ['role-1'])).rejects.toMatchObject({ code: 'USER-002' });
    });

    it('zastępuje role przez replaceRoles()', async () => {
      usersRepository.findById.mockResolvedValue(buildUser());
      usersRepository.replaceRoles.mockResolvedValue(buildUser());
      await service.assignRoles('user-1', ['role-2']);
      expect(usersRepository.replaceRoles).toHaveBeenCalledWith('user-1', ['role-2']);
    });
  });

  describe('resetPassword', () => {
    it('rzuca USER-002, gdy użytkownik nie istnieje', async () => {
      usersRepository.findById.mockResolvedValue(null);
      await expect(service.resetPassword('brak')).rejects.toMatchObject({ code: 'USER-002' });
    });

    it('hashuje wygenerowane hasło przez PasswordService przed zapisem', async () => {
      usersRepository.findById.mockResolvedValue(buildUser());
      await service.resetPassword('user-1');
      expect(passwordService.hash).toHaveBeenCalled();
      expect(usersRepository.updatePasswordHash).toHaveBeenCalledWith('user-1', 'hashed-value');
    });
  });
});
