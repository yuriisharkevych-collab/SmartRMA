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
      portalLogin,
      complaintProcedure,
      requiredDocumentsNote,
      requiredPhotosNote,
      requiredVideosNote,
      complaintEmail,
      requiresSerialNumber,
      requiresFrameNumber,
      requiresProofOfPurchase,
      minPhotos,
      requiresVideo,
      maxPhotos,
      maxAttachmentSizeMb,
      active,
      productCategories,
      sla,
      logistics,
      automation,
    } = manufacturer;

    return {
      id,
      contractorId,
      companyId,
      submissionMethod,
      portalUrl,
      portalLogin,
      complaintProcedure,
      requiredDocumentsNote,
      requiredPhotosNote,
      requiredVideosNote,
      complaintEmail,
      requiresSerialNumber,
      requiresFrameNumber,
      requiresProofOfPurchase,
      minPhotos,
      requiresVideo,
      maxPhotos,
      maxAttachmentSizeMb,
      active,
      productCategories,
      // `portalPasswordEncrypted` CELOWO nieeksponowane — `schema.prisma` oznacza
      // szyfrowanie aplikacyjne tego pola jako niezrealizowane ("BACKEND TODO"),
      // a hasło do portalu producenta musi być odzyskiwalne, nie hashowane.
      // Dopóki szyfrowania nie ma, API go nie zwraca ani nie przyjmuje.
      sla: sla
        ? {
            responseDays: sla.responseDays,
            repairDays: sla.repairDays,
            reminderAfterDays: sla.reminderAfterDays,
            escalationAfterDays: sla.escalationAfterDays,
            statusStaleDaysOverride: sla.statusStaleDaysOverride,
            caseAgeStaleDaysOverride: sla.caseAgeStaleDaysOverride,
          }
        : null,
      logistics: logistics
        ? {
            returnAddress: logistics.returnAddress,
            transportOrganizer: logistics.transportOrganizer,
            manufacturerProvidesLabel: logistics.manufacturerProvidesLabel,
            shopCanOrderCourier: logistics.shopCanOrderCourier,
            // Decimal — `toString()` zamiast `Number()`, żeby nie tracić precyzji kwoty przy serializacji.
            shopCourierCost: logistics.shopCourierCost.toString(),
            originalPackagingRequired: logistics.originalPackagingRequired,
            substitutePackagingAllowed: logistics.substitutePackagingAllowed,
            transportProtectionNote: logistics.transportProtectionNote,
            productConditionNote: logistics.productConditionNote,
          }
        : null,
      automation: automation
        ? {
            autoEmailEnabled: automation.autoEmailEnabled,
            autoCloseEnabled: automation.autoCloseEnabled,
            autoCloseDays: automation.autoCloseDays,
          }
        : null,
    };
  }

  static toEntityList(manufacturers: ManufacturerWithRelations[]): ManufacturerEntity[] {
    return manufacturers.map(ManufacturerMapper.toEntity);
  }
}
