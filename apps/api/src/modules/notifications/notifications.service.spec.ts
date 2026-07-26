import { NotFoundException } from '@nestjs/common';
import { Notification, NotificationChannel, NotificationRecipientType, NotificationStatus, NotificationTemplate } from '@prisma/client';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

function buildNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notification-1',
    companyId: 'company-1',
    templateId: 'template-1',
    channel: NotificationChannel.Email,
    recipientType: NotificationRecipientType.Customer,
    recipientUserId: null,
    recipientManufacturerId: null,
    recipientEmail: 'klient@example.com',
    recipientPhone: null,
    relatedCaseId: 'case-1',
    subject: 'Temat',
    body: 'Tresc',
    status: NotificationStatus.Pending,
    sentAt: null,
    readAt: null,
    failureReason: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  } as Notification;
}

function buildTemplate(overrides: Partial<NotificationTemplate> = {}): NotificationTemplate {
  return {
    id: 'template-1',
    companyId: null,
    code: 'case.created.customer',
    channel: NotificationChannel.Email,
    subject: 'Zgłoszenie {{caseNumber}} przyjęte',
    bodyTemplate: 'Witaj {{customerName}}, sprawa {{caseNumber}} dot. {{productModel}} została zarejestrowana.',
    variables: ['caseNumber', 'customerName', 'productModel'],
    active: true,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  } as NotificationTemplate;
}

