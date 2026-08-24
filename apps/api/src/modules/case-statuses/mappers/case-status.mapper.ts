import { CaseStatusDefinition } from '@prisma/client';
import { CaseStatusEntity } from '../entities/case-status.entity';

export class CaseStatusMapper {
  static toEntity(status: CaseStatusDefinition): CaseStatusEntity {
    const {
      id,
      code,
      label,
      description,
      order,
      active,
      isFinal,
      isDefaultForNew,
      requiresConfirmation,
      requiredCheck,
      portalStage,
      defaultNextAction,
      notifyCustomerTemplateCode,
      isSystem,
    } = status;
    return {
      id,
      code,
      label,
      description,
      order,
      active,
      isFinal,
      isDefaultForNew,
      requiresConfirmation,
      requiredCheck,
      portalStage,
      defaultNextAction,
      notifyCustomerTemplateCode,
      isSystem,
    };
  }

  static toEntityList(statuses: CaseStatusDefinition[]): CaseStatusEntity[] {
    return statuses.map(CaseStatusMapper.toEntity);
  }
}
