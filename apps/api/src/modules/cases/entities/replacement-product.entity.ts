import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReplacementProductEntity {
  @ApiProperty() id!: string;
  @ApiProperty() caseItemId!: string;
  @ApiProperty() productIdentifier!: string;
  @ApiProperty() issuedAt!: Date;
  @ApiPropertyOptional({ nullable: true }) plannedReturnAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) returnedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) conditionOnReturn!: string | null;
}
