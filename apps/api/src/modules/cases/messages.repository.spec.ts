import { MessageChannel, MessageDirection, SenderType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagesRepository } from './messages.repository';

describe('MessagesRepository', () => {
  let prisma: { message: { create: jest.Mock; findMany: jest.Mock } };
  let repository: MessagesRepository;

  beforeEach(() => {
    prisma = { message: { create: jest.fn(), findMany: jest.fn() } };
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
      data: { senderType: SenderType.Employee, senderUserId: 'user-1', direction: MessageDirection.Outbound, channel: MessageChannel.Email, content: 'Tresc', caseId: 'case-1' },
    });
  });

  it('findByCaseId() sortuje chronologicznie rosnąco', async () => {
    prisma.message.findMany.mockResolvedValue([]);
    await repository.findByCaseId('case-1');
    expect(prisma.message.findMany).toHaveBeenCalledWith({ where: { caseId: 'case-1' }, orderBy: { sentAt: 'asc' } });
  });
});
