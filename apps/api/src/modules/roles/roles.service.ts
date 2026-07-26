import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleEntity } from './entities/role.entity';
import { RoleMapper } from './mappers/role.mapper';
import { RolesRepository } from './roles.repository';

/** TODO(RBAC-003): blokada edycji roli `isSystem=true` poza dozwolonym zakresem — nie zaimplementowana. */
@Injectable()
export class RolesService {
  constructor(private readonly rolesRepository: RolesRepository) {}

  async findAllForCompany(companyId: string): Promise<RoleEntity[]> {
    return RoleMapper.toEntityList(await this.rolesRepository.findAllForCompany(companyId));
  }

  async findById(id: string): Promise<RoleEntity> {
    const role = await this.rolesRepository.findById(id);
    if (!role) {
      throw new AppException(ERROR_CODES.RBAC_002.code, ERROR_CODES.RBAC_002.message, ERROR_CODES.RBAC_002.status);
    }
    return RoleMapper.toEntity(role);
  }

  async create(companyId: string, dto: CreateRoleDto): Promise<RoleEntity> {
    return RoleMapper.toEntity(await this.rolesRepository.create(companyId, dto));
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleEntity> {
    return RoleMapper.toEntity(await this.rolesRepository.update(id, dto));
  }
}
