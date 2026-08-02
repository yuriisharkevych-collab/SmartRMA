import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CaseItemEntity {
  @ApiProperty() id!: string;
  @ApiProperty() caseId!: string;
  @ApiPropertyOptional({ nullable: true }) orderItemId!: string | null;
  @ApiProperty() productId!: string;
  @ApiPropertyOptional({ nullable: true }) manufacturerId!: string | null;
  @ApiProperty() description!: string;
  @ApiProperty() quantity!: number;

  /** Dane egzemplarza — nullable, bo nie każdy produkt/producent ich wymaga (patrz `Manufacturer.requiresSerialNumber` itd., CASE-004/005/006). */
  @ApiPropertyOptional({ nullable: true }) serialNumber!: string | null;
  @ApiPropertyOptional({ nullable: true }) frameNumber!: string | null;
  @ApiPropertyOptional({ nullable: true }) purchaseDate!: Date | null;
  @ApiPropertyOptional({ nullable: true }) purchaseProofNumber!: string | null;
}
