import { Injectable } from '@nestjs/common';
import { CaseStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const ACTIVE_STATUSES: CaseStatus[] = Object.values(CaseStatus).filter(
  (status) => !([CaseStatus.Zamknieta, CaseStatus.Anulowana, CaseStatus.Zarchiwizowana] as CaseStatus[]).includes(status),
);

/**
 * Wyłącznie zapytania agregujące — brak `create`/`update` (dashboard nie
 * mutuje danych, patrz `entities/dashboard-summary.entity.ts`).
 * TODO: "overdue"/"dueToday" liczone tu naiwnie po `nextActionDueDate` —
 * `isOverdue`/`isDueToday` w prototypie (`data.js`) mają dodatkową logikę
 * stref czasowych, nie przeniesioną tutaj.
 */
@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  countActive(companyId: string): Promise<number> {
    return this.prisma.case.count({ where: { companyId, status: { in: ACTIVE_STATUSES } } });
  }

  countOverdue(companyId: string): Promise<number> {
    return this.prisma.case.count({
      where: { companyId, status: { in: ACTIVE_STATUSES }, nextActionDueDate: { lt: new Date() } },
    });
  }

  countDueToday(companyId: string, startOfDay: Date, endOfDay: Date): Promise<number> {
    return this.prisma.case.count({
      where: {
        companyId,
        status: { in: ACTIVE_STATUSES },
        nextActionDueDate: { gte: startOfDay, lte: endOfDay },
      },
    });
  }

  countByStatus(companyId: string, status: CaseStatus): Promise<number> {
    return this.prisma.case.count({ where: { companyId, status } });
  }

  countMyCases(companyId: string, ownerId: string): Promise<number> {
    return this.prisma.case.count({ where: { companyId, ownerId, status: { in: ACTIVE_STATUSES } } });
  }
}
