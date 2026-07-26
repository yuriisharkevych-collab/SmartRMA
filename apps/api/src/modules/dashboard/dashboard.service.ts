import { Injectable } from '@nestjs/common';
import { CaseStatus } from '@prisma/client';
import { DashboardRepository } from './dashboard.repository';
import { DashboardSummaryEntity } from './entities/dashboard-summary.entity';

@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  async getSummary(companyId: string, userId: string): Promise<DashboardSummaryEntity> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [totalActive, overdue, dueToday, awaitingCustomer, readyForPickup, myCases] = await Promise.all([
      this.dashboardRepository.countActive(companyId),
      this.dashboardRepository.countOverdue(companyId),
      this.dashboardRepository.countDueToday(companyId, startOfDay, endOfDay),
      this.dashboardRepository.countByStatus(companyId, CaseStatus.OczekiwanieNaKlienta),
      this.dashboardRepository.countByStatus(companyId, CaseStatus.GotowaDoOdbioru),
      this.dashboardRepository.countMyCases(companyId, userId),
    ]);

    return { totalActive, overdue, dueToday, awaitingCustomer, readyForPickup, myCases };
  }
}
