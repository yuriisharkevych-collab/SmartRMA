import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { CaseStatusesService } from './case-statuses.service';
import { CreateCaseStatusDto } from './dto/create-case-status.dto';
import { ReorderCaseStatusesDto } from './dto/reorder-case-statuses.dto';
import { UpdateCaseStatusDto } from './dto/update-case-status.dto';
import { CaseStatusEntity } from './entities/case-status.entity';

/** Brak `@Delete` — statusy nigdy nie są fizycznie usuwane (wzorzec `Manufacturer` i innych encji katalogowych), wyłącznie `active:false` przez `PATCH /:id`. */
@ApiTags('CaseStatuses')
@ApiBearerAuth()
@Controller('case-statuses')
export class CaseStatusesController {
  constructor(private readonly caseStatusesService: CaseStatusesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CASE_STATUSES_VIEW)
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<CaseStatusEntity[]> {
    return this.caseStatusesService.findAllForCompany(user.companyId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CASE_STATUSES_VIEW)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CaseStatusEntity> {
    return this.caseStatusesService.findById(id, user.companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CASE_STATUSES_MANAGE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCaseStatusDto,
  ): Promise<CaseStatusEntity> {
    return this.caseStatusesService.create(user.companyId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CASE_STATUSES_MANAGE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCaseStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CaseStatusEntity> {
    return this.caseStatusesService.update(id, user.companyId, dto);
  }

  @Post('reorder')
  @RequirePermissions(PERMISSIONS.CASE_STATUSES_MANAGE)
  reorder(
    @Body() dto: ReorderCaseStatusesDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CaseStatusEntity[]> {
    return this.caseStatusesService.reorder(user.companyId, dto);
  }
}
