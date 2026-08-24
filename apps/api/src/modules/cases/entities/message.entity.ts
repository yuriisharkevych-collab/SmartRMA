import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageChannel, MessageDirection, SenderType } from '@prisma/client';

export class MessageAttachmentEntity {
  @ApiProperty() id!: string;
  @ApiProperty() fileName!: string;
}

export class MessageEntity {
  @ApiProperty() id!: string;
  @ApiProperty() caseId!: string;
  @ApiProperty({ enum: SenderType }) senderType!: SenderType;
  @ApiPropertyOptional({ nullable: true }) senderUserId!: string | null;
  @ApiProperty({ enum: MessageDirection }) direction!: MessageDirection;
  @ApiProperty({ enum: MessageChannel }) channel!: MessageChannel;
  @ApiPropertyOptional({ nullable: true }) subject!: string | null;
  @ApiProperty() content!: string;
  /** Załączniki — dociągnięte jednym JOIN-em (`MessagesRepository.findByCaseIdWithDocuments`), żeby UI mógł pokazać linki bez osobnego zapytania per wiadomość. */
  @ApiProperty({ type: [MessageAttachmentEntity] }) documents!: MessageAttachmentEntity[];
  @ApiProperty() sentAt!: Date;
  @ApiPropertyOptional({ nullable: true }) readAt!: Date | null;
}
