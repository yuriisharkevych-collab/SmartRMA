import { Module } from '@nestjs/common';
import { CaseStatusesModule } from '../case-statuses/case-statuses.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { ManufacturersModule } from '../manufacturers/manufacturers.module';
import { DashboardController } from './dashboard.controller';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [CaseStatusesModule, CompanySettingsModule, ManufacturersModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository],
})
export class DashboardModule {}
