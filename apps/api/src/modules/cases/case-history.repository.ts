import { Injectable } from '@nestjs/common';
import { CaseHistory, CaseHistoryAction, CaseStatus, Prisma } from '@prisma/client';
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

  findByCaseId(caseId: string): Promise<CaseHistory[]> {
    return this.prisma.caseHistory.findMany({ where: { caseId }, orderBy: { createdAt: 'asc' } });
  }

  /**
   * WORKFLOW.md §4 — status do którego wraca sprawa po wyjściu z
   * `OczekiwanieNaKlienta` to `previousValue` NAJNOWSZEGO wpisu z
   * `newValue=OczekiwanieNaKlienta` dla tej sprawy. Wejście w ten status
   * zapisuje `CaseHistoryAction.InfoRequested` (WORKFLOW.md §6 poz. 4 — nie
   * generyczny `StatusChanged`, jedna kombinowana adnotacja), więc filtr
   * celowo NIE zawęża po `action` — szuka najnowszego wpisu z tym
   * `newValue` niezależnie od akcji, która go zapisała. `null`, jeśli
   * takiego wpisu nie ma (wołający domyślnie wraca do `Weryfikacja`,
   * dokładnie jak nakazuje ten sam paragraf). Przyjmuje `client`, żeby
   * odczyt należał do tej samej transakcji co blokada wiersza `Case`
   * (`CasesRepository.findByIdForUpdate`) — spójny widok danych.
   */
  async findLastStatusBeforeWaiting(
    caseId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<CaseStatus | null> {
    const entry = await client.caseHistory.findFirst({
      where: { caseId, newValue: CaseStatus.OczekiwanieNaKlienta },
      orderBy: { createdAt: 'desc' },
    });
    return (entry?.previousValue as CaseStatus | undefined) ?? null;
  }
}
