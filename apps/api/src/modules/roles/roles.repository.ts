import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RoleWithPermissions } from './mappers/role.mapper';

const WITH_PERMISSIONS = { permissions: { include: { permission: true } } } as const;

@Injectable()
export class RolesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Role widoczne dla firmy = systemowe (companyId=null) + własne firmy (RBAC.md §1). */
  findAllForCompany(companyId: string): Promise<RoleWithPermissions[]> {
    return this.prisma.role.findMany({
      where: { OR: [{ companyId: null }, { companyId }] },
      include: WITH_PERMISSIONS,
    });
  }

  findById(id: string): Promise<RoleWithPermissions | null> {
    return this.prisma.role.findUnique({ where: { id }, include: WITH_PERMISSIONS });
  }

  create(companyId: string, data: { name: string; code: string; description?: string; permissionIds: string[] }): Promise<RoleWithPermissions> {
    return this.prisma.role.create({
      data: {
        companyId,
        name: data.name,
        code: data.code,
        description: data.description,
        permissions: { create: data.permissionIds.map((permissionId) => ({ permissionId })) },
      },
      include: WITH_PERMISSIONS,
    });
  }

  async update(
    id: string,
    data: Partial<{ name: string; description: string; permissionIds: string[] }>,
  ): Promise<RoleWithPermissions> {
    if (data.permissionIds) {
      await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
    }
    return this.prisma.role.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        ...(data.permissionIds
          ? { permissions: { create: data.permissionIds.map((permissionId) => ({ permissionId })) } }
          : {}),
      },
      include: WITH_PERMISSIONS,
    });
  }
}
