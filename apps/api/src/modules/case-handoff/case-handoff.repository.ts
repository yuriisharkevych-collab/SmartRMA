import { Injectable } from '@nestjs/common';
import { CaseHandoff, Prisma, Product } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CaseHandoffRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** `originCaseId` jest `@unique` w schemacie — najwyżej jedno przekazanie na sprawę jako źródło, patrz PARTNERSHIP-006. */
  findByOriginCaseId(caseId: string): Promise<CaseHandoff | null> {
    return this.prisma.caseHandoff.findUnique({ where: { originCaseId: caseId } });
  }

  /** Odwrotny kierunek — sprawa jako CEL przekazania (widok od strony partnera). */
  findByTargetCaseId(caseId: string): Promise<CaseHandoff | null> {
    return this.prisma.caseHandoff.findUnique({ where: { targetCaseId: caseId } });
  }

  /**
   * `cases.delete` (RBAC.md §5) — `CasesService.hardDelete` musi usunąć
   * łącznik `CaseHandoff` PRZED samym `Case` (klucze obce `originCaseId`/
   * `targetCaseId` wskazują na `Case.id`, bez `onDelete: Cascade` w schemacie
   * — inaczej Postgres odrzuci usunięcie sprawy naruszeniem klucza obcego).
   * Kasowana sprawa może być KTÓRĄKOLWIEK stroną — źródłem JEDNEGO przekazania
   * i/lub celem INNEGO (łańcuch wieloetapowy Sklep→Dystrybutor→Producent, patrz
   * doc-comment modelu `CaseHandoff` w schemacie), stąd `OR`, nie samo
   * `originCaseId` — ten sam wzorzec dwustronnej relacji co
   * `PartnershipsRepository.findAllForCompany` (`OR: [{shopCompanyId},
   * {distributorCompanyId}]`). Kasuje WYŁĄCZNIE sam rekord-łącznik — sprawa
   * po DRUGIEJ stronie (`originCase`/`targetCase`, potencjalnie w INNYM
   * tenancie) oraz jej własne dane pozostają całkowicie nietknięte; to
   * `deleteMany`, nie `delete`, więc brak pasującego wiersza (sprawa bez
   * żadnego przekazania) jest bezpiecznym no-opem, nie błędem.
   */
  deleteAllForCase(
    caseId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Prisma.BatchPayload> {
    return client.caseHandoff.deleteMany({
      where: { OR: [{ originCaseId: caseId }, { targetCaseId: caseId }] },
    });
  }

  create(data: {
    originCaseId: string;
    originCompanyId: string;
    targetCaseId: string;
    targetCompanyId: string;
    partnershipId: string;
    createdByUserId: string;
  }): Promise<CaseHandoff> {
    return this.prisma.caseHandoff.create({ data });
  }

  /**
   * Dopasowanie PO NAZWIE w tenancie PARTNERA (ten sam wzorzec co
   * `IntakeRepository.createFreeTextProduct`) — cel BEZ ludzkiego aktora
   * (`CasesService.create` woła się tu z `actorUserId=null`, jak formularz
   * publiczny), więc `ProductsService.createProduct` (wymaga aktora, patrz
   * `resolveItemProduct`) jest tu celowo pominięty na rzecz bezpośredniego
   * zapisu — katalog partnera i tak nie zna oryginalnego `Product.id` Sklepu
   * (osobne, niepowiązane katalogi).
   */
  async findOrCreateTargetProduct(
    companyId: string,
    manufacturerId: string,
    brandId: string,
    name: string,
  ): Promise<Product> {
    const existing = await this.prisma.product.findFirst({
      where: { companyId, manufacturerId, name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) return existing;
    return this.prisma.product.create({ data: { companyId, manufacturerId, brandId, name } });
  }
}
