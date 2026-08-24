import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Zakres raportu — KAŻDE zapytanie tego repozytorium przyjmuje go razem z `companyId`, żeby nie dało się przypadkiem policzyć danych innej firmy (BR-086). */
export interface ReportRange {
  companyId: string;
  from: Date;
  to: Date;
}

/**
 * Agregaty raportowe. Zasady:
 *  - `groupBy`/`count` po stronie bazy zamiast pobierania wierszy i liczenia
 *    w Node — przy kilkudziesięciu tysiącach spraw różnica jest zasadnicza;
 *  - `select` zawężony do kolumn faktycznie potrzebnych do wyliczenia;
 *  - filtr `companyId` + `createdAt` trafia w indeks złożony
 *    `@@index([companyId, createdAt])` dodany migracją `report_indexes`.
 */
@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private where({ companyId, from, to }: ReportRange): Prisma.CaseWhereInput {
    return { companyId, createdAt: { gte: from, lte: to } };
  }

  countCases(range: ReportRange): Promise<number> {
    return this.prisma.case.count({ where: this.where(range) });
  }

  groupByComplaintType(range: ReportRange) {
    return this.prisma.case.groupBy({
      by: ['complaintType'],
      where: this.where(range),
      _count: { _all: true },
    });
  }

  groupByStatus(range: ReportRange) {
    return this.prisma.case.groupBy({
      by: ['status'],
      where: this.where(range),
      _count: { _all: true },
    });
  }

  groupBySource(range: ReportRange) {
    return this.prisma.case.groupBy({
      by: ['source'],
      where: this.where(range),
      _count: { _all: true },
    });
  }

  groupByDecision(range: ReportRange) {
    return this.prisma.case.groupBy({
      by: ['decision'],
      where: { ...this.where(range), decision: { not: null } },
      _count: { _all: true },
    });
  }

  groupByOwner(range: ReportRange) {
    return this.prisma.case.groupBy({
      by: ['ownerId'],
      where: this.where(range),
      _count: { _all: true },
    });
  }

  groupByShop(range: ReportRange) {
    return this.prisma.case.groupBy({
      by: ['shopId'],
      where: this.where(range),
      _count: { _all: true },
    });
  }

  /**
   * Sprawy zamknięte w zakresie — do średniego czasu obsługi i statystyk
   * pracowników. Status Workflow Refactor — `closedStatusCodes` (zbiór
   * `isFinal=true` z katalogu firmy, wyliczony przez `ReportsService`)
   * zamiast dawnego hardcodowanego `CaseStatus.Zamknieta` (dawna
   * niespójność: filtrowało WYŁĄCZNIE "Zamknięta", pomijając
   * "Anulowana"/"Zarchiwizowana", mimo że `CLOSED_STATUSES` niżej w tym
   * pliku uwzględniało wszystkie trzy — teraz jedno źródło prawdy).
   */
  findClosedCases(range: ReportRange, closedStatusCodes: string[]) {
    return this.prisma.case.findMany({
      where: { ...this.where(range), status: { in: closedStatusCodes }, closedAt: { not: null } },
      select: { id: true, ownerId: true, shopId: true, createdAt: true, closedAt: true },
    });
  }

  /** Sprawy otwarte po terminie — „przeterminowane" liczone tak samo jak na liście spraw i dashboardzie. */
  findOverdueCases(range: ReportRange, now: Date, closedStatusCodes: string[]) {
    return this.prisma.case.findMany({
      where: {
        ...this.where(range),
        status: { notIn: closedStatusCodes },
        nextActionDueDate: { not: null, lt: now },
      },
      select: { id: true, ownerId: true },
    });
  }

  /** Liczba spraw miesiącami — agregacja w SQL (`date_trunc`), nie w pamięci aplikacji. */
  casesByMonth(range: ReportRange): Promise<Array<{ month: Date; count: bigint }>> {
    return this.prisma.$queryRaw`
      SELECT date_trunc('month', "createdAt") AS month, COUNT(*)::bigint AS count
      FROM "Case"
      WHERE "companyId" = ${range.companyId} AND "createdAt" BETWEEN ${range.from} AND ${range.to}
      GROUP BY 1
      ORDER BY 1
    `;
  }

  /** Pozycje reklamacji w zakresie — podstawa raportów produktowych i producenckich. */
  findCaseItems(range: ReportRange) {
    return this.prisma.caseItem.findMany({
      where: { case: this.where(range) },
      select: {
        productId: true,
        manufacturerId: true,
        orderItemId: true,
        product: { select: { name: true, brandId: true } },
        case: {
          select: { id: true, status: true, decision: true, createdAt: true, closedAt: true },
        },
      },
    });
  }

  /** Ceny jednostkowe dowiązanych egzemplarzy — jedyne źródło wartości reklamowanego towaru. */
  findOrderItemPrices(orderItemIds: string[]) {
    if (orderItemIds.length === 0) return Promise.resolve([]);
    return this.prisma.orderItem.findMany({
      where: { id: { in: orderItemIds } },
      select: { id: true, unitPrice: true, quantity: true },
    });
  }

  /** Realne koszty transportu spraw z zakresu (`Logistics.cost`). */
  sumLogisticsCost(range: ReportRange) {
    return this.prisma.logistics.aggregate({
      where: { case: this.where(range) },
      _sum: { cost: true },
      _count: { _all: true },
    });
  }

  /**
   * Wejścia w status "przekazana do producenta/dystrybutora" i wpisy
   * `DecisionSet` — z nich liczymy czas odpowiedzi producenta i naruszenia
   * SLA. Pobieramy wyłącznie te dwa rodzaje wpisów, nie całą historię
   * sprawy. Status Workflow Refactor — `sentToManufacturerStatusCode`
   * przekazywany przez `ReportsService` (dawniej hardcodowane
   * `CaseStatus.WyslanaDoProducenta`).
   */
  findResponseTimeline(range: ReportRange, sentToManufacturerStatusCode: string) {
    return this.prisma.caseHistory.findMany({
      where: {
        case: this.where(range),
        OR: [{ newValue: sentToManufacturerStatusCode }, { action: 'DecisionSet' }],
      },
      select: { caseId: true, action: true, newValue: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Progi SLA producentów firmy — do porównania z realnym czasem odpowiedzi. */
  findManufacturerSlas(companyId: string) {
    return this.prisma.manufacturer.findMany({
      where: { companyId },
      select: {
        id: true,
        contractor: { select: { name: true } },
        sla: { select: { responseDays: true, repairDays: true } },
      },
    });
  }

  /** Nazwy marek firmy — raport „najczęściej reklamowane marki". */
  findBrands(companyId: string) {
    return this.prisma.brand.findMany({ where: { companyId }, select: { id: true, name: true } });
  }
}
