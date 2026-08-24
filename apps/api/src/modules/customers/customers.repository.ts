import { Injectable } from '@nestjs/common';
import { Customer, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Typy pól zawężone do `Pick<Customer, ...>` (nie `Prisma.CustomerCreateInput`/
 * `UpdateInput` wprost) — ten sam błąd co w `products.repository.ts` (Zadanie 8,
 * naprawiony tam) polegał na przyjmowaniu surowego typu Prisma, przez co
 * repository milcząco pozwalało zapisać dowolne pole modelu (w tym systemowe),
 * jeśli tylko serwis by je podał. Węższy typ wymusza, że jedynym miejscem
 * decydującym, co wolno zapisać, jest DTO + serwis.
 */
@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** `companyId` obowiązkowy — bez niego administrator jednej firmy mógłby odczytać/edytować klienta innej firmy, znając samo UUID (IDOR, patrz audyt bezpieczeństwa). */
  findById(id: string, companyId: string): Promise<Customer | null> {
    return this.prisma.customer.findFirst({ where: { id, companyId } });
  }

  findAllByCompany(companyId: string): Promise<Customer[]> {
    return this.prisma.customer.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } });
  }

  /** BR-011 (dokument źródłowy) — wyszukiwanie po nazwisku/telefonie/e-mailu przy rejestracji reklamacji. */
  search(companyId: string, query: string): Promise<Customer[]> {
    const where: Prisma.CustomerWhereInput = {
      companyId,
      OR: [
        { lastName: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query } },
        { email: { contains: query, mode: 'insensitive' } },
      ],
    };
    return this.prisma.customer.findMany({ where, take: 50 });
  }

  create(
    companyId: string,
    data: {
      firstName: string;
      lastName: string;
      phone: string;
      email?: string;
      address?: string;
      city?: string;
      postalCode?: string;
      notes?: string;
    },
  ): Promise<Customer> {
    return this.prisma.customer.create({ data: { ...data, companyId } });
  }

  /**
   * Publiczny Formularz Reklamacyjny — dopasowanie DOKŁADNE (nie `contains` jak
   * `search()`, celowo inny cel: tam wyszukiwarka pracownika, tu deduplikacja),
   * żeby ten sam klient wypełniający formularz po raz drugi nie dostał drugiego
   * rekordu `Customer`. Dopasowanie po telefonie LUB e-mailu — wystarczy jedno.
   */
  findByPhoneOrEmail(companyId: string, phone: string, email: string): Promise<Customer | null> {
    return this.prisma.customer.findFirst({
      where: { companyId, OR: [{ phone }, { email: { equals: email, mode: 'insensitive' } }] },
    });
  }

  update(
    id: string,
    data: Partial<
      Pick<
        Customer,
        'firstName' | 'lastName' | 'phone' | 'email' | 'address' | 'city' | 'postalCode' | 'notes'
      >
    >,
  ): Promise<Customer> {
    return this.prisma.customer.update({ where: { id }, data });
  }
}
