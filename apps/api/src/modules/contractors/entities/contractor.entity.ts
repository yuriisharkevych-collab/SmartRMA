import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContractorCategory } from '@prisma/client';

export class ContractorEntity {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ContractorCategory }) category!: ContractorCategory;
  @ApiPropertyOptional({ nullable: true }) country!: string | null;
  @ApiPropertyOptional({ nullable: true }) nip!: string | null;
  @ApiPropertyOptional({ nullable: true }) address!: string | null;
  @ApiPropertyOptional({ nullable: true }) contactEmail!: string | null;
  @ApiPropertyOptional({ nullable: true }) contactPhone!: string | null;
  @ApiPropertyOptional({ nullable: true }) contactPerson!: string | null;
  @ApiProperty() active!: boolean;
  @ApiProperty({ description: 'Czy kontrahent ma profil Manufacturer (DATABASE.md §0).' })
  hasManufacturerProfile!: boolean;
}
