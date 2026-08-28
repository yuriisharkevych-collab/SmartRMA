import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

/** `products.manage`. Kategoria należy do dokładnie jednego producenta (ten sam wzorzec co `CreateBrandDto`). */
export class CreateProductCategoryDto {
  @ApiProperty() @IsUUID() manufacturerId!: string;
  @ApiProperty() @IsString() @MinLength(1) name!: string;
}
