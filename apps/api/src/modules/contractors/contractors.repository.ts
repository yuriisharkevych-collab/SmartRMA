import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ContractorWithProfile } from './mappers/contractor.mapper';

const WITH_PROFILE = { manufacturerProfile: true } as const;

@Injectable()
export class ContractorsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllForCompany(companyId: string): Promise<ContractorWithProfile[]> {
    return this.prisma.contractor.findMany({ where: { companyId }, include: WITH_PROFILE });
  }

  /** `companyId` obowiązkowy — bez niego administrator jednej firmy mógłby odczytać/edytować kontrahenta innej firmy, znając samo UUID (IDOR, patrz audyt bezpieczeństwa). */
  findById(id: string, companyId: string): Promise<ContractorWithProfile | null> {
    return this.prisma.contractor.findFirst({ where: { id, companyId }, include: WITH_PROFILE });
  }

  create(
    companyId: string,
    data: Omit<Prisma.ContractorUncheckedCreateInput, 'companyId'>,
  ): Promise<ContractorWithProfile> {
    return this.prisma.contractor.create({ data: { ...data, companyId }, include: WITH_PROFILE });
  }

  update(id: string, data: Prisma.ContractorUpdateInput): Promise<ContractorWithProfile> {
    return this.prisma.contractor.update({ where: { id }, data, include: WITH_PROFILE });
  }
}
