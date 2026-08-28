import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  /** Etap 4 — dezaktywacja pozycji katalogowej (panel: "Dezaktywuj produkt"). Nigdy fizyczne usunięcie — `Product` może mieć historyczne `CaseItem`/`OrderItem` powiązane. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
