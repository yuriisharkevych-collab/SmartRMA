import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartnershipStatus } from '@prisma/client';

export class PartnershipBrandSummary {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class PartnershipEntity {
  @ApiProperty() id!: string;
  @ApiProperty() shopCompanyId!: string;
  @ApiProperty() shopCompanyName!: string;
  @ApiProperty() distributorCompanyId!: string;
  @ApiProperty() distributorCompanyName!: string;
  @ApiProperty({ enum: PartnershipStatus }) status!: PartnershipStatus;
  @ApiProperty() invitedByUserId!: string;
  @ApiProperty() invitedAt!: Date;
  @ApiPropertyOptional({ nullable: true }) acceptedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) deactivatedAt!: Date | null;
  @ApiProperty({ type: [PartnershipBrandSummary] }) brands!: PartnershipBrandSummary[];
}
