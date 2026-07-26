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

  findById(id: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({ where: { id } });
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
    data: { firstName: string; lastName: string; phone: string; email?: string; address?: string; notes?: string },
  ): Promise<Customer> {
    return this.prisma.customer.create({ data: { ...data, companyId } });
  }

  update(
    id: string,
    data: Partial<Pick<Customer, 'firstName' | 'lastName' | 'phone' | 'email' | 'address' | 'notes'>>,
  ): Promise<Customer> {
    return this.prisma.customer.update({ where: { id }, data });
  }
}
