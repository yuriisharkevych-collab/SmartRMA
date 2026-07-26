import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CaseItemEntity {
  @ApiProperty() id!: string;
  @ApiProperty() caseId!: string;
  @ApiPropertyOptional({ nullable: true }) orderItemId!: string | null;
  @ApiProperty() productId!: string;
  @ApiPropertyOptional({ nullable: true }) manufacturerId!: string | null;
  @ApiProperty() description!: string;
  @ApiProperty() quantity!: number;
}
