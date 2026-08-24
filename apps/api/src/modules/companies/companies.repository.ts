import { Injectable } from '@nestjs/common';
import { Company, Shop } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CompaniesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Company | null> {
    return this.prisma.company.findUnique({ where: { id } });
  }

  /**
   * Publiczny Formularz Reklamacyjny — punkt wejścia BEZ sesji/tokenu, więc firma
   * jest rozstrzygana przez `slug` w adresie (`/reklamacja/:orgSlug`), nie przez
   * domyślanie się "jedynej aktywnej firmy" (dawne BR-086 — porzucone: ten sam
   * mechanizm już raz zepsuł formularz, gdy w bazie powstała druga aktywna firma
   * testowa). `active: true` dodatkowo — nieaktywna firma nie ma prawa przyjmować
   * nowych zgłoszeń. Każda organizacja (Sklep, Producent/Dystrybutor) ma własny slug.
   */
  findBySlug(slug: string): Promise<Company | null> {
    return this.prisma.company.findFirst({ where: { slug, active: true } });
  }

  update(
    id: string,
    data: Partial<
      Pick<
        Company,
        | 'name'
        | 'nip'
        | 'regon'
        | 'address'
        | 'email'
        | 'phone'
        | 'website'
        | 'privacyPolicyUrl'
        | 'privacyPolicyVersion'
        | 'termsUrl'
      >
    >,
  ): Promise<Company> {
    return this.prisma.company.update({ where: { id }, data });
  }

  updateLogoPath(id: string, logoPath: string): Promise<Company> {
    return this.prisma.company.update({ where: { id }, data: { logoPath } });
  }

  findShopsByCompany(companyId: string): Promise<Shop[]> {
    return this.prisma.shop.findMany({ where: { companyId } });
  }

  /** `companyId` obowiązkowy — bez niego administrator jednej firmy mógłby odczytać/edytować/dezaktywować placówkę innej firmy, znając samo UUID (IDOR, patrz audyt bezpieczeństwa). */
  findShopById(id: string, companyId: string): Promise<Shop | null> {
    return this.prisma.shop.findFirst({ where: { id, companyId } });
  }

  createShop(
    companyId: string,
    data: {
      name: string;
      address?: string;
      city?: string;
      postalCode?: string;
      phone?: string;
      email?: string;
    },
  ): Promise<Shop> {
    return this.prisma.shop.create({ data: { ...data, companyId } });
  }

  updateShop(
    id: string,
    data: Partial<
      Pick<Shop, 'name' | 'address' | 'city' | 'postalCode' | 'phone' | 'email' | 'active'>
    >,
  ): Promise<Shop> {
    return this.prisma.shop.update({ where: { id }, data });
  }
}
