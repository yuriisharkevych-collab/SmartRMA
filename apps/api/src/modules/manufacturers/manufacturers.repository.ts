import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ManufacturerWithRelations } from './mappers/manufacturer.mapper';

const WITH_RELATIONS = { sla: true, logistics: true, automation: true } as const;

@Injectable()
export class ManufacturersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllForCompany(companyId: string): Promise<ManufacturerWithRelations[]> {
    return this.prisma.manufacturer.findMany({ where: { companyId }, include: WITH_RELATIONS });
  }

  findById(id: string): Promise<ManufacturerWithRelations | null> {
    return this.prisma.manufacturer.findUnique({ where: { id }, include: WITH_RELATIONS });
  }

  create(
    companyId: string,
    data: Omit<Prisma.ManufacturerUncheckedCreateInput, 'companyId'>,
  ): Promise<ManufacturerWithRelations> {
    return this.prisma.manufacturer.create({ data: { ...data, companyId }, include: WITH_RELATIONS });
  }

  update(id: string, data: Prisma.ManufacturerUpdateInput): Promise<ManufacturerWithRelations> {
    return this.prisma.manufacturer.update({ where: { id }, data, include: WITH_RELATIONS });
  }

  upsertSla(
    manufacturerId: string,
    data: Partial<{
      responseDays: number | null;
      repairDays: number | null;
      reminderAfterDays: number | null;
      escalationAfterDays: number | null;
    }>,
  ): Promise<ManufacturerWithRelations> {
    return this.prisma.manufacturer.update({
      where: { id: manufacturerId },
      data: { sla: { upsert: { create: data, update: data } } },
      include: WITH_RELATIONS,
    });
  }
}
