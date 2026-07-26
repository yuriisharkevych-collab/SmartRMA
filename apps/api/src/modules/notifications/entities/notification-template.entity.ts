import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel } from '@prisma/client';

export class NotificationTemplateEntity {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true, description: 'null = szablon globalny.' }) companyId!: string | null;
  @ApiProperty() code!: string;
  @ApiProperty({ enum: NotificationChannel }) channel!: NotificationChannel;
  @ApiPropertyOptional({ nullable: true }) subject!: string | null;
  @ApiProperty() bodyTemplate!: string;
  @ApiProperty({ type: [String] }) variables!: string[];
  @ApiProperty() active!: boolean;
}
