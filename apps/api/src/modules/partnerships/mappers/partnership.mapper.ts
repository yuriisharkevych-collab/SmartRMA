import { Brand, Company, Partnership, PartnershipBrand } from '@prisma/client';
import { PartnershipEntity } from '../entities/partnership.entity';

export type PartnershipWithRelations = Partnership & {
  shopCompany: Pick<Company, 'id' | 'name'>;
  distributorCompany: Pick<Company, 'id' | 'name'>;
  brands: (PartnershipBrand & { brand: Pick<Brand, 'id' | 'name'> })[];
};

export class PartnershipMapper {
  /** `caseCount` przekazywany z zewnątrz — wymaga osobnego zapytania (`PartnershipsRepository.countCasesForPartnership`), którego mapper (czysta funkcja, bez dostępu do Prisma) nie może sam wykonać. */
  static toEntity(row: PartnershipWithRelations, caseCount: number): PartnershipEntity {
    return {
      id: row.id,
      shopCompanyId: row.shopCompanyId,
      shopCompanyName: row.shopCompany.name,
      distributorCompanyId: row.distributorCompanyId,
      distributorCompanyName: row.distributorCompany.name,
      status: row.status,
      invitedByUserId: row.invitedByUserId,
      invitedAt: row.invitedAt,
      acceptedAt: row.acceptedAt,
      deactivatedAt: row.deactivatedAt,
      brands: row.brands.map((b) => ({ id: b.brand.id, name: b.brand.name })),
      caseCount,
      hasPendingInvite: row.status === 'Invited' && row.inviteTokenHash !== null,
      inviteEmail: row.inviteEmail,
    };
  }
}
