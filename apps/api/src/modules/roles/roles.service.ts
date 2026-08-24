import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleEntity } from './entities/role.entity';
import { RoleMapper } from './mappers/role.mapper';
import { RolesRepository } from './roles.repository';

@Injectable()
export class RolesService {
  constructor(private readonly rolesRepository: RolesRepository) {}

  async findAllForCompany(companyId: string): Promise<RoleEntity[]> {
    return RoleMapper.toEntityList(await this.rolesRepository.findAllForCompany(companyId));
  }

  async findById(id: string, companyId: string): Promise<RoleEntity> {
    const role = await this.findRoleOrThrow(id, companyId);
    return RoleMapper.toEntity(role);
  }

  async create(companyId: string, dto: CreateRoleDto): Promise<RoleEntity> {
    return RoleMapper.toEntity(await this.rolesRepository.create(companyId, dto));
  }

  /** RBAC-003 — role systemowe (`isSystem`, `companyId=null`) niemodyfikowalne przez ten endpoint; edycja roli innej firmy jest niemożliwa (404, `findRoleOrThrow` już filtruje widoczność). */
  async update(id: string, companyId: string, dto: UpdateRoleDto): Promise<RoleEntity> {
    const role = await this.findRoleOrThrow(id, companyId);
    if (role.isSystem) {
      throw new AppException(
        ERROR_CODES.RBAC_003.code,
        ERROR_CODES.RBAC_003.message,
        ERROR_CODES.RBAC_003.status,
      );
    }
    return RoleMapper.toEntity(await this.rolesRepository.update(id, dto));
  }

  private async findRoleOrThrow(id: string, companyId: string) {
    const role = await this.rolesRepository.findByIdForCompany(id, companyId);
    if (!role) {
      throw new AppException(
        ERROR_CODES.RBAC_002.code,
        ERROR_CODES.RBAC_002.message,
        ERROR_CODES.RBAC_002.status,
      );
    }
    return role;
  }
}
