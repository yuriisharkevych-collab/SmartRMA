import { ApiProperty } from '@nestjs/swagger';

export class PortalMessageEntity {
  @ApiProperty() id!: string;
  @ApiProperty() content!: string;
  @ApiProperty() sentAt!: Date;
}
