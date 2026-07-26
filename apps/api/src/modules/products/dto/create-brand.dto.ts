import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

/** `brands.manage`. Marka należy do dokładnie jednego producenta (BUSINESS_RULES.md, DATABASE.md §15). */
export class CreateBrandDto {
  @ApiProperty() @IsUUID() manufacturerId!: string;
  @ApiProperty() @IsString() name!: string;
}
