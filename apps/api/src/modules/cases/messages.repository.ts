import { Injectable } from '@nestjs/common';
import { Message, MessageChannel, MessageDirection, Prisma, SenderType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Wydzielone z `CasesRepository` (Zadanie 16). Komunikacja Z klientem —
 * DATABASE.md §24. `client` opcjonalny — patrz `AuditRepository.create`
 * (atomowość z transakcją).
 */
@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    caseId: string,
    data: {
      senderType: SenderType;
      senderUserId?: string;
      direction: MessageDirection;
      channel: MessageChannel;
      subject?: string;
      content: string;
      /** Załączniki — dokumenty wcześniej wgrane do sprawy, patrz `Document.messageId` w schemacie (1 wiadomość : N dokumentów). */
      documentIds?: string[];
    },
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Message> {
    const { documentIds, ...rest } = data;
    return client.message.create({
      data: {
        ...rest,
        caseId,
        ...(documentIds && documentIds.length > 0
          ? { documents: { connect: documentIds.map((id) => ({ id })) } }
          : {}),
      },
    });
  }

  findByCaseId(caseId: string): Promise<Message[]> {
    return this.prisma.message.findMany({ where: { caseId }, orderBy: { sentAt: 'asc' } });
  }

  /** Portal Klienta — dołącza nazwy plików załączników jednym zapytaniem (bez N+1 per wiadomość), patrz `Document.messageId`/`PortalMapper.toMessage`. */
  findByCaseIdWithDocuments(
    caseId: string,
  ): Promise<(Message & { documents: { id: string; fileName: string }[] })[]> {
    return this.prisma.message.findMany({
      where: { caseId },
      orderBy: { sentAt: 'asc' },
      include: { documents: { select: { id: true, fileName: true } } },
    });
  }

  /**
   * Oznacza jako przeczytane wszystkie wiadomości danego kierunku dla tej sprawy —
   * `Inbound` wołane przez pracownika (`CasesService.markMessagesRead`), `Outbound`
   * wołane przez klienta w Portalu (`PortalService.markMessagesRead`). `readAt`
   * na wiadomości oznacza więc zawsze "przeczytane przez ODBIORCĘ", niezależnie od
   * kierunku — jeden wiersz ma tylko jeden kierunek, więc nie ma konfliktu semantyki.
   */
  markAllReadForCase(
    caseId: string,
    direction: MessageDirection,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Prisma.BatchPayload> {
    return client.message.updateMany({
      where: { caseId, direction, readAt: null },
      data: { readAt: new Date() },
    });
  }

  /** Liczba nieprzeczytanych wiadomości danego kierunku — `Inbound` do kafelka/badge'a pracownika, `Outbound` do analogicznego znacznika w Portalu Klienta. */
  countUnread(caseId: string, direction: MessageDirection): Promise<number> {
    return this.prisma.message.count({ where: { caseId, direction, readAt: null } });
  }

  /** `cases.delete` (RBAC.md §5, jedyny hard-delete w aplikacji) — musi wykonać się PO `DocumentsRepository.deleteAllForCase` (`Document.messageId` → `Message`, kolejność FK odwrócona). */
  deleteAllForCase(
    caseId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Prisma.BatchPayload> {
    return client.message.deleteMany({ where: { caseId } });
  }
}
