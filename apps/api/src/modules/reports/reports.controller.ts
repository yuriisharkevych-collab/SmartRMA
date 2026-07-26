import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { ManufacturerReportEntity } from './entities/manufacturer-report.entity';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('manufacturers/:manufacturerId')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  getManufacturerReport(
    @Param('manufacturerId', ParseUUIDPipe) manufacturerId: string,
  ): Promise<ManufacturerReportEntity> {
    return this.reportsService.getManufacturerReport(manufacturerId);
  }
}