describe('NotificationsService', () => {
  let notificationsRepository: jest.Mocked<
    Pick<
      NotificationsRepository,
      'findAllForCompany' | 'findAllForCase' | 'findAllForUser' | 'findById' | 'resolveTemplate' | 'create' | 'markAsRead' | 'markAllAsReadForUser' | 'findTemplatesForCompany' | 'findTemplateById' | 'createTemplate' | 'updateTemplate'
    >
  >;
  let service: NotificationsService;

  beforeEach(() => {
    notificationsRepository = {
      findAllForCompany: jest.fn(),
      findAllForCase: jest.fn(),
      findAllForUser: jest.fn(),
      findById: jest.fn(),
      resolveTemplate: jest.fn(),
      create: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsReadForUser: jest.fn(),
      findTemplatesForCompany: jest.fn(),
      findTemplateById: jest.fn(),
      createTemplate: jest.fn(),
      updateTemplate: jest.fn(),
    };
    service = new NotificationsService(notificationsRepository as unknown as NotificationsRepository);
  });

  describe('getMyNotification / markAsRead — izolacja właściciela', () => {
    it('getMyNotification() rzuca NotFoundException, gdy powiadomienie należy do INNEGO użytkownika', async () => {
      notificationsRepository.findById.mockResolvedValue(buildNotification({ recipientUserId: 'user-2' }));
      await expect(service.getMyNotification('user-1', 'notification-1')).rejects.toThrow(NotFoundException);
    });

    it('markAsRead() rzuca NotFoundException, gdy powiadomienie należy do INNEGO użytkownika', async () => {
      notificationsRepository.findById.mockResolvedValue(buildNotification({ recipientUserId: 'user-2' }));
      await expect(service.markAsRead('user-1', 'notification-1')).rejects.toThrow(NotFoundException);
      expect(notificationsRepository.markAsRead).not.toHaveBeenCalled();
    });

    it('markAsRead() jest IDEMPOTENTNE — jeśli już Read, zwraca bez ponownego zapisu (bez nadpisania readAt)', async () => {
      const alreadyRead = buildNotification({ recipientUserId: 'user-1', status: NotificationStatus.Read, readAt: new Date('2026-01-01') });
      notificationsRepository.findById.mockResolvedValue(alreadyRead);

      const result = await service.markAsRead('user-1', 'notification-1');

      expect(result.status).toBe(NotificationStatus.Read);
      expect(notificationsRepository.markAsRead).not.toHaveBeenCalled();
    });

    it('markAsRead() zapisuje status=Read dla własnego, nieprzeczytanego powiadomienia', async () => {
      notificationsRepository.findById.mockResolvedValue(buildNotification({ recipientUserId: 'user-1', status: NotificationStatus.Pending }));
      notificationsRepository.markAsRead.mockResolvedValue(buildNotification({ recipientUserId: 'user-1', status: NotificationStatus.Read }));

      const result = await service.markAsRead('user-1', 'notification-1');

      expect(result.status).toBe(NotificationStatus.Read);
      expect(notificationsRepository.markAsRead).toHaveBeenCalledWith('notification-1');
    });
  });

  describe('markAllAsRead', () => {
    it('deleguje do markAllAsReadForUser() i zwraca liczbę zaktualizowanych', async () => {
      notificationsRepository.markAllAsReadForUser.mockResolvedValue(5);
      const result = await service.markAllAsRead('user-1');
      expect(result).toEqual({ updatedCount: 5 });
    });

    it('WIELOKROTNE wywołanie jest idempotentne — druga próba zwraca 0 (naturalna idempotencja przez WHERE w repozytorium)', async () => {
      notificationsRepository.markAllAsReadForUser.mockResolvedValueOnce(5).mockResolvedValueOnce(0);
      await service.markAllAsRead('user-1');
      const second = await service.markAllAsRead('user-1');
      expect(second).toEqual({ updatedCount: 0 });
    });
  });

  describe('createNotificationFromTemplate', () => {
    const baseParams = {
      companyId: 'company-1',
      code: 'case.created.customer',
      channel: NotificationChannel.Email,
      recipientType: NotificationRecipientType.Customer,
      relatedCaseId: 'case-1',
      variables: { caseNumber: 'RMA/2026/00001', customerName: 'Jan Kowalski', productModel: 'Rower X' },
    };

    it('zwraca null i NIE tworzy rekordu, gdy brak szablonu (NOTIFICATION-002) — zdarzenie wyzwalające i tak kończy się sukcesem (NOTIFICATIONS.md §8)', async () => {
      notificationsRepository.resolveTemplate.mockResolvedValue(null);
      const result = await service.createNotificationFromTemplate({ ...baseParams, recipientEmail: 'klient@example.com' });
      expect(result).toBeNull();
      expect(notificationsRepository.create).not.toHaveBeenCalled();
    });

    it('podstawia zmienne {{}} w bodyTemplate/subject (NOTIFICATIONS.md §2.3)', async () => {
      notificationsRepository.resolveTemplate.mockResolvedValue(buildTemplate());
      notificationsRepository.create.mockResolvedValue(buildNotification());

      await service.createNotificationFromTemplate({ ...baseParams, recipientEmail: 'klient@example.com' });

      const call = notificationsRepository.create.mock.calls[0][0];
      expect(call.body).toBe('Witaj Jan Kowalski, sprawa RMA/2026/00001 dot. Rower X została zarejestrowana.');
      expect(call.subject).toBe('Zgłoszenie RMA/2026/00001 przyjęte');
      expect(call.templateId).toBe('template-1');
    });

    it('ustawia status=Failed natychmiast, gdy kanał=Email i brak recipientEmail (NOTIFICATIONS.md §8 — "bez próby wysyłki na pusty adres")', async () => {
      notificationsRepository.resolveTemplate.mockResolvedValue(buildTemplate());
      notificationsRepository.create.mockResolvedValue(buildNotification({ status: NotificationStatus.Failed }));

      await service.createNotificationFromTemplate({ ...baseParams, recipientEmail: undefined });

      const call = notificationsRepository.create.mock.calls[0][0];
      expect(call.status).toBe(NotificationStatus.Failed);
      expect(call.failureReason).toBe('Brak adresu odbiorcy');
    });

    it('NIE ustawia Failed dla kanału System bez recipientEmail (recipientUserId wystarcza)', async () => {
      notificationsRepository.resolveTemplate.mockResolvedValue(buildTemplate({ channel: NotificationChannel.System }));
      notificationsRepository.create.mockResolvedValue(buildNotification({ channel: NotificationChannel.System }));

      await service.createNotificationFromTemplate({ ...baseParams, channel: NotificationChannel.System, recipientType: NotificationRecipientType.Employee, recipientUserId: 'user-2' });

      const call = notificationsRepository.create.mock.calls[0][0];
      expect(call.status).toBeUndefined();
      expect(call.failureReason).toBeUndefined();
    });
  });

  describe('updateTemplate', () => {
    it('rzuca NotFoundException, gdy szablon nie istnieje', async () => {
      notificationsRepository.findTemplateById.mockResolvedValue(null);
      await expect(service.updateTemplate('brak', { active: false })).rejects.toThrow(NotFoundException);
      expect(notificationsRepository.updateTemplate).not.toHaveBeenCalled();
    });
  });
});
