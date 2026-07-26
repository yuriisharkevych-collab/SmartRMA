import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubmissionMethod } from '@prisma/client';

export class ManufacturerSlaEntity {
  @ApiPropertyOptional({ nullable: true }) responseDays!: number | null;
  @ApiPropertyOptional({ nullable: true }) repairDays!: number | null;
  @ApiPropertyOptional({ nullable: true }) reminderAfterDays!: number | null;
  @ApiPropertyOptional({ nullable: true }) escalationAfterDays!: number | null;
}

export class ManufacturerEntity {
  @ApiProperty() id!: string;
  @ApiProperty() contractorId!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty({ enum: SubmissionMethod }) submissionMethod!: SubmissionMethod;
  @ApiPropertyOptional({ nullable: true }) portalUrl!: string | null;
  @ApiPropertyOptional({ nullable: true }) complaintProcedure!: string | null;
  @ApiProperty() requiresSerialNumber!: boolean;
  @ApiProperty() requiresFrameNumber!: boolean;
  @ApiProperty() requiresProofOfPurchase!: boolean;
  @ApiProperty() maxPhotos!: number;
  @ApiProperty() maxAttachmentSizeMb!: number;
  @ApiProperty() active!: boolean;
  @ApiPropertyOptional({ type: ManufacturerSlaEntity, nullable: true })
  sla!: ManufacturerSlaEntity | null;
}
