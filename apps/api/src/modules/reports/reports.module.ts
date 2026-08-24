import { Module } from '@nestjs/common';
import { CaseStatusesModule } from '../case-statuses/case-statuses.module';
import { CompaniesModule } from '../companies/companies.module';
import { UsersModule } from '../users/users.module';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

/**
 * `UsersModule`/`CompaniesModule` — nazwy pracowników i sklepów do raportów.
 * Reużywamy istniejących serwisów zamiast dublować zapytania o te encje
 * w `ReportsRepository` (te same dane, jedno źródło prawdy). `CaseStatusesModule`
 * — katalog statusów firmy (etykiety + zbiór statusów końcowych), patrz
 * `ReportsService.getOverview`.
 */
@Module({
  imports: [UsersModule, CompaniesModule, CaseStatusesModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository],
})
export class ReportsModule {}
