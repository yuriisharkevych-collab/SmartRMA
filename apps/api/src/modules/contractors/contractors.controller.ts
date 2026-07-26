import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { ContractorsService } from './contractors.service';
import { CreateContractorDto } from './dto/create-contractor.dto';
import { UpdateContractorDto } from './dto/update-contractor.dto';
import { ContractorEntity } from './entities/contractor.entity';

@ApiTags('Contractors')
@ApiBearerAuth()
@Controller('contractors')
export class ContractorsController {
  constructor(private readonly contractorsService: ContractorsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CONTRACTORS_VIEW)
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<ContractorEntity[]> {
    return this.contractorsService.findAllForCompany(user.companyId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CONTRACTORS_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ContractorEntity> {
    return this.contractorsService.findById(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONTRACTORS_MANAGE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateContractorDto): Promise<ContractorEntity> {
    return this.contractorsService.create(user.companyId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CONTRACTORS_MANAGE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateContractorDto): Promise<ContractorEntity> {
    return this.contractorsService.update(id, dto);
  }
}
