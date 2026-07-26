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
    },
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Message> {
    return client.message.create({ data: { ...data, caseId } });
  }

  findByCaseId(caseId: string): Promise<Message[]> {
    return this.prisma.message.findMany({ where: { caseId }, orderBy: { sentAt: 'asc' } });
  }
}
