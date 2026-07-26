import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductEntity {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty() manufacturerId!: string;
  @ApiPropertyOptional({ nullable: true }) brandId!: string | null;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) sku!: string | null;
  @ApiPropertyOptional({ nullable: true }) category!: string | null;
  @ApiProperty() active!: boolean;
}

export class BrandEntity {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty() manufacturerId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() active!: boolean;
}
