import { ApiProperty } from '@nestjs/swagger';
import { SenderType } from '@prisma/client';
import { MessageAttachmentEntity } from '../../cases/entities/message.entity';

export class PortalMessageEntity {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: SenderType }) senderType!: SenderType;
  @ApiProperty() content!: string;
  @ApiProperty() sentAt!: Date;
  @ApiProperty({ type: [MessageAttachmentEntity] }) documents!: MessageAttachmentEntity[];
}
