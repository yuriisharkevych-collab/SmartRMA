import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

/** `notifications.templates.manage`. Konwencja `code`: `{eventName}.{odbiorca}` (NOTIFICATIONS.md §2.1, EVENTS.md §11.3). */
export class CreateTemplateDto {
  @ApiProperty({ example: 'case.status_changed.customer' }) @IsString() code!: string;
  @ApiProperty({ enum: NotificationChannel }) @IsEnum(NotificationChannel) channel!: NotificationChannel;
  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string;
  @ApiProperty() @IsString() bodyTemplate!: string;
  @ApiProperty({ type: [String] }) @IsObject() variables!: string[];
}
