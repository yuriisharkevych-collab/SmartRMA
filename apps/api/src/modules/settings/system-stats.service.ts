import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemStatsEntity } from './entities/settings-overview.entity';

/**
 * Zapytania proste, bez agregatów per-moduł (Reports już ma na to
 * `ReportsRepository`) — to jest panel administracyjny "ile mamy danych",
 * nie raport zarządczy. Bezpośrednie wstrzyknięcie `PrismaService`, bez
 * importowania modułów Users/Customers/... — ten sam wzorzec co
 * `ReportsRepository` (Zadanie Raporty), żeby uniknąć rozrostu zależności
 * modułowych dla samego liczenia wierszy.
 */
@Injectable()
export class SystemStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(companyId: string): Promise<SystemStatsEntity> {
    const [
      userCount,
      customerCount,
      caseCount,
      manufacturerCount,
      productCount,
      documentAgg,
      dbVersionRow,
    ] = await Promise.all([
      this.prisma.user.count({ where: { companyId } }),
      this.prisma.customer.count({ where: { companyId } }),
      this.prisma.case.count({ where: { companyId } }),
      this.prisma.manufacturer.count({ where: { companyId } }),
      this.prisma.product.count({ where: { companyId } }),
      this.prisma.document.aggregate({
        where: { case: { companyId } },
        _count: { _all: true },
        _sum: { fileSize: true },
      }),
      this.prisma.$queryRaw<Array<{ version: string }>>`SELECT version()`,
    ]);

    return {
      userCount,
      customerCount,
      caseCount,
      manufacturerCount,
      productCount,
      documentCount: documentAgg._count._all,
      storageUsedBytes: documentAgg._sum.fileSize ?? 0,
      appVersion: process.env.npm_package_version ?? '0.1.0',
      databaseVersion: dbVersionRow[0]?.version ?? 'nieznana',
    };
  }
}
