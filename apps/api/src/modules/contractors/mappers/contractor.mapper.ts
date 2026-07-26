import { Prisma } from '@prisma/client';
import { ContractorEntity } from '../entities/contractor.entity';

export type ContractorWithProfile = Prisma.ContractorGetPayload<{
  include: { manufacturerProfile: true };
}>;

export class ContractorMapper {
  static toEntity(contractor: ContractorWithProfile): ContractorEntity {
    const { id, companyId, name, category, country, nip, address, contactEmail, contactPhone, contactPerson, active } =
      contractor;
    return {
      id,
      companyId,
      name,
      category,
      country,
      nip,
      address,
      contactEmail,
      contactPhone,
      contactPerson,
      active,
      hasManufacturerProfile: contractor.manufacturerProfile !== null,
    };
  }

  static toEntityList(contractors: ContractorWithProfile[]): ContractorEntity[] {
    return contractors.map(ContractorMapper.toEntity);
  }
}
