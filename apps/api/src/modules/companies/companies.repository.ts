import { Injectable } from '@nestjs/common';
import { Company, Shop } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CompaniesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Company | null> {
    return this.prisma.company.findUnique({ where: { id } });
  }

  update(id: string, data: Partial<Pick<Company, 'name' | 'nip' | 'address' | 'email' | 'phone'>>): Promise<Company> {
    return this.prisma.company.update({ where: { id }, data });
  }

  findShopsByCompany(companyId: string): Promise<Shop[]> {
    return this.prisma.shop.findMany({ where: { companyId } });
  }

  findShopById(id: string): Promise<Shop | null> {
    return this.prisma.shop.findUnique({ where: { id } });
  }

  createShop(
    companyId: string,
    data: { name: string; address?: string; city?: string; postalCode?: string; phone?: string; email?: string },
  ): Promise<Shop> {
    return this.prisma.shop.create({ data: { ...data, companyId } });
  }

  updateShop(
    id: string,
    data: Partial<Pick<Shop, 'name' | 'address' | 'city' | 'postalCode' | 'phone' | 'email' | 'active'>>,
  ): Promise<Shop> {
    return this.prisma.shop.update({ where: { id }, data });
  }
}
