import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageChannel, MessageDirection, SenderType } from '@prisma/client';

export class MessageEntity {
  @ApiProperty() id!: string;
  @ApiProperty() caseId!: string;
  @ApiProperty({ enum: SenderType }) senderType!: SenderType;
  @ApiPropertyOptional({ nullable: true }) senderUserId!: string | null;
  @ApiProperty({ enum: MessageDirection }) direction!: MessageDirection;
  @ApiProperty({ enum: MessageChannel }) channel!: MessageChannel;
  @ApiPropertyOptional({ nullable: true }) subject!: string | null;
  @ApiProperty() content!: string;
  @ApiProperty() sentAt!: Date;
  @ApiPropertyOptional({ nullable: true }) readAt!: Date | null;
}
