import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { CreateManufacturerDto } from './dto/create-manufacturer.dto';
import { UpdateManufacturerDto } from './dto/update-manufacturer.dto';
import { UpdateManufacturerAutomationDto } from './dto/update-manufacturer-automation.dto';
import { UpdateManufacturerLogisticsDto } from './dto/update-manufacturer-logistics.dto';
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
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ManufacturerEntity> {
    return this.manufacturersService.findById(id, user.companyId);
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
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ManufacturerEntity> {
    return this.manufacturersService.update(id, user.companyId, dto);
  }

  @Put(':id/sla')
  @RequirePermissions(PERMISSIONS.MANUFACTURERS_MANAGE)
  updateSla(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateManufacturerSlaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ManufacturerEntity> {
    return this.manufacturersService.updateSla(id, user.companyId, dto);
  }

  /** `ManufacturerLogistics` — osobny endpoint (nie zagnieżdżony w `PATCH /:id`), bo to osobna tabela 1:1 tworzona leniwie, dokładnie jak `/sla` wyżej. */
  @Put(':id/logistics')
  @RequirePermissions(PERMISSIONS.MANUFACTURERS_MANAGE)
  updateLogistics(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateManufacturerLogisticsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ManufacturerEntity> {
    return this.manufacturersService.updateLogistics(id, user.companyId, dto);
  }

  @Put(':id/automation')
  @RequirePermissions(PERMISSIONS.MANUFACTURERS_MANAGE)
  updateAutomation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateManufacturerAutomationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ManufacturerEntity> {
    return this.manufacturersService.updateAutomation(id, user.companyId, dto);
  }

  /** RBAC.md §5 — TRWAŁE usunięcie, wyłącznie Administrator. Zablokowane (MANUFACTURER-003), gdy producent ma przypisane produkty/marki — do usuwania producentów testowych. */
  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.MANUFACTURERS_DELETE)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.manufacturersService.hardDelete(id, user.companyId, user.userId);
  }
}
