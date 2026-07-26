import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * `orders.manage`. Edytuje wyłącznie pola na poziomie `Order` — DTO celowo
 * NIE zawiera `items`: DATABASE.md/BUSINESS_RULES.md nie opisują semantyki
 * edycji pozycji zamówienia (replace-all vs. patch pojedynczej pozycji vs.
 * dodawanie/usuwanie), a zgadywanie tego byłoby decyzją architektoniczną —
 * patrz raport końcowy Zadania 15. `forbidNonWhitelisted` (main.ts) odrzuci
 * 422-ką każdą próbę przesłania `items` tutaj, zamiast po cichu je ignorować.
 */
export class UpdateOrderDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() shopId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() orderNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() orderDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() totalAmount?: number;
}
