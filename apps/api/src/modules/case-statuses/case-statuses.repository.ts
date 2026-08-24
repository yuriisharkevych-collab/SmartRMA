import { Injectable } from '@nestjs/common';
import { CaseStatusDefinition, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CaseStatusesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllForCompany(companyId: string): Promise<CaseStatusDefinition[]> {
    return this.prisma.caseStatusDefinition.findMany({
      where: { companyId },
      orderBy: { order: 'asc' },
    });
  }

  findActiveForCompany(companyId: string): Promise<CaseStatusDefinition[]> {
    return this.prisma.caseStatusDefinition.findMany({
      where: { companyId, active: true },
      orderBy: { order: 'asc' },
    });
  }

  /** `companyId` obowiązkowy — bez niego administrator jednej firmy mógłby odczytać/edytować status innej firmy, znając samo UUID (IDOR, wzorzec `ManufacturersRepository.findById`). */
  findById(id: string, companyId: string): Promise<CaseStatusDefinition | null> {
    return this.prisma.caseStatusDefinition.findFirst({ where: { id, companyId } });
  }

  findByCode(code: string, companyId: string): Promise<CaseStatusDefinition | null> {
    return this.prisma.caseStatusDefinition.findFirst({ where: { code, companyId } });
  }

  /** Sprawdzenie unikalności `code` per firma PRZED zapisem — istniejące kody z tym samym prefiksem (generator kodu w serwisie doklejwa liczbowy sufiks przy kolizji). */
  countCodesWithPrefix(codePrefix: string, companyId: string): Promise<number> {
    return this.prisma.caseStatusDefinition.count({
      where: { companyId, code: { startsWith: codePrefix } },
    });
  }

  maxOrder(companyId: string): Promise<{ _max: { order: number | null } }> {
    return this.prisma.caseStatusDefinition.aggregate({
      where: { companyId },
      _max: { order: true },
    });
  }

  create(
    companyId: string,
    data: Omit<Prisma.CaseStatusDefinitionUncheckedCreateInput, 'companyId'>,
  ): Promise<CaseStatusDefinition> {
    return this.prisma.caseStatusDefinition.create({ data: { ...data, companyId } });
  }

  /** Producent/Dystrybutor + zakładanie nowej organizacji — zapis całego domyślnego katalogu naraz, patrz `CaseStatusesService.seedDefaultCatalog`. */
  createMany(
    companyId: string,
    rows: Omit<Prisma.CaseStatusDefinitionCreateManyInput, 'companyId'>[],
  ): Promise<Prisma.BatchPayload> {
    return this.prisma.caseStatusDefinition.createMany({
      data: rows.map((row) => ({ ...row, companyId })),
    });
  }

  update(id: string, data: Prisma.CaseStatusDefinitionUpdateInput): Promise<CaseStatusDefinition> {
    return this.prisma.caseStatusDefinition.update({ where: { id }, data });
  }

  /** Wołane w transakcji z `reorder` — kolejność aktualizowana atomowo dla wszystkich przekazanych wierszy. */
  updateOrder(
    id: string,
    order: number,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<CaseStatusDefinition> {
    return tx.caseStatusDefinition.update({ where: { id }, data: { order } });
  }

  runInTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work);
  }

  /**
   * CASE-015 guard — liczba spraw obecnie mających TEN kod statusu. Wołający
   * (serwis) decyduje, czy to blokuje dezaktywację: blokuje TYLKO gdy sam
   * status nie jest `isFinal` (sprawa w statusie finalnym jest z definicji
   * zamknięta — dezaktywacja takiego statusu jest zawsze bezpieczna, sprawy
   * historyczne dalej go referencjonują, po prostu nie da się go wybrać dla
   * NOWEJ zmiany).
   */
  countCasesUsingCode(code: string, companyId: string): Promise<number> {
    return this.prisma.case.count({ where: { companyId, status: code } });
  }
}
