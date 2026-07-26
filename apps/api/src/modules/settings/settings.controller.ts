import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import { SettingEntity } from './entities/setting.entity';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SETTINGS_VIEW)
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<SettingEntity[]> {
    return this.settingsService.findAllForCompany(user.companyId);
  }

  @Put()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  upsert(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertSettingDto): Promise<SettingEntity> {
    return this.settingsService.upsert(user.companyId, dto);
  }
}
