import { Injectable } from '@nestjs/common';
import { AuditRepository } from './audit.repository';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { AuditLogEntity } from './entities/audit-log.entity';
import { AuditLogMapper } from './mappers/audit-log.mapper';

@Injectable()
export class AuditService {
  constructor(private readonly auditRepository: AuditRepository) {}

  async findAllForCompany(companyId: string, query: QueryAuditLogDto): Promise<AuditLogEntity[]> {
    const logs = await this.auditRepository.findAllForCompany(companyId, {
      entityType: query.entityType,
      entityId: query.entityId,
      userId: query.userId,
    });
    return AuditLogMapper.toEntityList(logs);
  }
}
