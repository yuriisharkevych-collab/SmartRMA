import { Prisma } from '@prisma/client';
import { UserEntity } from '../entities/user.entity';

export type UserWithRoles = Prisma.UserGetPayload<{
  include: { roles: { include: { role: true } } };
}>;

export class UserMapper {
  static toEntity(user: UserWithRoles): UserEntity {
    return {
      id: user.id,
      companyId: user.companyId,
      shopId: user.shopId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      login: user.login,
      loginMethod: user.loginMethod,
      active: user.active,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      roles: user.roles.map((assignment) => assignment.role.code),
    };
  }

  static toEntityList(users: UserWithRoles[]): UserEntity[] {
    return users.map((user) => UserMapper.toEntity(user));
  }
}
