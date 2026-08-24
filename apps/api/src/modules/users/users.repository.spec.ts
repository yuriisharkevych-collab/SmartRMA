import { PrismaService } from '../../prisma/prisma.service';
import { UsersRepository } from './users.repository';

const WITH_ROLES = { roles: { include: { role: true } } };

describe('UsersRepository', () => {
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    userRoleAssignment: { deleteMany: jest.Mock };
  };
  let repository: UsersRepository;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      userRoleAssignment: { deleteMany: jest.fn() },
    };
    repository = new UsersRepository(prisma as unknown as PrismaService);
  });

  it('findById() odpytuje po id, dołączając role', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await repository.findById('user-1');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      include: WITH_ROLES,
    });
  });

  /** `email` NIE jest już globalnie unikalny (`User.loginMethod=Pin` może go dzielić) — `findFirst`, nie `findUnique`. */
  it('findByEmail() odpytuje po e-mailu przez findFirst, dołączając role', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await repository.findByEmail('jan@sklep.pl');
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: 'jan@sklep.pl' },
      include: WITH_ROLES,
    });
  });

  it('findPasswordAccountByEmail() filtruje po loginMethod=Password', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await repository.findPasswordAccountByEmail('jan@sklep.pl');
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: 'jan@sklep.pl', loginMethod: 'Password' },
      include: WITH_ROLES,
    });
  });

  it('findPinAccountsByEmail() zwraca WSZYSTKIE aktywne konta Pin dzielące e-mail', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await repository.findPinAccountsByEmail('biuro@sklep.pl');
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { email: 'biuro@sklep.pl', loginMethod: 'Pin', active: true },
      include: WITH_ROLES,
    });
  });

  it('findAllByCompany() filtruje po companyId', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await repository.findAllByCompany('company-1');
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
      include: WITH_ROLES,
    });
  });

  it('create() zapisuje passwordHash (NIGDY hasło jawne) i tworzy UserRoleAssignment dla każdej roli', async () => {
    prisma.user.create.mockResolvedValue({});
    await repository.create({
      companyId: 'company-1',
      firstName: 'Jan',
      lastName: 'Kowalski',
      email: 'jan@sklep.pl',
      loginMethod: 'Password' as never,
      passwordHash: 'hashed-value',
      roleIds: ['role-a', 'role-b'],
    });

    const call = prisma.user.create.mock.calls[0][0];
    expect(call.data.passwordHash).toBe('hashed-value');
    expect(call.data).not.toHaveProperty('password');
    expect(call.data.shopId).toBeNull();
    expect(call.data.roles.create).toEqual([{ roleId: 'role-a' }, { roleId: 'role-b' }]);
  });

  it('create() konta Pin zapisuje pinHash zamiast passwordHash', async () => {
    prisma.user.create.mockResolvedValue({});
    await repository.create({
      companyId: 'company-1',
      firstName: 'Ala',
      lastName: 'Nowak',
      email: 'biuro@sklep.pl',
      loginMethod: 'Pin' as never,
      pinHash: 'hashed-pin',
      roleIds: ['role-a'],
    });

    const call = prisma.user.create.mock.calls[0][0];
    expect(call.data.pinHash).toBe('hashed-pin');
    expect(call.data.loginMethod).toBe('Pin');
  });

  it('update() przekazuje dane wprost do prisma.user.update, dołączając role w odpowiedzi', async () => {
    prisma.user.update.mockResolvedValue({});
    await repository.update('user-1', { firstName: 'Nowe Imię' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { firstName: 'Nowe Imię' },
      include: WITH_ROLES,
    });
  });

  it('updatePasswordHash() aktualizuje WYŁĄCZNIE pole passwordHash', async () => {
    prisma.user.update.mockResolvedValue({});
    await repository.updatePasswordHash('user-1', 'nowy-hash');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: 'nowy-hash' },
      include: WITH_ROLES,
    });
  });

  it('updatePinHash() aktualizuje WYŁĄCZNIE pole pinHash', async () => {
    prisma.user.update.mockResolvedValue({});
    await repository.updatePinHash('user-1', 'nowy-pin-hash');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { pinHash: 'nowy-pin-hash' },
      include: WITH_ROLES,
    });
  });

  it('replaceRoles() najpierw usuwa WSZYSTKIE dotychczasowe przypisania, potem tworzy nowe', async () => {
    prisma.user.update.mockResolvedValue({});
    await repository.replaceRoles('user-1', ['role-x']);

    expect(prisma.userRoleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { roles: { create: [{ roleId: 'role-x' }] } },
      include: WITH_ROLES,
    });
  });
});
