import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardSummaryEntity } from './entities/dashboard-summary.entity';

/** Bez `dto`/`mapper` osobno — jedyne wejście od klienta poza tokenem to `?source=`, walidowane ręcznie (3 dopuszczalne literały, DTO z `@IsEnum` byłby przerostem formy). */
@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.CASES_VIEW)
  @ApiQuery({
    name: 'source',
    required: false,
    enum: ['all', 'b2b', 'b2c'],
    description: 'Faza 6 — przełącznik Wszystkie/B2B/B2C.',
  })
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('source') source?: string,
  ): Promise<DashboardSummaryEntity> {
    const normalized = source === 'b2b' || source === 'b2c' ? source : 'all';
    return this.dashboardService.getSummary(user.companyId, user.userId, normalized);
  }
}
