import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

/** `products.manage`. Product = pozycja katalogowa, nie egzemplarz (DATABASE.md §16). */
export class CreateProductDto {
  /** Opcjonalny — reklamacja na model, którego producenta/dystrybutora jeszcze nie ma w katalogu, musi dać się zapisać (uzupełnia się go później). */
  @ApiPropertyOptional() @IsOptional() @IsUUID() manufacturerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() brandId?: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sku?: string;
  /** Etap 4 — nowe produkty kategoryzują się przez `categoryId` (FK do `ProductCategory` TEGO SAMEGO producenta), nie wolnym tekstem. */
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
}
