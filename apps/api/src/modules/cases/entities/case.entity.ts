import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CasePriority,
  CaseStatus,
  ComplaintSource,
  ComplaintType,
  Decision,
  SubmissionMode,
} from '@prisma/client';
import { CaseItemEntity } from './case-item.entity';

export class CaseEntity {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiPropertyOptional({ nullable: true }) shopId!: string | null;
  @ApiProperty() caseNumber!: string;
  @ApiProperty() customerId!: string;
  @ApiPropertyOptional({ nullable: true }) ownerId!: string | null;

  @ApiProperty({ enum: ComplaintType }) complaintType!: ComplaintType;
  @ApiProperty({ enum: SubmissionMode }) submissionMode!: SubmissionMode;
  @ApiProperty({ enum: ComplaintSource }) source!: ComplaintSource;

  @ApiProperty() requestedResolution!: string;
  @ApiProperty() description!: string;
  @ApiPropertyOptional({ nullable: true }) customerStatement!: string | null;

  @ApiProperty({ enum: CaseStatus }) status!: CaseStatus;
  @ApiProperty({ enum: CasePriority }) priority!: CasePriority;

  @ApiPropertyOptional({ enum: Decision, nullable: true }) decision!: Decision | null;
  @ApiPropertyOptional({ nullable: true }) decisionAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) decisionByUserId!: string | null;

  @ApiPropertyOptional({ nullable: true }) nextAction!: string | null;
  @ApiPropertyOptional({ nullable: true }) nextActionDueDate!: Date | null;

  @ApiProperty() requiresManagerApproval!: boolean;
  @ApiProperty() isException!: boolean;
  @ApiProperty() clientPortalEnabled!: boolean;

  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional({ nullable: true }) closedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) cancelledAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) archivedAt!: Date | null;

  @ApiProperty({ type: [CaseItemEntity] }) items!: CaseItemEntity[];
}
