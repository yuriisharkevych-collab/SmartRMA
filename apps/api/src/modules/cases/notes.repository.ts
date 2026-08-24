import { Injectable } from '@nestjs/common';
import { Note, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Wydzielone z `CasesRepository` (Zadanie 16). `Note` — wyłącznie
 * wewnętrzne, nigdy widoczne dla klienta (DATABASE.md §23). `client`
 * opcjonalny — patrz `AuditRepository.create` (atomowość z transakcją).
 */
@Injectable()
export class NotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    caseId: string,
    userId: string,
    content: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Note> {
    return client.note.create({ data: { caseId, userId, content } });
  }

  findByCaseId(caseId: string): Promise<Note[]> {
    return this.prisma.note.findMany({ where: { caseId }, orderBy: { createdAt: 'desc' } });
  }

  /** `cases.delete` (RBAC.md §5, jedyny hard-delete w aplikacji) — na wyraźne żądanie właściciela, wyłącznie dla usuwania spraw testowych. */
  deleteAllForCase(
    caseId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Prisma.BatchPayload> {
    return client.note.deleteMany({ where: { caseId } });
  }
}
