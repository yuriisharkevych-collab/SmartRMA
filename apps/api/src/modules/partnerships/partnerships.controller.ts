import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { InvitePartnershipDto } from './dto/invite-partnership.dto';
import { PartnershipEntity } from './entities/partnership.entity';
import { PartnershipsService } from './partnerships.service';

@ApiTags('Partnerships')
@ApiBearerAuth()
@Controller('partnerships')
export class PartnershipsController {
  constructor(private readonly partnershipsService: PartnershipsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PARTNERSHIPS_VIEW)
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<PartnershipEntity[]> {
    return this.partnershipsService.findAllForCompany(user.companyId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PARTNERSHIPS_VIEW)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PartnershipEntity> {
    return this.partnershipsService.findById(id, user.companyId);
  }

  @Post('invite')
  @RequirePermissions(PERMISSIONS.PARTNERSHIPS_MANAGE)
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InvitePartnershipDto,
  ): Promise<PartnershipEntity> {
    return this.partnershipsService.invite(user.companyId, user.userId, dto);
  }

  @Post(':id/accept')
  @RequirePermissions(PERMISSIONS.PARTNERSHIPS_MANAGE)
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PartnershipEntity> {
    return this.partnershipsService.accept(id, user.companyId, user.userId);
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.PARTNERSHIPS_MANAGE)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PartnershipEntity> {
    return this.partnershipsService.reject(id, user.companyId, user.userId);
  }

  @Post(':id/deactivate')
  @RequirePermissions(PERMISSIONS.PARTNERSHIPS_MANAGE)
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PartnershipEntity> {
    return this.partnershipsService.deactivate(id, user.companyId, user.userId);
  }
}
