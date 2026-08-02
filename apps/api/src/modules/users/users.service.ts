import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { CasesRepository } from '../cases/cases.repository';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { PasswordService } from '../auth/services/password.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeactivateUserResponseEntity } from './entities/deactivate-user-response.entity';
import { LoginEventEntity } from './entities/login-event.entity';
import { UserEntity } from './entities/user.entity';
import { UserMapper } from './mappers/user.mapper';
import { UsersRepository } from './users.repository';

/**
 * Alfabet bez znaków mylących w druku/dyktowaniu przez telefon (0/O, 1/l/I) —
 * hasło tymczasowe pracownik zwykle przepisuje ręcznie.
 * `randomInt` z `node:crypto` zamiast `Math.random()`: CSPRNG, bez modulo bias.
 */
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';

function generateTemporaryPassword(length = 14): string {
  let password = '';
  for (let i = 0; i < length; i += 1) {
    password += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
  }
  return password;
}

/**
 * USER-00x (ERROR_CODES.md). `LoginEvent` (BR-089) podłączony przy module
 * Użytkownicy — patrz `AuthService`. Audyt zmian konta (BR-088) nadal poza
 * zakresem tego modułu.
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
      throw new AppException(
        ERROR_CODES.USER_001.code,
        ERROR_CODES.USER_001.message,
        ERROR_CODES.USER_001.status,
      );
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
        throw new AppException(
          ERROR_CODES.USER_001.code,
          ERROR_CODES.USER_001.message,
          ERROR_CODES.USER_001.status,
        );
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

  /**
   * Ponowna aktywacja konta. Prototyp miał w modalu jeden przełącznik „Konto
   * aktywne" działający w obie strony, a API znało wyłącznie dezaktywację —
   * bez tego wyłączonego konta nie dało się już włączyć z poziomu aplikacji.
   * Idempotentna: konto już aktywne zwraca się bez zmian.
   */
  async activate(id: string): Promise<UserEntity> {
    const existing = await this.findByIdOrThrow(id);
    if (existing.active) return UserMapper.toEntity(existing);
    return UserMapper.toEntity(await this.usersRepository.update(id, { active: true }));
  }

  /** `LoginEvent` (BR-089) — historia logowań konta, w tym próby nieudane. Gated `users.view` w kontrolerze. */
  async findLoginEvents(id: string): Promise<LoginEventEntity[]> {
    await this.findByIdOrThrow(id);
    const events = await this.usersRepository.findLoginEvents(id);
    return events.map((e) => ({
      id: e.id,
      ipAddress: e.ipAddress,
      userAgent: e.userAgent,
      success: e.success,
      createdAt: e.createdAt,
    }));
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
   * zadanie wprost zabrania. Pozostawione jak w Zadaniu 7 (hasło tymczasowe
   * zwracane wprost), wyłącznie przełączone na `PasswordService` (zakaz
   * własnych implementacji `bcrypt`).
   *
   * POPRAWKA BEZPIECZEŃSTWA: hasło generował wcześniej
   * `Math.random().toString(36)` — generator NIE kryptograficzny, o stanie
   * możliwym do odtworzenia z kilku kolejnych wywołań, dający raptem ~10
   * znaków z alfabetu [0-9a-z]. Teraz `crypto.randomBytes` (patrz
   * `generateTemporaryPassword` niżej).
   */
  async resetPassword(id: string): Promise<{ temporaryPassword: string }> {
    await this.findByIdOrThrow(id);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.passwordService.hash(temporaryPassword);
    await this.usersRepository.updatePasswordHash(id, passwordHash);
    return { temporaryPassword };
  }

  private async findByIdOrThrow(id: string) {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new AppException(
        ERROR_CODES.USER_002.code,
        ERROR_CODES.USER_002.message,
        ERROR_CODES.USER_002.status,
      );
    }
    return user;
  }
}
