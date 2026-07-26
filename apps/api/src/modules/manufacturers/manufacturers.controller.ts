import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { CreateManufacturerDto } from './dto/create-manufacturer.dto';
import { UpdateManufacturerDto } from './dto/update-manufacturer.dto';
import { UpdateManufacturerSlaDto } from './dto/update-manufacturer-sla.dto';
import { ManufacturerEntity } from './entities/manufacturer.entity';
import { ManufacturersService } from './manufacturers.service';

@ApiTags('Manufacturers')
@ApiBearerAuth()
@Controller('manufacturers')
export class ManufacturersController {
  constructor(private readonly manufacturersService: ManufacturersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MANUFACTURERS_VIEW)
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<ManufacturerEntity[]> {
    return this.manufacturersService.findAllForCompany(user.companyId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.MANUFACTURERS_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ManufacturerEntity> {
    return this.manufacturersService.findById(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MANUFACTURERS_MANAGE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateManufacturerDto,
  ): Promise<ManufacturerEntity> {
    return this.manufacturersService.create(user.companyId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.MANUFACTURERS_MANAGE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateManufacturerDto,
  ): Promise<ManufacturerEntity> {
    return this.manufacturersService.update(id, dto);
  }

  @Put(':id/sla')
  @RequirePermissions(PERMISSIONS.MANUFACTURERS_MANAGE)
  updateSla(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateManufacturerSlaDto,
  ): Promise<ManufacturerEntity> {
    return this.manufacturersService.updateSla(id, dto);
  }
}
