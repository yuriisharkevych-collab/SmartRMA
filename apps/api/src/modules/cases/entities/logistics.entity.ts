import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LogisticsStatus, LogisticsType } from '@prisma/client';

export class LogisticsEntity {
  @ApiProperty() id!: string;
  @ApiProperty() caseId!: string;
  @ApiProperty({ enum: LogisticsType }) type!: LogisticsType;
  @ApiProperty({ enum: LogisticsStatus }) status!: LogisticsStatus;
  @ApiPropertyOptional({ nullable: true }) trackingNumber!: string | null;
}
