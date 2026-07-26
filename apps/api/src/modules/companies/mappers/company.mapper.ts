import { Company, Shop } from '@prisma/client';
import { CompanyEntity } from '../entities/company.entity';
import { ShopEntity } from '../entities/shop.entity';

export class CompanyMapper {
  static toEntity(company: Company): CompanyEntity {
    const { id, name, nip, address, email, phone, active } = company;
    return { id, name, nip, address, email, phone, active };
  }

  static shopToEntity(shop: Shop): ShopEntity {
    const { id, companyId, name, address, city, postalCode, phone, email, active } = shop;
    return { id, companyId, name, address, city, postalCode, phone, email, active };
  }

  static shopsToEntities(shops: Shop[]): ShopEntity[] {
    return shops.map(CompanyMapper.shopToEntity);
  }
}
