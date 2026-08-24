import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { computeCaseAttention } from '../cases/case-attention.util';
import { CaseStatusesService } from '../case-statuses/case-statuses.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { ManufacturersService } from '../manufacturers/manufacturers.service';
import { DashboardRepository } from './dashboard.repository';
import { DashboardSummaryEntity } from './entities/dashboard-summary.entity';

/**
 * Status Workflow Refactor — jedyny status z katalogu 9 domyślnych, do
 * którego kafelek "Gotowe do odbioru" odwołuje się wprost (dawniej
 * `CaseStatus.GotowaDoOdbioru`). Kafelek "Oczekiwanie na klienta" został
 * USUNIĘTY (decyzja właściciela) — status "OczekiwanieNaKlienta" nie ma już
 * odpowiednika w nowym katalogu, więc nie było wiarygodnego sygnału do
 * pokazania.
 */
const READY_FOR_PICKUP_STATUS_CODE = 'TowarWrocilZSerwisu';

/**
 * "B2B" = zgłosiła firma, nie klient — NIEZALEŻNIE, którym z dwóch
 * mechanizmów (`originType=PartnerB2B` z `CaseHandoff` ALBO
 * `reportedByPartnerCompanyId` z formularza marki). Musi być IDENTYCZNE z
 * `apps/web/src/lib/case-filters.ts::isB2B` — to ten sam warunek przepisany
 * po drugiej stronie (brak wspólnego pakietu typów między `apps/api`/
 * `apps/web`, patrz komentarz w `cases.api.ts`). Zmiana jednego BEZ
 * drugiego rozjeżdża liczbę na kafelku z listą po kliknięciu.
 */
function buildOriginWhere(source: 'all' | 'b2b' | 'b2c'): Prisma.CaseWhereInput {
  if (source === 'b2b')
    return { OR: [{ originType: 'PartnerB2B' }, { reportedByPartnerCompanyId: { not: null } }] };
  if (source === 'b2c') return { originType: 'DirectCustomer', reportedByPartnerCompanyId: null };
  return {};
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly dashboardRepository: DashboardRepository,
    private readonly caseStatusesService: CaseStatusesService,
    private readonly companySettingsService: CompanySettingsService,
    private readonly manufacturersService: ManufacturersService,
  ) {}

  /**
   * `source` — Faza 6 (Producent/Dystrybutor + Partnerzy B2B): przełącznik
   * Wszystkie/B2B/B2C. `undefined`/`'all'` = bez filtra (zachowanie sprzed
   * Fazy 6, zero zmiany dla firm bez ani jednego przekazania B2B — czyli
   * 100% ruchu DAWIDAM na starcie). `directCustomerTotal`/`partnerB2BTotal`
   * w zwróconej encji są ZAWSZE nieprzefiltrowane (etykiety przełącznika).
   */
  async getSummary(
    companyId: string,
    userId: string,
    source?: 'all' | 'b2b' | 'b2c',
  ): Promise<DashboardSummaryEntity> {
    const originWhere = buildOriginWhere(source ?? 'all');

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const activeStatusCodes = (await this.caseStatusesService.findAllForCompany(companyId))
      .filter((s) => !s.isFinal)
      .map((s) => s.code);

    const [
      totalActive,
      overdue,
      dueToday,
      readyForPickup,
      myCases,
      unreadMessages,
      casesNeedingAttention,
      originTotals,
    ] = await Promise.all([
      this.dashboardRepository.countActive(companyId, activeStatusCodes, originWhere),
      this.dashboardRepository.countOverdue(companyId, activeStatusCodes, originWhere),
      this.dashboardRepository.countDueToday(
        companyId,
        activeStatusCodes,
        startOfDay,
        endOfDay,
        originWhere,
      ),
      this.dashboardRepository.countByStatus(companyId, READY_FOR_PICKUP_STATUS_CODE, originWhere),
      this.dashboardRepository.countMyCases(companyId, userId, activeStatusCodes, originWhere),
      this.dashboardRepository.countUnreadMessages(companyId, originWhere),
      this.countCasesNeedingAttention(companyId, activeStatusCodes, originWhere),
      this.dashboardRepository.countByOriginType(
        companyId,
        buildOriginWhere('b2b'),
        buildOriginWhere('b2c'),
      ),
    ]);

    return {
      totalActive,
      overdue,
      dueToday,
      readyForPickup,
      myCases,
      unreadMessages,
      casesNeedingAttention,
      directCustomerTotal: originTotals.directCustomer,
      partnerB2BTotal: originTotals.partnerB2B,
    };
  }

  /** Kafelek "Sprawy wymagające reakcji" — bez `isFinal` w parametrach `computeCaseAttention` (zawsze `false` tutaj, bo `activeStatusCodes` już wyklucza statusy końcowe na poziomie zapytania). */
  private async countCasesNeedingAttention(
    companyId: string,
    activeStatusCodes: string[],
    originWhere: Prisma.CaseWhereInput,
  ): Promise<number> {
    if (activeStatusCodes.length === 0) return 0;

    const [cases, companyDefaults] = await Promise.all([
      this.dashboardRepository.findActiveCasesForAttention(
        companyId,
        activeStatusCodes,
        originWhere,
      ),
      this.companySettingsService.getSettings(companyId),
    ]);

    // Etap 3 — nadpisanie marki, jeśli ustawione, inaczej próg producenta (jeden resolver,
    // ten sam co `CasesService.attachAttention` — patrz `requirements-resolver.ts`).
    const resolveSla = await this.manufacturersService.resolveAttentionOverridesResolver(
      cases.map((c) => ({
        manufacturerId: c.items[0]?.manufacturerId ?? null,
        brandId: c.items[0]?.product?.brandId ?? null,
      })),
      companyId,
    );

    const now = new Date();
    return cases.filter((c) => {
      return computeCaseAttention({
        isFinal: false,
        statusChangedAt: c.statusChangedAt,
        createdAt: c.createdAt,
        companyDefaults: {
          defaultStatusStaleDays: companyDefaults.defaultStatusStaleDays,
          defaultCaseAgeStaleDays: companyDefaults.defaultCaseAgeStaleDays,
        },
        manufacturerOverrides: resolveSla({
          manufacturerId: c.items[0]?.manufacturerId ?? null,
          brandId: c.items[0]?.product?.brandId ?? null,
        }),
        now,
      }).needsAttention;
    }).length;
  }
}
