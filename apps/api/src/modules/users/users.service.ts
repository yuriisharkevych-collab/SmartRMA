import { Injectable } from '@nestjs/common';
import { CasesRepository } from '../cases/cases.repository';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { PasswordService } from '../auth/services/password.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeactivateUserResponseEntity } from './entities/deactivate-user-response.entity';
import { UserEntity } from './entities/user.entity';
import { UserMapper } from './mappers/user.mapper';
import { UsersRepository } from './users.repository';

/**
 * USER-00x (ERROR_CODES.md). `LoginEvent`/audyt zmian konta (BR-088/089) —
 * TODO: nie podłączony, poza zakresem Zadania 2 (implementuje wyłącznie
 * CRUD Users, nie moduł audytu — analogicznie do adnotacji w AuthService).
 *
 * `PasswordService` wstrzyknięty zwyczajnie (bez `@Inject(forwardRef())`) —
 * moduły mają cykl importów (`users.module.ts` ↔ `auth.module.ts`,
 * rozwiązany tam przez `forwardRef` NA POZIOMIE MODUŁU), ale graf
 * providerów NIE jest cykliczny: `AuthService` zależy od `UsersRepository`,
 * `UsersService` od `PasswordService` — dwa niezależne łańcuchy, żaden nie
 * wraca do punktu startu. `forwardRef` na poziomie modułu wystarcza.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordService: PasswordService,
    private readonly casesRepository: CasesRepository,
  ) {}

  async findAllForCompany(companyId: string): Promise<UserEntity[]> {
    const users = await this.usersRepository.findAllByCompany(companyId);
    return UserMapper.toEntityList(users);
  }

  async findById(id: string): Promise<UserEntity> {
    const user = await this.findByIdOrThrow(id);
    return UserMapper.toEntity(user);
  }

  /** USER-001 — e-mail unikalny globalnie (DATABASE.md §7; BR-086 — per-`companyId` dopiero przy realnym multi-tenant). */
  async create(companyId: string, dto: CreateUserDto): Promise<UserEntity> {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) {
      throw new AppException(ERROR_CODES.USER_001.code, ERROR_CODES.USER_001.message, ERROR_CODES.USER_001.status);
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const user = await this.usersRepository.create({
      companyId,
      shopId: dto.shopId ?? null,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash,
      roleIds: dto.roleIds,
    });
    return UserMapper.toEntity(user);
  }

  /** USER-002 (nie istnieje) + USER-001 (nowy e-mail już zajęty przez KOGOŚ INNEGO — `update` nie zmienia hasła/ról, patrz UpdateUserDto). */
  async update(id: string, dto: UpdateUserDto): Promise<UserEntity> {
    await this.findByIdOrThrow(id);

    if (dto.email) {
      const existing = await this.usersRepository.findByEmail(dto.email);
      if (existing && existing.id !== id) {
        throw new AppException(ERROR_CODES.USER_001.code, ERROR_CODES.USER_001.message, ERROR_CODES.USER_001.status);
      }
    }

    const user = await this.usersRepository.update(id, dto);
    return UserMapper.toEntity(user);
  }

  /**
   * USER-002 + USER-003 — dezaktywacja jest ZAWSZE dozwolona (nie blokujemy
   * na otwartych sprawach), ale ostrzegamy w `warnings`, dokładnie jak
   * ERROR_CODES.md opisuje ten kod ("dezaktywacja jest dozwolona, ale
   * interfejs powinien pokazać ostrzeżenie i zasugerować przeniesienie
   * spraw — cases.assign"). Samo przeniesienie NIE jest tu wykonywane —
   * to działanie z modułu Cases, poza zakresem Zadania 2.
   */
  async deactivate(id: string): Promise<DeactivateUserResponseEntity> {
    await this.findByIdOrThrow(id);

    const activeCaseCount = await this.casesRepository.countActiveByOwner(id);
    const user = await this.usersRepository.update(id, { active: false });

    return {
      user: UserMapper.toEntity(user),
      warnings: activeCaseCount > 0 ? [ERROR_CODES.USER_003.code] : [],
    };
  }

  /** RBAC-004 (min. 1 rola) egzekwowane już przez `AssignRolesDto` (`@ArrayNotEmpty()`) — pusta tablica nigdy nie dociera tutaj. */
  async assignRoles(id: string, roleIds: string[]): Promise<UserEntity> {
    await this.findByIdOrThrow(id);
    const user = await this.usersRepository.replaceRoles(id, roleIds);
    return UserMapper.toEntity(user);
  }

  /**
   * TODO — poza zakresem Zadania 2 (nie było w liście CRUD punktu 2).
   * Mechanizm dostarczenia (hasło tymczasowe zwrócone wprost vs. link
   * resetujący e-mailem) jest JAWNIE nierozstrzygnięty w `NOTIFICATIONS.md`
   * §9 ("do potwierdzenia z zespołem bezpieczeństwa przed implementacją") —
   * zaimplementowanie tu wymagałoby podjęcia tej decyzji samodzielnie, czego
   * zadanie wprost zabrania. Pozostawione jak w Zadaniu 7 (placeholder
   * zwracający hasło tymczasowe wprost), wyłącznie przełączone na
   * `PasswordService` (zakaz własnych implementacji `bcrypt`).
   */
  async resetPassword(id: string): Promise<{ temporaryPassword: string }> {
    await this.findByIdOrThrow(id);
    const temporaryPassword = Math.random().toString(36).slice(-10);
    const passwordHash = await this.passwordService.hash(temporaryPassword);
    await this.usersRepository.updatePasswordHash(id, passwordHash);
    return { temporaryPassword };
  }

  private async findByIdOrThrow(id: string) {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new AppException(ERROR_CODES.USER_002.code, ERROR_CODES.USER_002.message, ERROR_CODES.USER_002.status);
    }
    return user;
  }
}
