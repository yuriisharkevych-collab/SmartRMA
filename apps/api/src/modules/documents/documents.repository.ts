import { Injectable } from '@nestjs/common';
import { Document, DocumentCategory, DocumentStatus, DocumentType, DocumentVisibility, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaClientLike = Prisma.TransactionClient | PrismaService;

/**
 * Czyste operacje na danych — bez zapisu `CaseHistory`/`AuditLog`, bez
 * publikacji zdarzeń (to wszystko żyje w `DocumentsService`). `create()`
 * zawężone do jawnego typu (nie `Prisma.DocumentUncheckedCreateInput`
 * wprost) — ten sam błąd naprawiony w Zadaniu 14 dla `ProductsRepository`.
 * Metody mutujące przyjmują opcjonalny `client` (domyślnie `this.prisma`) —
 * wzorzec transakcyjny z `CasesRepository`/`AuditRepository` (Zadanie 16).
 */
@Injectable()
export class DocumentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllForCase(caseId: string): Promise<Document[]> {
    return this.prisma.document.findMany({ where: { caseId }, orderBy: { uploadedAt: 'desc' } });
  }

  findById(id: string): Promise<Document | null> {
    return this.prisma.document.findUnique({ where: { id } });
  }

  create(
    caseId: string,
    uploadedById: string,
    data: {
      caseItemId?: string;
      fileName: string;
      fileType: DocumentType;
      mimeType: string;
      fileSize: number;
      storagePath: string;
      category?: DocumentCategory;
      visibility?: DocumentVisibility;
    },
    client: PrismaClientLike = this.prisma,
  ): Promise<Document> {
    return client.document.create({ data: { ...data, caseId, uploadedById } });
  }

  /** BR-020/DATABASE.md §25 — brak `delete`, wyłącznie zmiana statusu. */
  markInvalid(id: string, client: PrismaClientLike = this.prisma): Promise<Document> {
    return client.document.update({ where: { id }, data: { status: DocumentStatus.Bledny } });
  }
}
