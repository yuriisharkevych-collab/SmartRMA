import { Notification, NotificationTemplate } from '@prisma/client';
import { NotificationTemplateEntity } from '../entities/notification-template.entity';
import { NotificationEntity } from '../entities/notification.entity';

export class NotificationMapper {
  static toEntity(notification: Notification): NotificationEntity {
    const {
      id,
      companyId,
      channel,
      recipientType,
      relatedCaseId,
      subject,
      body,
      status,
      sentAt,
      readAt,
      failureReason,
      createdAt,
    } = notification;
    return {
      id,
      companyId,
      channel,
      recipientType,
      relatedCaseId,
      subject,
      body,
      status,
      sentAt,
      readAt,
      failureReason,
      createdAt,
    };
  }

  static toEntityList(notifications: Notification[]): NotificationEntity[] {
    return notifications.map(NotificationMapper.toEntity);
  }

  static templateToEntity(template: NotificationTemplate): NotificationTemplateEntity {
    const { id, companyId, code, channel, subject, bodyTemplate, variables, active } = template;
    return {
      id,
      companyId,
      code,
      channel,
      subject,
      bodyTemplate,
      variables: variables as string[],
      active,
    };
  }

  static templatesToEntities(templates: NotificationTemplate[]): NotificationTemplateEntity[] {
    return templates.map(NotificationMapper.templateToEntity);
  }
}
