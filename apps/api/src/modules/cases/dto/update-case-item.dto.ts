import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * `cases.edit` — poprawa danych pozycji PO utworzeniu sprawy (BR-072/BR-074).
 * Do tej pory jedyna droga poprawienia błędnie wpisanego modelu/producenta/numeru
 * seryjnego był ponowny zapis sprawy od zera — pracownik nie miał żadnej opcji
 * edycji. `productId`/`productName` — jak w `CreateCaseItemDto`, dokładnie jedno
 * z nich, jeśli którekolwiek podano (`CasesService.updateItem` rozstrzyga po
 * nazwie+producencie albo tworzy nowy `Product`, tożsamo z tworzeniem sprawy).
 */
export class UpdateCaseItemDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() productId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() productName?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() brandId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() manufacturerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serialNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() frameNumber?: string;
  @ApiPropertyOptional({ description: 'ISO 8601 (YYYY-MM-DD).' })
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() purchaseProofNumber?: string;
}
