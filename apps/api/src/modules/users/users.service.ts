import { Injectable } from '@nestjs/common';
import { LoginMethod, Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SYSTEM_ROLE_CODES } from '../../rbac/constants/roles.const';
import { AuditRepository } from '../audit/audit.repository';
import { CaseStatusesService } from '../case-statuses/case-statuses.service';
import { CasesRepository } from '../cases/cases.repository';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { RolesRepository } from '../roles/roles.repository';
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

/** Analogiczne do `generateTemporaryPassword`, dla resetu PIN-u (`resetPin`) — same cyfry, długość z `CompanySettings.pinLength`. */
function generateTemporaryPin(length: number): string {
  let pin = '';
  for (let i = 0; i < length; i += 1) {
    pin += randomInt(10).toString();
  }
  return pin;
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
    private readonly caseStatusesService: CaseStatusesService,
    private readonly companySettingsService: CompanySettingsService,
    private readonly prisma: PrismaService,
    private readonly auditRepository: AuditRepository,
    private readonly rolesRepository: RolesRepository,
  ) {}

  async findAllForCompany(companyId: string): Promise<UserEntity[]> {
    const users = await this.usersRepository.findAllByCompany(companyId);
    return UserMapper.toEntityList(users);
  }

  async findById(id: string, companyId: string): Promise<UserEntity> {
    const user = await this.findByIdOrThrow(id, companyId);
    return UserMapper.toEntity(user);
  }

  /**
   * USER-001 — e-mail unikalny GLOBALNIE, ale WYŁĄCZNIE wśród kont
   * `loginMethod=Password` (DATABASE.md §7; BR-086 — per-`companyId`
   * dopiero przy realnym multi-tenant). Konta `loginMethod=Pin` mogą
   * świadomie dzielić e-mail — patrz komentarz przy `User.loginMethod` w
   * schema.prisma — więc dla nich kolizja e-maila NIE jest sprawdzana,
   * zamiast tego egzekwowane jest USER-006 (rola-gating) i USER-007/008
   * (polityka PIN, `CompanySettingsService.assertPinMeetsPolicy`).
   */
  async create(companyId: string, dto: CreateUserDto): Promise<UserEntity> {
    const loginMethod = dto.loginMethod ?? LoginMethod.Password;
    await this.assertRoleLoginMethodCompatible(dto.roleIds, loginMethod);

    let passwordHash: string | undefined;
    let pinHash: string | undefined;

    if (loginMethod === LoginMethod.Password) {
      const existing = await this.usersRepository.findPasswordAccountByEmail(dto.email);
      if (existing) {
        throw new AppException(
          ERROR_CODES.USER_001.code,
          ERROR_CODES.USER_001.message,
          ERROR_CODES.USER_001.status,
        );
      }
      // DTO gwarantuje `password` obecne, gdy loginMethod!=Pin (@ValidateIf).
      await this.companySettingsService.assertPasswordMeetsPolicy(companyId, dto.password!);
      passwordHash = await this.passwordService.hash(dto.password!);
    } else {
      // DTO gwarantuje `pin` obecne, gdy loginMethod=Pin (@ValidateIf).
      await this.companySettingsService.assertPinMeetsPolicy(companyId, dto.pin!);
      pinHash = await this.passwordService.hash(dto.pin!);
    }

    const user = await this.usersRepository.create({
      companyId,
      shopId: dto.shopId ?? null,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      loginMethod,
      passwordHash,
      pinHash,
      roleIds: dto.roleIds,
    });
    return UserMapper.toEntity(user);
  }

  /** USER-002 (nie istnieje) + USER-001 (nowy e-mail już zajęty przez KOGOŚ INNEGO — `update` nie zmienia hasła/PIN-u/ról, patrz UpdateUserDto). Kolizja sprawdzana tylko dla kont Password — Pin dzieli e-mail świadomie. */
  async update(id: string, companyId: string, dto: UpdateUserDto): Promise<UserEntity> {
    const existingRecord = await this.findByIdOrThrow(id, companyId);

    if (dto.email && existingRecord.loginMethod === LoginMethod.Password) {
      const existing = await this.usersRepository.findPasswordAccountByEmail(dto.email);
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

  /** USER-006 — konto `loginMethod=Pin` nie może mieć roli Administrator/Kierownik (w żadną stronę: ani nadanie takiej roli kontu Pin, ani przełączenie na Pin konta z taką rolą). Wołane z `create` i `assignRoles`. */
  private async assertRoleLoginMethodCompatible(
    roleIds: string[],
    loginMethod: LoginMethod,
  ): Promise<void> {
    if (loginMethod !== LoginMethod.Pin) return;
    const codes = await this.rolesRepository.findCodesByIds(roleIds);
    const hasRestrictedRole = codes.some(
      (code) => code === SYSTEM_ROLE_CODES.ADMINISTRATOR || code === SYSTEM_ROLE_CODES.KIEROWNIK,
    );
    if (hasRestrictedRole) {
      throw new AppException(
        ERROR_CODES.USER_006.code,
        ERROR_CODES.USER_006.message,
        ERROR_CODES.USER_006.status,
      );
    }
  }

  /**
   * USER-002 + USER-003 — dezaktywacja jest ZAWSZE dozwolona (nie blokujemy
   * na otwartych sprawach), ale ostrzegamy w `warnings`, dokładnie jak
   * ERROR_CODES.md opisuje ten kod ("dezaktywacja jest dozwolona, ale
   * interfejs powinien pokazać ostrzeżenie i zasugerować przeniesienie
   * spraw — cases.assign"). Samo przeniesienie NIE jest tu wykonywane —
   * to działanie z modułu Cases, poza zakresem Zadania 2.
   */
  async deactivate(id: string, companyId: string): Promise<DeactivateUserResponseEntity> {
    await this.findByIdOrThrow(id, companyId);

    // Status Workflow Refactor — "aktywna sprawa" nie jest już 3 hardcodowanymi
    // nazwami statusów, tylko zbiorem kodów `isFinal=false` z katalogu firmy.
    const finalStatusCodes = (await this.caseStatusesService.findAllForCompany(companyId))
      .filter((s) => s.isFinal)
      .map((s) => s.code);
    const activeCaseCount = await this.casesRepository.countActiveByOwner(id, finalStatusCodes);
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
  async activate(id: string, companyId: string): Promise<UserEntity> {
    const existing = await this.findByIdOrThrow(id, companyId);
    if (existing.active) return UserMapper.toEntity(existing);
    return UserMapper.toEntity(await this.usersRepository.update(id, { active: true }));
  }

  /**
   * `users.delete` (RBAC.md §5) — TRWAŁE usunięcie, na wyraźne żądanie
   * właściciela produktu (czyszczenie kont testowych z panelu admina).
   * USER-005 blokuje samo-usunięcie (administrator nie może usunąć konta,
   * którym jest aktualnie zalogowany). USER-004 blokuje, gdy konto ma choć
   * jeden ślad realnej pracy w systemie (`countActivityFootprint`) — bez tej
   * blokady usunięcie osierociłoby historię cudzych spraw; jedyna bezpieczna
   * droga wtedy to dezaktywacja. Audyt PRZED skasowaniem, w tej samej
   * transakcji co kasowanie relacji czysto kontowych (role, profil kadrowy,
   * historia logowań) i samego wiersza `User`.
   */
  async hardDelete(id: string, companyId: string, actorUserId: string): Promise<void> {
    if (id === actorUserId) {
      throw new AppException(
        ERROR_CODES.USER_005.code,
        ERROR_CODES.USER_005.message,
        ERROR_CODES.USER_005.status,
      );
    }

    const user = await this.findByIdOrThrow(id, companyId);

    const footprint = await this.usersRepository.countActivityFootprint(id);
    if (footprint > 0) {
      throw new AppException(
        ERROR_CODES.USER_004.code,
        ERROR_CODES.USER_004.message,
        ERROR_CODES.USER_004.status,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.usersRepository.deleteRelationsForHardDelete(id, tx);
      await this.auditRepository.create(
        {
          companyId,
          userId: actorUserId,
          action: 'USER_DELETED',
          entityType: 'User',
          entityId: id,
          previousValue: { email: user.email } as Prisma.InputJsonValue,
        },
        tx,
      );
      await this.usersRepository.hardDelete(id, tx);
    });
  }

  /** `LoginEvent` (BR-089) — historia logowań konta, w tym próby nieudane. Gated `users.view` w kontrolerze. */
  async findLoginEvents(id: string, companyId: string): Promise<LoginEventEntity[]> {
    await this.findByIdOrThrow(id, companyId);
    const events = await this.usersRepository.findLoginEvents(id);
    return events.map((e) => ({
      id: e.id,
      ipAddress: e.ipAddress,
      userAgent: e.userAgent,
      success: e.success,
      createdAt: e.createdAt,
    }));
  }

  /** RBAC-004 (min. 1 rola) egzekwowane już przez `AssignRolesDto` (`@ArrayNotEmpty()`) — pusta tablica nigdy nie dociera tutaj. USER-006 — jak w `create`, ale liczone względem loginMethod ISTNIEJĄCEGO konta (rola się zmienia, sposób logowania nie — patrz `update`). */
  async assignRoles(id: string, companyId: string, roleIds: string[]): Promise<UserEntity> {
    const existingRecord = await this.findByIdOrThrow(id, companyId);
    await this.assertRoleLoginMethodCompatible(roleIds, existingRecord.loginMethod);
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
  async resetPassword(id: string, companyId: string): Promise<{ temporaryPassword: string }> {
    const user = await this.findByIdOrThrow(id, companyId);
    if (user.loginMethod !== LoginMethod.Password) {
      throw new AppException(
        ERROR_CODES.USER_009.code,
        'To konto loguje się PIN-em — użyj resetu PIN-u.',
        ERROR_CODES.USER_009.status,
      );
    }
    const policy = await this.companySettingsService.getSettings(user.companyId);
    const temporaryPassword = generateTemporaryPassword(Math.max(14, policy.passwordMinLength));
    const passwordHash = await this.passwordService.hash(temporaryPassword);
    await this.usersRepository.updatePasswordHash(id, passwordHash);
    return { temporaryPassword };
  }

  /** Odpowiednik `resetPassword` dla kont `loginMethod=Pin` — nowy PIN generowany losowo (CSPRNG), zwracany wprost administratorowi (ten sam kompromis co hasło tymczasowe, patrz komentarz przy `resetPassword`). */
  async resetPin(id: string, companyId: string): Promise<{ temporaryPin: string }> {
    const user = await this.findByIdOrThrow(id, companyId);
    if (user.loginMethod !== LoginMethod.Pin) {
      throw new AppException(
        ERROR_CODES.USER_009.code,
        ERROR_CODES.USER_009.message,
        ERROR_CODES.USER_009.status,
      );
    }
    const settings = await this.companySettingsService.getSettings(user.companyId);
    const temporaryPin = generateTemporaryPin(settings.pinLength);
    const pinHash = await this.passwordService.hash(temporaryPin);
    await this.usersRepository.updatePinHash(id, pinHash);
    return { temporaryPin };
  }

  private async findByIdOrThrow(id: string, companyId: string) {
    const user = await this.usersRepository.findByIdForCompany(id, companyId);
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
