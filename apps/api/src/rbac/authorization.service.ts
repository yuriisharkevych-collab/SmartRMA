import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Wylicza efektywne uprawnienia użytkownika = unia uprawnień wszystkich
 * przypisanych ról (RBAC.md §1.1) — jedno miejsce, z którego korzysta
 * `AuthService` przy logowaniu (do budowy JWT) i dowolny serwis, który
 * potrzebuje sprawdzić uprawnienie poza kontekstem HTTP (np. zadanie
 * cykliczne wywołane bez requestu).
 *
 * Bez reguł biznesowych — to czysta funkcja odczytu grafu
 * User -> UserRoleAssignment -> Role -> RolePermission -> Permission.
 */
@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectivePermissions(userId: string): Promise<string[]> {
    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

    const permissionCodes = new Set<string>();
    for (const assignment of assignments) {
      for (const rolePermission of assignment.role.permissions) {
        permissionCodes.add(rolePermission.permission.code);
      }
    }

    return Array.from(permissionCodes);
  }

  async getRoleCodes(userId: string): Promise<string[]> {
    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: { userId },
      include: { role: true },
    });
    return assignments.map((a) => a.role.code);
  }
}
