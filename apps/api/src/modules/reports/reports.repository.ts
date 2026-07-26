import { Injectable } from '@nestjs/common';
import { CaseStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  countCasesForManufacturer(manufacturerId: string): Promise<number> {
    return this.prisma.caseItem.count({ where: { manufacturerId } });
  }

  /** TODO: wersja naiwna — liczy wyłącznie po `Case.createdAt`/`closedAt` spraw z co najmniej jedną pozycją tego producenta; nie waży wieloelementowych spraw z wieloma producentami (BR-072). */
  async findClosedCaseDurations(manufacturerId: string): Promise<number[]> {
    const cases = await this.prisma.case.findMany({
      where: { status: CaseStatus.Zamknieta, closedAt: { not: null }, items: { some: { manufacturerId } } },
      select: { createdAt: true, closedAt: true },
    });
    return cases
      .filter((c) => c.closedAt)
      .map((c) => (c.closedAt!.getTime() - c.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  }
}
