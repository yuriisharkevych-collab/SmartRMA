import { Company, Shop } from '@prisma/client';
import { CompanyEntity } from '../entities/company.entity';
import { ShopEntity } from '../entities/shop.entity';

export class CompanyMapper {
  static toEntity(company: Company): CompanyEntity {
    const {
      id,
      name,
      type,
      orgKind,
      slug,
      nip,
      regon,
      address,
      email,
      phone,
      website,
      privacyPolicyUrl,
      privacyPolicyVersion,
      termsUrl,
      logoPath,
      active,
      updatedAt,
    } = company;
    return {
      id,
      name,
      type,
      orgKind,
      slug,
      nip,
      regon,
      address,
      email,
      phone,
      website,
      privacyPolicyUrl,
      privacyPolicyVersion,
      termsUrl,
      // `?v=` dokleja znacznik czasu ostatniej zmiany firmy (w tym podmiany logo) — URL jest
      // publiczny i cache'owany 5 minut (`Cache-Control` w kontrolerze), a ścieżka bazowa
      // `/companies/:id/logo` NIE zmienia się przy podmianie pliku. Bez tego `<img src>` (ten
      // sam string) nie odświeżał się w przeglądarce po wgraniu nowego logo — ani w React (brak
      // zmiany propsa), ani przez HTTP cache — trzeba było czekać do 5 minut lub czyścić cache ręcznie.
      logoUrl: logoPath ? `/companies/${id}/logo?v=${updatedAt.getTime()}` : null,
      active,
    };
  }

  static shopToEntity(shop: Shop): ShopEntity {
    const { id, companyId, name, address, city, postalCode, phone, email, active } = shop;
    return { id, companyId, name, address, city, postalCode, phone, email, active };
  }

  static shopsToEntities(shops: Shop[]): ShopEntity[] {
    return shops.map(CompanyMapper.shopToEntity);
  }
}
