import { Injectable } from '@nestjs/common';
import { Brand, Company, Partnership, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PartnershipWithRelations } from './mappers/partnership.mapper';

const WITH_RELATIONS = {
  shopCompany: { select: { id: true, name: true } },
  distributorCompany: { select: { id: true, name: true } },
  brands: { include: { brand: { select: { id: true, name: true } } } },
} as const;

@Injectable()
export class PartnershipsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Widoczne firmie po OBU stronach (Sklep lub Producent/Dystrybutor) — partnerstwo to relacja dwóch tenantów, nie zasób jednego z nich. */
  findAllForCompany(companyId: string): Promise<PartnershipWithRelations[]> {
    return this.prisma.partnership.findMany({
      where: { OR: [{ shopCompanyId: companyId }, { distributorCompanyId: companyId }] },
      include: WITH_RELATIONS,
      orderBy: { invitedAt: 'desc' },
    });
  }

  /** `companyId` obowiązkowy po OBU stronach `OR` — bez niego dowolna firma mogłaby odczytać cudze partnerstwo, znając samo UUID (IDOR). */
  findById(id: string, companyId: string): Promise<PartnershipWithRelations | null> {
    return this.prisma.partnership.findFirst({
      where: { id, OR: [{ shopCompanyId: companyId }, { distributorCompanyId: companyId }] },
      include: WITH_RELATIONS,
    });
  }

  findByCompanyPair(
    shopCompanyId: string,
    distributorCompanyId: string,
  ): Promise<Partnership | null> {
    return this.prisma.partnership.findUnique({
      where: { shopCompanyId_distributorCompanyId: { shopCompanyId, distributorCompanyId } },
    });
  }

  /** Publiczny Formularz Reklamacyjny (Faza 1) rozwiązuje organizacje wyłącznie po `slug` — Sklep zaprasza partnera tym samym identyfikatorem, nie UUID cudzej firmy. `active: true`, zgodnie z `CompaniesRepository.findBySlug`. */
  findCompanyBySlug(slug: string): Promise<Company | null> {
    return this.prisma.company.findFirst({ where: { slug, active: true } });
  }

  /** PARTNERSHIP-004 — marki proponowane do zaproszenia muszą należeć do WŁASNEGO, samoopisanego profilu zapraszanej organizacji (`Brand.companyId`), nie do katalogu prowadzonego przez kogoś innego. */
  findBrandsOwnedByCompany(brandIds: string[], companyId: string): Promise<Brand[]> {
    if (brandIds.length === 0) return Promise.resolve([]);
    return this.prisma.brand.findMany({ where: { id: { in: brandIds }, companyId } });
  }

  create(
    shopCompanyId: string,
    distributorCompanyId: string,
    invitedByUserId: string,
    brandIds: string[],
  ): Promise<PartnershipWithRelations> {
    return this.prisma.partnership.create({
      data: {
        shopCompanyId,
        distributorCompanyId,
        invitedByUserId,
        brands: { createMany: { data: brandIds.map((brandId) => ({ brandId })) } },
      },
      include: WITH_RELATIONS,
    });
  }

  updateStatus(id: string, data: Prisma.PartnershipUpdateInput): Promise<PartnershipWithRelations> {
    return this.prisma.partnership.update({ where: { id }, data, include: WITH_RELATIONS });
  }
}
