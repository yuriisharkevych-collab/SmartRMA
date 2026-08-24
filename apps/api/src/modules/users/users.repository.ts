import { Injectable } from '@nestjs/common';
import { LoginEvent, LoginMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UserWithRoles } from './mappers/user.mapper';

const WITH_ROLES = { roles: { include: { role: true } } } as const;

/**
 * Dostęp do danych `User` — bez reguł biznesowych (np. bez sprawdzania
 * USER-001 "e-mail zajęty"; to robi `UsersService` przed wywołaniem `create`).
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Bez `companyId` — WYŁĄCZNIE dla wewnętrznych odczytów po id pochodzącym z zaufanego źródła (zweryfikowany JWT), nie z parametru ścieżki sterowanego przez klienta. Zarządzanie kontem innego pracownika idzie przez `findByIdForCompany`. */
  findById(id: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findUnique({ where: { id }, include: WITH_ROLES });
  }

  /** `companyId` obowiązkowy dla WSZYSTKICH endpointów `/users/:id` — bez tego administrator jednej firmy mógłby odczytać/edytować/dezaktywować/zresetować hasło pracownika innej firmy, znając samo UUID (IDOR, patrz audyt bezpieczeństwa). */
  findByIdForCompany(id: string, companyId: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findFirst({ where: { id, companyId }, include: WITH_ROLES });
  }

  /**
   * `email` NIE jest już globalnie unikalny (patrz komentarz przy `User` w
   * `schema.prisma`) — `findFirst` może więc trafić na DOWOLNE z kilku kont
   * dzielących e-mail (np. kilku pracowników `loginMethod=Pin`). Do
   * logowania służą wyłącznie `findPasswordAccountByEmail`/
   * `findPinAccountsByEmail` poniżej; to zostaje do zgrubnych sprawdzeń typu
   * "czy JAKIEKOLWIEK konto Password ma już ten e-mail" (USER-001).
   */
  findByEmail(email: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findFirst({ where: { email }, include: WITH_ROLES });
  }

  /** Logowanie hasłem — co najwyżej jedno konto pod danym e-mailem (częściowy unikalny indeks `User_email_password_key` w migracji `pin_login`). */
  findPasswordAccountByEmail(email: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findFirst({
      where: { email, loginMethod: LoginMethod.Password },
      include: WITH_ROLES,
    });
  }

  /** Logowanie PIN-em — WSZYSTKIE aktywne konta dzielące ten (współdzielony) e-mail; `AuthService` próbuje PIN-u po kolei na każdym z nich. */
  findPinAccountsByEmail(email: string): Promise<UserWithRoles[]> {
    return this.prisma.user.findMany({
      where: { email, loginMethod: LoginMethod.Pin, active: true },
      include: WITH_ROLES,
    });
  }

  findAllByCompany(companyId: string): Promise<UserWithRoles[]> {
    return this.prisma.user.findMany({ where: { companyId }, include: WITH_ROLES });
  }

  create(data: {
    companyId: string;
    shopId?: string | null;
    firstName: string;
    lastName: string;
    email: string;
    loginMethod: LoginMethod;
    passwordHash?: string;
    pinHash?: string;
    roleIds: string[];
  }): Promise<UserWithRoles> {
    return this.prisma.user.create({
      data: {
        companyId: data.companyId,
        shopId: data.shopId ?? null,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        loginMethod: data.loginMethod,
        passwordHash: data.passwordHash,
        pinHash: data.pinHash,
        roles: { create: data.roleIds.map((roleId) => ({ roleId })) },
      },
      include: WITH_ROLES,
    });
  }

  update(
    id: string,
    data: Partial<{
      firstName: string;
      lastName: string;
      email: string;
      shopId: string | null;
      active: boolean;
    }>,
  ): Promise<UserWithRoles> {
    return this.prisma.user.update({ where: { id }, data, include: WITH_ROLES });
  }

  updatePasswordHash(id: string, passwordHash: string): Promise<UserWithRoles> {
    return this.prisma.user.update({ where: { id }, data: { passwordHash }, include: WITH_ROLES });
  }

  updatePinHash(id: string, pinHash: string): Promise<UserWithRoles> {
    return this.prisma.user.update({ where: { id }, data: { pinHash }, include: WITH_ROLES });
  }

  async replaceRoles(id: string, roleIds: string[]): Promise<UserWithRoles> {
    await this.prisma.userRoleAssignment.deleteMany({ where: { userId: id } });
    return this.prisma.user.update({
      where: { id },
      data: { roles: { create: roleIds.map((roleId) => ({ roleId })) } },
      include: WITH_ROLES,
    });
  }

  touchLastLogin(id: string): Promise<UserWithRoles> {
    return this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
      include: WITH_ROLES,
    });
  }

  /**
   * `LoginEvent` (DATABASE.md §9, BR-089) — dziennik prób logowania. Model
   * istniał w schemacie od początku, ale nic do niego nie pisało
   * (`AuthService` miał to jako TODO); domknięte przy module Użytkownicy,
   * bo prototypowy modal „Historia" wprost pokazuje historię logowań.
   *
   * Zapisujemy też próby NIEUDANE (`success=false`) — bez nich dziennik nie
   * daje się użyć do tego, po co się go trzyma (wykrycie prób dobrania się
   * do konta).
   */
  recordLoginEvent(data: {
    userId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    success: boolean;
  }): Promise<LoginEvent> {
    return this.prisma.loginEvent.create({ data });
  }

  findLoginEvents(userId: string, take = 20): Promise<LoginEvent[]> {
    return this.prisma.loginEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /** Blokada konta (Ustawienia › Bezpieczeństwo) — liczba NIEUDANYCH prób w oknie czasowym `since..now`. Okno przesuwne: najstarsze niepowodzenie "wypada" z licznika samo, bez osobnego zadania czyszczącego. */
  countRecentFailedLoginEvents(userId: string, since: Date): Promise<number> {
    return this.prisma.loginEvent.count({
      where: { userId, success: false, createdAt: { gte: since } },
    });
  }

  /**
   * `users.delete` (RBAC.md §5) — czy trwałe usunięcie konta jest bezpieczne.
   * Suma odwołań do TEGO konta ze wszystkich tabel, gdzie mogłoby zostawić
   * ślad realnej pracy (właściciel/decydent sprawy, autor dokumentu/wpisu
   * historii/notatki/wiadomości, aktor wpisu audytu) — `>0` oznacza, że
   * usunięcie zniszczyłoby dane historyczne cudzych spraw, więc blokujemy
   * (USER-004) i kierujemy do dezaktywacji zamiast usunięcia. Świadomie
   * JEDNA zbiorcza liczba (nie rozbicie per tabela) — wołający potrzebuje
   * wyłącznie "czy da się bezpiecznie usunąć", nie szczegółowej listy.
   */
  async countActivityFootprint(userId: string): Promise<number> {
    const [ownedCases, decidedCases, documents, historyEntries, notes, messages, auditLogs] =
      await Promise.all([
        this.prisma.case.count({ where: { ownerId: userId } }),
        this.prisma.case.count({ where: { decisionByUserId: userId } }),
        this.prisma.document.count({ where: { uploadedById: userId } }),
        this.prisma.caseHistory.count({ where: { userId } }),
        this.prisma.note.count({ where: { userId } }),
        this.prisma.message.count({ where: { senderUserId: userId } }),
        this.prisma.auditLog.count({ where: { userId } }),
      ]);
    return ownedCases + decidedCases + documents + historyEntries + notes + messages + auditLogs;
  }

  /** `users.delete` (RBAC.md §5, jedyny hard-delete tego modułu) — kasuje dane czysto kontowe (role, profil kadrowy, historia logowań; brak znaczenia biznesowego poza samym kontem), `client` = `tx` z `UsersService.hardDelete`. */
  deleteRelationsForHardDelete(
    userId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<unknown> {
    return Promise.all([
      client.userRoleAssignment.deleteMany({ where: { userId } }),
      client.employee.deleteMany({ where: { userId } }),
      client.loginEvent.deleteMany({ where: { userId } }),
    ]);
  }

  /** Kasuje sam wiersz `User` — wołający musi wcześniej, w TEJ SAMEJ transakcji, wyczyścić relacje kontowe (`deleteRelationsForHardDelete`) i potwierdzić `countActivityFootprint(userId) === 0`. */
  hardDelete(
    id: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<unknown> {
    return client.user.delete({ where: { id } });
  }
}
