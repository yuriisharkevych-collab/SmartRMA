import { Brand, Product } from '@prisma/client';
import { BrandEntity, ProductEntity } from '../entities/product.entity';

export class ProductMapper {
  static toEntity(product: Product): ProductEntity {
    const { id, companyId, manufacturerId, brandId, name, sku, category, active } = product;
    return { id, companyId, manufacturerId, brandId, name, sku, category, active };
  }

  static toEntityList(products: Product[]): ProductEntity[] {
    return products.map(ProductMapper.toEntity);
  }

  static brandToEntity(brand: Brand): BrandEntity {
    const {
      id,
      companyId,
      manufacturerId,
      name,
      active,
      requiresSerialNumber,
      requiresFrameNumber,
      requiresProofOfPurchase,
      minPhotos,
      requiresVideo,
      maxPhotos,
      maxAttachmentSizeMb,
      statusStaleDaysOverride,
      caseAgeStaleDaysOverride,
    } = brand;
    return {
      id,
      companyId,
      manufacturerId,
      name,
      active,
      requiresSerialNumber,
      requiresFrameNumber,
      requiresProofOfPurchase,
      minPhotos,
      requiresVideo,
      maxPhotos,
      maxAttachmentSizeMb,
      statusStaleDaysOverride,
      caseAgeStaleDaysOverride,
    };
  }

  static brandsToEntities(brands: Brand[]): BrandEntity[] {
    return brands.map(ProductMapper.brandToEntity);
  }
}
