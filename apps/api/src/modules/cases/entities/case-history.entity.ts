import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CaseHistoryAction } from '@prisma/client';

export class CaseHistoryEntity {
  @ApiProperty() id!: string;
  @ApiProperty() caseId!: string;
  @ApiPropertyOptional({ nullable: true }) userId!: string | null;
  @ApiProperty({ enum: CaseHistoryAction }) action!: CaseHistoryAction;
  @ApiPropertyOptional({ nullable: true }) previousValue!: string | null;
  @ApiPropertyOptional({ nullable: true }) newValue!: string | null;
  @ApiProperty() visibleForCustomer!: boolean;
  @ApiProperty() createdAt!: Date;
}
