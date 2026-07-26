import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

/** `products.manage`. Product = pozycja katalogowa, nie egzemplarz (DATABASE.md §16). */
export class CreateProductDto {
  @ApiProperty() @IsUUID() manufacturerId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() brandId?: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sku?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
}
