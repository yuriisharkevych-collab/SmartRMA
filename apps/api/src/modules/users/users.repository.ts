import { Injectable } from '@nestjs/common';
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

  findById(id: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findUnique({ where: { id }, include: WITH_ROLES });
  }

  findByEmail(email: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findUnique({ where: { email }, include: WITH_ROLES });
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
    passwordHash: string;
    roleIds: string[];
  }): Promise<UserWithRoles> {
    return this.prisma.user.create({
      data: {
        companyId: data.companyId,
        shopId: data.shopId ?? null,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        passwordHash: data.passwordHash,
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
}
