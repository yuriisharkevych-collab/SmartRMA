import { AuditLog } from '@prisma/client';
import { AuditLogEntity } from '../entities/audit-log.entity';

export class AuditLogMapper {
  static toEntity(log: AuditLog): AuditLogEntity {
    const { id, userId, action, entityType, entityId, ipAddress, createdAt } = log;
    return { id, userId, action, entityType, entityId, ipAddress, createdAt };
  }

  static toEntityList(logs: AuditLog[]): AuditLogEntity[] {
    return logs.map(AuditLogMapper.toEntity);
  }
}
