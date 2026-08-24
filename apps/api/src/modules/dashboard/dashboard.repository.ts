import { Injectable } from '@nestjs/common';
import { MessageDirection, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Wyłącznie zapytania agregujące — brak `create`/`update` (dashboard nie
 * mutuje danych, patrz `entities/dashboard-summary.entity.ts`).
 * Status Workflow Refactor — "aktywny status" nie jest już hardcodowanym
 * zbiorem nazw enuma; `DashboardService` wylicza `activeStatusCodes`
 * (`isFinal=false` z katalogu firmy) i przekazuje je tutaj, dokładnie jak
 * `CasesRepository.countActiveByOwner`.
 * TODO: "overdue"/"dueToday" liczone tu naiwnie po `nextActionDueDate` —
 * `isOverdue`/`isDueToday` w prototypie (`data.js`) mają dodatkową logikę
 * stref czasowych, nie przeniesioną tutaj.
 *
 * `originWhere` — Etap 2 (Dashboard Producenta/Dystrybutora): zastępuje
 * dawny `originType?: CaseOriginType` (prosta równość). "B2B" znaczy dziś
 * "zgłosiła firma, nie klient", niezależnie od TEGO, którym mechanizmem
 * (`originType=PartnerB2B` z `CaseHandoff` ALBO `reportedByPartnerCompanyId`
 * z formularza marki) — sama równość `originType` przegapiała drugi
 * przypadek. Fragment budowany w `DashboardService.buildOriginWhere`, jeden
 * wspólny punkt prawdy z `apps/web/src/lib/case-filters.ts::isB2B` (ten sam
 * warunek, dwa razy przepisany — backend i frontend nie dzielą kodu między
 * `apps/api`/`apps/web`, patrz komentarz w `cases.api.ts`).
 */
@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  countActive(
    companyId: string,
    activeStatusCodes: string[],
    originWhere: Prisma.CaseWhereInput = {},
  ): Promise<number> {
    return this.prisma.case.count({
      where: { companyId, status: { in: activeStatusCodes }, ...originWhere },
    });
  }

  countOverdue(
    companyId: string,
    activeStatusCodes: string[],
    originWhere: Prisma.CaseWhereInput = {},
  ): Promise<number> {
    return this.prisma.case.count({
      where: {
        companyId,
        status: { in: activeStatusCodes },
        nextActionDueDate: { lt: new Date() },
        ...originWhere,
      },
    });
  }

  countDueToday(
    companyId: string,
    activeStatusCodes: string[],
    startOfDay: Date,
    endOfDay: Date,
    originWhere: Prisma.CaseWhereInput = {},
  ): Promise<number> {
    return this.prisma.case.count({
      where: {
        companyId,
        status: { in: activeStatusCodes },
        nextActionDueDate: { gte: startOfDay, lte: endOfDay },
        ...originWhere,
      },
    });
  }

  countByStatus(
    companyId: string,
    status: string | string[],
    originWhere: Prisma.CaseWhereInput = {},
  ): Promise<number> {
    return this.prisma.case.count({
      where: { companyId, status: Array.isArray(status) ? { in: status } : status, ...originWhere },
    });
  }

  countMyCases(
    companyId: string,
    ownerId: string,
    activeStatusCodes: string[],
    originWhere: Prisma.CaseWhereInput = {},
  ): Promise<number> {
    return this.prisma.case.count({
      where: { companyId, ownerId, status: { in: activeStatusCodes }, ...originWhere },
    });
  }

  /** Wiadomości od klienta (`Inbound`) jeszcze nieprzeczytane przez pracownika — `Message` nie ma własnego `companyId`, filtr idzie przez relację `case`. */
  countUnreadMessages(companyId: string, originWhere: Prisma.CaseWhereInput = {}): Promise<number> {
    return this.prisma.message.count({
      where: {
        direction: MessageDirection.Inbound,
        readAt: null,
        case: { companyId, ...originWhere },
      },
    });
  }

  /** Przypomnienia o reakcji — pola minimalne potrzebne do `computeCaseAttention` (kafelek "Sprawy wymagające reakcji"), tylko sprawy aktywne (status nie-finalny, przekazany przez wołającego jak w reszcie tego repozytorium). */
  findActiveCasesForAttention(
    companyId: string,
    activeStatusCodes: string[],
    originWhere: Prisma.CaseWhereInput = {},
  ): Promise<
    {
      status: string;
      statusChangedAt: Date;
      createdAt: Date;
      items: { manufacturerId: string | null; product: { brandId: string | null } }[];
    }[]
  > {
    return this.prisma.case.findMany({
      where: { companyId, status: { in: activeStatusCodes }, ...originWhere },
      select: {
        status: true,
        statusChangedAt: true,
        createdAt: true,
        items: {
          take: 1,
          select: { manufacturerId: true, product: { select: { brandId: true } } },
        },
      },
    });
  }

  /**
   * Faza 6 planu B2B — liczniki "Wszystkie/B2B/B2C" niezależne od `source`
   * (zawsze CAŁKOWITA liczba spraw firmy per pochodzenie, do etykiet
   * przełącznika), nie tylko aktywnych — inaczej zamknięta sprawa B2B
   * "znikałaby" z licznika po zakończeniu, co byłoby mylące.
   */
  async countByOriginType(
    companyId: string,
    b2bWhere: Prisma.CaseWhereInput,
    b2cWhere: Prisma.CaseWhereInput,
  ): Promise<{ directCustomer: number; partnerB2B: number }> {
    const [directCustomer, partnerB2B] = await Promise.all([
      this.prisma.case.count({ where: { companyId, ...b2cWhere } }),
      this.prisma.case.count({ where: { companyId, ...b2bWhere } }),
    ]);
    return { directCustomer, partnerB2B };
  }
}
