import { NotificationChannel, NotificationRecipientType, NotificationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsRepository } from './notifications.repository';

describe('NotificationsRepository', () => {
  let prisma: {
    notification: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    notificationTemplate: { findMany: jest.Mock; findUnique: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let repository: NotificationsRepository;

  beforeEach(() => {
    prisma = {
      notification: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      notificationTemplate: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    repository = new NotificationsRepository(prisma as unknown as PrismaService);
  });

  it('findAllForUser() filtruje po recipientUserId', async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    await repository.findAllForUser('user-1');
    expect(prisma.notification.findMany).toHaveBeenCalledWith({ where: { recipientUserId: 'user-1' }, orderBy: { createdAt: 'desc' }, take: 100 });
  });

  it('findById() odpytuje po id', async () => {
    prisma.notification.findUnique.mockResolvedValue(null);
    await repository.findById('notification-1');
    expect(prisma.notification.findUnique).toHaveBeenCalledWith({ where: { id: 'notification-1' } });
  });

  describe('resolveTemplate', () => {
    it('zwraca szablon PER FIRMA, jeśli istnieje (NOTIFICATIONS.md §2.2 — pierwszeństwo)', async () => {
      const companyTemplate = { id: 'template-company' };
      prisma.notificationTemplate.findFirst.mockResolvedValueOnce(companyTemplate);
      const result = await repository.resolveTemplate('company-1', 'case.created.customer', NotificationChannel.Email);
      expect(result).toBe(companyTemplate);
      expect(prisma.notificationTemplate.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.notificationTemplate.findFirst).toHaveBeenCalledWith({ where: { companyId: 'company-1', code: 'case.created.customer', channel: NotificationChannel.Email, active: true } });
    });

    it('spada do szablonu GLOBALNEGO (companyId=null), jeśli brak per-firmowego', async () => {
      const globalTemplate = { id: 'template-global' };
      prisma.notificationTemplate.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(globalTemplate);
      const result = await repository.resolveTemplate('company-1', 'case.created.customer', NotificationChannel.Email);
      expect(result).toBe(globalTemplate);
      expect(prisma.notificationTemplate.findFirst).toHaveBeenNthCalledWith(2, { where: { companyId: null, code: 'case.created.customer', channel: NotificationChannel.Email, active: true } });
    });

    it('zwraca null, gdy nie istnieje ani per-firmowy, ani globalny (NOTIFICATION-002)', async () => {
      prisma.notificationTemplate.findFirst.mockResolvedValue(null);
      const result = await repository.resolveTemplate('company-1', 'brak.szablonu', NotificationChannel.Email);
      expect(result).toBeNull();
    });
  });

  it('create() zapisuje wiersz Notification wprost', async () => {
    prisma.notification.create.mockResolvedValue({});
    await repository.create({ companyId: 'company-1', channel: NotificationChannel.Email, recipientType: NotificationRecipientType.Customer, body: 'Tresc' });
    expect(prisma.notification.create).toHaveBeenCalledWith({ data: { companyId: 'company-1', channel: NotificationChannel.Email, recipientType: NotificationRecipientType.Customer, body: 'Tresc' } });
  });

  it('markAsRead() ustawia status=Read i readAt', async () => {
    prisma.notification.update.mockResolvedValue({});
    await repository.markAsRead('notification-1');
    const call = prisma.notification.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'notification-1' });
    expect(call.data.status).toBe(NotificationStatus.Read);
    expect(call.data.readAt).toBeInstanceOf(Date);
  });

  it('markAllAsReadForUser() aktualizuje WYŁĄCZNIE wiersze status != Read (naturalna idempotencja) i zwraca liczbę', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 3 });
    const count = await repository.markAllAsReadForUser('user-1');
    expect(count).toBe(3);
    const call = prisma.notification.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ recipientUserId: 'user-1', status: { not: NotificationStatus.Read } });
  });

  it('createTemplate()/updateTemplate() używają PRZEKAZANEGO klienta transakcji, gdy podany', async () => {
    const tx = { notificationTemplate: { create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) } };
    await repository.createTemplate('company-1', { code: 'x', channel: NotificationChannel.Email, bodyTemplate: 'y', variables: [] }, tx as never);
    await repository.updateTemplate('template-1', { active: false }, tx as never);
    expect(tx.notificationTemplate.create).toHaveBeenCalledTimes(1);
    expect(tx.notificationTemplate.update).toHaveBeenCalledTimes(1);
    expect(prisma.notificationTemplate.create).not.toHaveBeenCalled();
    expect(prisma.notificationTemplate.update).not.toHaveBeenCalled();
  });
});
