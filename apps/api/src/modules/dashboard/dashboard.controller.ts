import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardSummaryEntity } from './entities/dashboard-summary.entity';

/** Bez `dto`/`mapper` osobno — brak wejścia od klienta poza tokenem, a wyjście to bezpośrednio `DashboardSummaryEntity` (agregat liczb, nie encja bazy do mapowania). */
@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.CASES_VIEW)
  getSummary(@CurrentUser() user: AuthenticatedUser): Promise<DashboardSummaryEntity> {
    return this.dashboardService.getSummary(user.companyId, user.userId);
  }
}
