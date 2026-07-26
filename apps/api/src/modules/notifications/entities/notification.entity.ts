import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel, NotificationRecipientType, NotificationStatus } from '@prisma/client';

export class NotificationEntity {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty({ enum: NotificationChannel }) channel!: NotificationChannel;
  @ApiProperty({ enum: NotificationRecipientType }) recipientType!: NotificationRecipientType;
  @ApiPropertyOptional({ nullable: true }) relatedCaseId!: string | null;
  @ApiPropertyOptional({ nullable: true }) subject!: string | null;
  @ApiProperty() body!: string;
  @ApiProperty({ enum: NotificationStatus }) status!: NotificationStatus;
  @ApiPropertyOptional({ nullable: true }) sentAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) readAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) failureReason!: string | null;
  @ApiProperty() createdAt!: Date;
}
