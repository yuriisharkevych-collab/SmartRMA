import { Injectable } from '@nestjs/common';
import { CaseHistory, CaseHistoryAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Wydzielone z `CasesRepository` (Zadanie 16). Insert-only od strony
 * `CasesService` (dziennik biznesowy, DATABASE.md §22 — analogicznie do
 * `AuditRepository`/BR-090, choć to inny dziennik o innym przeznaczeniu:
 * `CaseHistory` to fakty biznesowe dla klienta/pracownika, `AuditLog` to
 * bezpieczeństwo/zgodność). `client` opcjonalny na każdej metodzie — patrz
 * `AuditRepository.create` dla pełnego uzasadnienia (atomowość z mutacją
 * `Case` w tej samej `prisma.$transaction`).
 */
@Injectable()
export class CaseHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  addEntry(
    caseId: string,
    data: {
      userId?: string | null;
      action: CaseHistoryAction;
      previousValue?: string | null;
      newValue?: string | null;
      visibleForCustomer?: boolean;
    },
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<CaseHistory> {
    return client.caseHistory.create({ data: { ...data, caseId } });
  }

  /** Dołącza imię/nazwisko autora jednym JOIN-em — bez tego UI (`CaseDetailPage`) mógł pokazać nazwisko WYŁĄCZNIE jeśli przeglądający miał `users.view` (np. Pracownik go nie ma), więc każdy wpis — łącznie z jego WŁASNYMI akcjami — pokazywał się jako "System". */
  findByCaseId(
    caseId: string,
  ): Promise<(CaseHistory & { user: { firstName: string; lastName: string } | null })[]> {
    return this.prisma.caseHistory.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
  }

  /**
   * Etap 2 (Dashboard Producenta/Dystrybutora) — kafelek "Oczekujące na klienta"
   * (`CasesService.attachAttention`) potrzebuje wiedzieć, które sprawy MIAŁY
   * kiedykolwiek wysłaną prośbę o uzupełnienie danych — jeden zapytanie dla
   * całej listy zamiast N zapytań per sprawa. `distinct` po `caseId` — nie
   * interesuje nas ILE razy, tylko CZY choć raz.
   */
  async findCaseIdsWithAction(caseIds: string[], action: CaseHistoryAction): Promise<Set<string>> {
    if (caseIds.length === 0) return new Set();
    const rows = await this.prisma.caseHistory.findMany({
      where: { caseId: { in: caseIds }, action },
      select: { caseId: true },
      distinct: ['caseId'],
    });
    return new Set(rows.map((r) => r.caseId));
  }

  /** `cases.delete` (RBAC.md §5) — JEDYNY wyjątek od "insert-only" powyżej (celowo, na wyraźne żądanie właściciela, wyłącznie dla usuwania spraw testowych). */
  deleteAllForCase(
    caseId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Prisma.BatchPayload> {
    return client.caseHistory.deleteMany({ where: { caseId } });
  }
}
