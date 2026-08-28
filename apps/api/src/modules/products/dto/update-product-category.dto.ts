import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

/** `products.manage`. Zmiana nazwy/dezaktywacja — NIGDY fizyczne usunięcie (`Product.categoryId` historycznych produktów musi zostać nietknięte). */
export class UpdateProductCategoryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
