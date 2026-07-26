import { Prisma } from '@prisma/client';
import { RoleEntity } from '../entities/role.entity';

export type RoleWithPermissions = Prisma.RoleGetPayload<{
  include: { permissions: { include: { permission: true } } };
}>;

export class RoleMapper {
  static toEntity(role: RoleWithPermissions): RoleEntity {
    return {
      id: role.id,
      companyId: role.companyId,
      name: role.name,
      code: role.code,
      description: role.description,
      isSystem: role.isSystem,
      permissionCodes: role.permissions.map((rp) => rp.permission.code),
    };
  }

  static toEntityList(roles: RoleWithPermissions[]): RoleEntity[] {
    return roles.map(RoleMapper.toEntity);
  }
}
