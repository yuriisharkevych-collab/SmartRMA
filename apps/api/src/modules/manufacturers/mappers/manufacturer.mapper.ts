import { Prisma } from '@prisma/client';
import { ManufacturerEntity } from '../entities/manufacturer.entity';

export type ManufacturerWithRelations = Prisma.ManufacturerGetPayload<{
  include: { sla: true; logistics: true; automation: true };
}>;

export class ManufacturerMapper {
  static toEntity(manufacturer: ManufacturerWithRelations): ManufacturerEntity {
    const {
      id,
      contractorId,
      companyId,
      submissionMethod,
      portalUrl,
      complaintProcedure,
      requiresSerialNumber,
      requiresFrameNumber,
      requiresProofOfPurchase,
      maxPhotos,
      maxAttachmentSizeMb,
      active,
      sla,
    } = manufacturer;

    return {
      id,
      contractorId,
      companyId,
      submissionMethod,
      portalUrl,
      complaintProcedure,
      requiresSerialNumber,
      requiresFrameNumber,
      requiresProofOfPurchase,
      maxPhotos,
      maxAttachmentSizeMb,
      active,
      sla: sla
        ? {
            responseDays: sla.responseDays,
            repairDays: sla.repairDays,
            reminderAfterDays: sla.reminderAfterDays,
            escalationAfterDays: sla.escalationAfterDays,
          }
        : null,
    };
  }

  static toEntityList(manufacturers: ManufacturerWithRelations[]): ManufacturerEntity[] {
    return manufacturers.map(ManufacturerMapper.toEntity);
  }
}
