import { Injectable } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Insert-only od strony aplikacji (BR-090) — brak metod `update`/`delete`
 * tutaj celowo.
 *
 * Zadanie 12 (Companies) — dodano `create()`. Wcześniejszy komentarz tego
 * pliku mówił "zapis wpisów przy implementacji logiki domenowej, nie w tym
 * repozytorium" — ale item 11 tamtego/tego zadania ("nie ma bezpośrednich
 * wywołań Prisma poza Repository") wymaga, żeby KAŻDE wywołanie
 * `prisma.auditLog.*` żyło właśnie tutaj, nie w serwisach domenowych.
 * `AuditRepository` pozostaje jedynym miejscem znającym tabelę `AuditLog`;
 * serwisy domenowe (np. `CompaniesService`) wołają tę metodę, nie Prismę
 * bezpośrednio.
 */
@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllForCompany(companyId: string, filter: Prisma.AuditLogWhereInput = {}) {
    return this.prisma.auditLog.findMany({
      where: { companyId, ...filter },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /**
   * BR-088 — kto/kiedy/co/jaka encja/poprzednia i nowa wartość jako dane
   * strukturalne. `client` opcjonalny (domyślnie `this.prisma`) — pozwala
   * wołającemu przekazać klienta transakcji Prisma (`tx` z
   * `prisma.$transaction(async (tx) => ...)`), żeby zapis audytu był
   * atomowy razem z mutacją encji domenowej (EVENTS.md §6.1/§1.2 —
   * niezmienniki w tej samej transakcji). Domyślna wartość zachowuje pełną
   * kompatybilność wsteczną dla wszystkich istniejących wywołań spoza
   * transakcji (Companies/Customers/Products/Orders).
   */
  create(
    data: Prisma.AuditLogUncheckedCreateInput,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<AuditLog> {
    return client.auditLog.create({ data });
  }
}
