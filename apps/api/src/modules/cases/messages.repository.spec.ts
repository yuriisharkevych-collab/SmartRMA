import { MessageChannel, MessageDirection, SenderType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagesRepository } from './messages.repository';

describe('MessagesRepository', () => {
  let prisma: {
    message: { create: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock; count: jest.Mock };
  };
  let repository: MessagesRepository;

  beforeEach(() => {
    prisma = {
      message: { create: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    };
    repository = new MessagesRepository(prisma as unknown as PrismaService);
  });

  it('create() dowiązuje caseId', async () => {
    prisma.message.create.mockResolvedValue({});
    await repository.create('case-1', {
      senderType: SenderType.Employee,
      senderUserId: 'user-1',
      direction: MessageDirection.Outbound,
      channel: MessageChannel.Email,
      content: 'Tresc',
    });
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        senderType: SenderType.Employee,
        senderUserId: 'user-1',
        direction: MessageDirection.Outbound,
        channel: MessageChannel.Email,
        content: 'Tresc',
        caseId: 'case-1',
      },
    });
  });

  it('findByCaseId() sortuje chronologicznie rosnąco', async () => {
    prisma.message.findMany.mockResolvedValue([]);
    await repository.findByCaseId('case-1');
    expect(prisma.message.findMany).toHaveBeenCalledWith({
      where: { caseId: 'case-1' },
      orderBy: { sentAt: 'asc' },
    });
  });

  it('markAllReadForCase() ustawia readAt dla nieprzeczytanych wiadomości podanego kierunku (Inbound — pracownik czyta klienta)', async () => {
    prisma.message.updateMany.mockResolvedValue({ count: 2 });
    await repository.markAllReadForCase('case-1', MessageDirection.Inbound);
    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: { caseId: 'case-1', direction: MessageDirection.Inbound, readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it('markAllReadForCase() działa też dla Outbound — klient czyta wiadomości pracownika w Portalu', async () => {
    prisma.message.updateMany.mockResolvedValue({ count: 1 });
    await repository.markAllReadForCase('case-1', MessageDirection.Outbound);
    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: { caseId: 'case-1', direction: MessageDirection.Outbound, readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it('countUnread() liczy nieprzeczytane wiadomości danego kierunku', async () => {
    prisma.message.count.mockResolvedValue(3);
    const result = await repository.countUnread('case-1', MessageDirection.Outbound);
    expect(prisma.message.count).toHaveBeenCalledWith({
      where: { caseId: 'case-1', direction: MessageDirection.Outbound, readAt: null },
    });
    expect(result).toBe(3);
  });
});
