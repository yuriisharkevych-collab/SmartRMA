import { Injectable } from '@nestjs/common';
import { CaseStatus, Decision } from '@prisma/client';
import { CompaniesService } from '../companies/companies.service';
import { UsersService } from '../users/users.service';
import {
  EmployeeReportRowEntity,
  ManufacturerReportRowEntity,
  NamedCountEntity,
  ReportOverviewEntity,
  ShopReportRowEntity,
  TopItemEntity,
} from './entities/report-overview.entity';
import { ReportRange, ReportsRepository } from './reports.repository';

const DAY_MS = 1000 * 60 * 60 * 24;
const CLOSED_STATUSES: CaseStatus[] = [
  CaseStatus.Zamknieta,
  CaseStatus.Anulowana,
  CaseStatus.Zarchiwizowana,
];

const COMPLAINT_TYPE_LABELS: Record<string, string> = {
  Warranty: 'Gwarancja',
  StatutoryWarranty: 'Rękojmia',
};
const SOURCE_LABELS: Record<string, string> = {
  SklepStacjonarny: 'Sklep stacjonarny',
  Email: 'E-mail',
  Telefon: 'Telefon',
  FormularzWWW: 'Formularz WWW',
  Marketplace: 'Marketplace',
  Inne: 'Inne',
};
const STATUS_LABELS: Record<string, string> = {
  Nowa: 'Nowa',
  Przyjeta: 'Przyjęta',
  Weryfikacja: 'Weryfikacja',
  OczekiwanieNaKlienta: 'Oczekiwanie na klienta',
  GotowaDoWysylki: 'Gotowa do wysyłki',
  OczekiwanieNaKuriera: 'Oczekiwanie na kuriera',
  WyslanaDoProducenta: 'Wysłana do producenta',
  OczekiwanieNaDecyzjeProducenta: 'Oczekiwanie na decyzję producenta',
  WeryfikacjaWewnetrzna: 'Weryfikacja wewnętrzna',
  OczekiwanieNaDecyzjeKierownika: 'Oczekiwanie na decyzję Kierownika',
  RealizacjaDecyzji: 'Realizacja decyzji',
  GotowaDoOdbioru: 'Gotowa do odbioru',
  Zamknieta: 'Zamknięta',
  Anulowana: 'Anulowana',
  Zarchiwizowana: 'Zarchiwizowana',
};

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function pct(part: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

/**
 * Raporty zarządcze. Każdy odpowiada na konkretne pytanie właściciela:
 * ile spraw i skąd, którzy producenci uznają reklamacje i jak szybko, jak
 * obciążeni są pracownicy, które produkty psują się najczęściej, gdzie
 * przekraczamy SLA i ile to kosztuje.
 *
 * Dane liczone są z JEDNEGO wywołania `getOverview` — wszystkie zapytania
 * lecą równolegle, a agregacja odbywa się na wyniku zapytań grupujących, nie
 * przez pobieranie surowych wierszy do Node.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly reportsRepository: ReportsRepository,
    private readonly usersService: UsersService,
    private readonly companiesService: CompaniesService,
  ) {}

  async getOverview(companyId: string, from: Date, to: Date): Promise<ReportOverviewEntity> {
    const range: ReportRange = { companyId, from, to };
    const now = new Date();

    const [
      totalCases,
      byTypeRaw,
      byStatusRaw,
      bySourceRaw,
      byMonthRaw,
      closedCases,
      overdueCases,
      items,
      timeline,
      manufacturerSlas,
      brands,
      logisticsAgg,
      users,
      shops,
    ] = await Promise.all([
      this.reportsRepository.countCases(range),
      this.reportsRepository.groupByComplaintType(range),
      this.reportsRepository.groupByStatus(range),
      this.reportsRepository.groupBySource(range),
      this.reportsRepository.casesByMonth(range),
      this.reportsRepository.findClosedCases(range),
      this.reportsRepository.findOverdueCases(range, now),
      this.reportsRepository.findCaseItems(range),
      this.reportsRepository.findResponseTimeline(range),
      this.reportsRepository.findManufacturerSlas(companyId),
      this.reportsRepository.findBrands(companyId),
      this.reportsRepository.sumLogisticsCost(range),
      this.usersService.findAllForCompany(companyId),
      this.companiesService.findShops(companyId),
    ]);

    const closedCount = byStatusRaw
      .filter((r) => CLOSED_STATUSES.includes(r.status))
      .reduce((sum, r) => sum + r._count._all, 0);

    const resolutionDaysByCase = new Map<string, number>();
    for (const c of closedCases) {
      resolutionDaysByCase.set(c.id, (c.closedAt!.getTime() - c.createdAt.getTime()) / DAY_MS);
    }

    // --- Czas odpowiedzi producenta: WyslanaDoProducenta → pierwsza decyzja ---
    const sentAt = new Map<string, Date>();
    const decidedAt = new Map<string, Date>();
    for (const entry of timeline) {
      if (entry.newValue === CaseStatus.WyslanaDoProducenta && !sentAt.has(entry.caseId)) {
        sentAt.set(entry.caseId, entry.createdAt);
      }
      if (entry.action === 'DecisionSet' && !decidedAt.has(entry.caseId)) {
        decidedAt.set(entry.caseId, entry.createdAt);
      }
    }
    const responseDaysByCase = new Map<string, number>();
    for (const [caseId, sent] of sentAt) {
      const decided = decidedAt.get(caseId);
      if (decided && decided > sent)
        responseDaysByCase.set(caseId, (decided.getTime() - sent.getTime()) / DAY_MS);
    }

    // --- Producenci ---
    const manufacturerRows = this.buildManufacturerRows(
      items,
      manufacturerSlas,
      responseDaysByCase,
      resolutionDaysByCase,
    );

    // --- Pracownicy ---
    const overdueByOwner = new Map<string, number>();
    for (const c of overdueCases) {
      if (c.ownerId) overdueByOwner.set(c.ownerId, (overdueByOwner.get(c.ownerId) ?? 0) + 1);
    }
    const employees: EmployeeReportRowEntity[] = (await this.reportsRepository.groupByOwner(range))
      .filter((row) => row.ownerId)
      .map((row) => {
        const ownerId = row.ownerId!;
        const owned = closedCases.filter((c) => c.ownerId === ownerId);
        const user = users.find((u) => u.id === ownerId);
        return {
          userId: ownerId,
          name: user ? `${user.firstName} ${user.lastName}` : '—',
          total: row._count._all,
          closed: owned.length,
          open: row._count._all - owned.length,
          overdue: overdueByOwner.get(ownerId) ?? 0,
          avgResolutionDays: avg(owned.map((c) => resolutionDaysByCase.get(c.id) ?? 0)),
        };
      })
      .sort((a, b) => b.total - a.total);

    // --- Sklepy ---
    const shopRows: ShopReportRowEntity[] = (await this.reportsRepository.groupByShop(range))
      .filter((row) => row.shopId)
      .map((row) => {
        const shopId = row.shopId!;
        const closed = closedCases.filter((c) => c.shopId === shopId);
        return {
          shopId,
          name: shops.find((s) => s.id === shopId)?.name ?? '—',
          total: row._count._all,
          closed: closed.length,
          closeRate: pct(closed.length, row._count._all),
          avgResolutionDays: avg(closed.map((c) => resolutionDaysByCase.get(c.id) ?? 0)),
        };
      })
      .sort((a, b) => b.total - a.total);

    // --- Produkty i marki ---
    const productCounts = new Map<string, { name: string; count: number }>();
    const brandCounts = new Map<string, number>();
    for (const item of items) {
      const p = productCounts.get(item.productId) ?? { name: item.product.name, count: 0 };
      p.count += 1;
      productCounts.set(item.productId, p);
      if (item.product.brandId)
        brandCounts.set(item.product.brandId, (brandCounts.get(item.product.brandId) ?? 0) + 1);
    }
    const topProducts: TopItemEntity[] = Array.from(productCounts.entries())
      .map(([id, v]) => ({ id, name: v.name, count: v.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const topBrands: TopItemEntity[] = Array.from(brandCounts.entries())
      .map(([id, count]) => ({ id, name: brands.find((b) => b.id === id)?.name ?? '—', count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // --- SLA ---
    const slaBreachTotal = manufacturerRows.reduce((sum, r) => sum + r.slaBreaches, 0);

    // --- Finanse ---
    const finance = await this.buildFinance(items, logisticsAgg, range);

    return {
      from,
      to,
      totalCases,
      closedCases: closedCount,
      openCases: totalCases - closedCount,
      overdueCases: overdueCases.length,
      avgResolutionDays: avg(Array.from(resolutionDaysByCase.values())),

      byComplaintType: byTypeRaw.map((r) =>
        this.named(r.complaintType, COMPLAINT_TYPE_LABELS, r._count._all),
      ),
      byStatus: byStatusRaw
        .map((r) => this.named(r.status, STATUS_LABELS, r._count._all))
        .sort((a, b) => b.count - a.count),
      bySource: bySourceRaw
        .map((r) => this.named(r.source, SOURCE_LABELS, r._count._all))
        .sort((a, b) => b.count - a.count),
      byMonth: byMonthRaw.map((r) => ({
        month: r.month.toISOString().slice(0, 7),
        count: Number(r.count),
      })),

      manufacturers: manufacturerRows,
      employees,
      shops: shopRows,
      topProducts,
      topBrands,

      sla: {
        breaches: slaBreachTotal,
        measured: responseDaysByCase.size,
        avgResponseDays: avg(Array.from(responseDaysByCase.values())),
        avgResolutionDays: avg(Array.from(resolutionDaysByCase.values())),
      },
      finance,
    };
  }

  private named(key: string, labels: Record<string, string>, count: number): NamedCountEntity {
    return { key, label: labels[key] ?? key, count };
  }

  private buildManufacturerRows(
    items: Awaited<ReturnType<ReportsRepository['findCaseItems']>>,
    slas: Awaited<ReturnType<ReportsRepository['findManufacturerSlas']>>,
    responseDaysByCase: Map<string, number>,
    resolutionDaysByCase: Map<string, number>,
  ): ManufacturerReportRowEntity[] {
    const grouped = new Map<string, { caseIds: Set<string>; accepted: number; rejected: number }>();

    for (const item of items) {
      if (!item.manufacturerId) continue;
      const bucket = grouped.get(item.manufacturerId) ?? {
        caseIds: new Set<string>(),
        accepted: 0,
        rejected: 0,
      };
      // Sprawa wieloelementowa liczy się do producenta RAZ — inaczej dwie pozycje
      // tego samego producenta zawyżałyby jego statystyki dwukrotnie.
      if (!bucket.caseIds.has(item.case.id)) {
        bucket.caseIds.add(item.case.id);
        if (item.case.decision === Decision.Odrzucenie) bucket.rejected += 1;
        else if (item.case.decision) bucket.accepted += 1;
      }
      grouped.set(item.manufacturerId, bucket);
    }

    return Array.from(grouped.entries())
      .map(([manufacturerId, bucket]) => {
        const sla = slas.find((s) => s.id === manufacturerId);
        const threshold = sla?.sla?.responseDays ?? null;
        const caseIds = Array.from(bucket.caseIds);
        const responses = caseIds
          .map((id) => responseDaysByCase.get(id))
          .filter((v): v is number => v !== undefined);
        const resolutions = caseIds
          .map((id) => resolutionDaysByCase.get(id))
          .filter((v): v is number => v !== undefined);
        const decided = bucket.accepted + bucket.rejected;

        return {
          manufacturerId,
          name: sla?.contractor.name ?? '—',
          caseCount: bucket.caseIds.size,
          accepted: bucket.accepted,
          rejected: bucket.rejected,
          acceptanceRate: pct(bucket.accepted, decided),
          avgResponseDays: avg(responses),
          avgResolutionDays: avg(resolutions),
          slaResponseDays: threshold,
          slaBreaches: threshold === null ? 0 : responses.filter((d) => d > threshold).length,
        };
      })
      .sort((a, b) => b.caseCount - a.caseCount);
  }

  private async buildFinance(
    items: Awaited<ReturnType<ReportsRepository['findCaseItems']>>,
    logisticsAgg: Awaited<ReturnType<ReportsRepository['sumLogisticsCost']>>,
    range: ReportRange,
  ) {
    const orderItemIds = items.map((i) => i.orderItemId).filter((id): id is string => Boolean(id));
    const prices = await this.reportsRepository.findOrderItemPrices(orderItemIds);

    let productValue = 0;
    let pricedItems = 0;
    for (const p of prices) {
      if (p.unitPrice === null) continue;
      productValue += Number(p.unitPrice) * p.quantity;
      pricedItems += 1;
    }

    const decisions = await this.reportsRepository.groupByDecision(range);
    const countOf = (d: Decision) => decisions.find((x) => x.decision === d)?._count._all ?? 0;

    const coverageNotes: string[] = [];
    if (pricedItems < items.length) {
      coverageNotes.push(
        `Wartość policzona z ${pricedItems} z ${items.length} pozycji — pozostałe nie są dowiązane do zamówienia, więc nie mają ceny.`,
      );
    }
    coverageNotes.push(
      'Pełny koszt reklamacji (robocizna, części, obciążenia zwrotne producenta) nie ma odpowiednika w modelu danych — wymaga osobnej decyzji i migracji.',
    );

    return {
      productValue: productValue.toFixed(2),
      pricedItems,
      totalItems: items.length,
      logisticsCost: Number(logisticsAgg._sum.cost ?? 0).toFixed(2),
      replacements: countOf(Decision.WymianaProduktu) + countOf(Decision.WymianaCzesci),
      repairs: countOf(Decision.Naprawa),
      refunds: countOf(Decision.ZwrotSrodkow),
      coverageNotes,
    };
  }
}
