import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

/** `notifications.templates.manage`. Konwencja `code`: `{eventName}.{odbiorca}` (NOTIFICATIONS.md §2.1, EVENTS.md §11.3). */
export class CreateTemplateDto {
  @ApiProperty({ example: 'case.status_changed.customer' }) @IsString() code!: string;
  @ApiProperty({ enum: NotificationChannel })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;
  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string;
  @ApiProperty() @IsString() bodyTemplate!: string;
  /** `@IsObject()` odrzucał tu KAŻDĄ tablicę (class-validator jawnie wyklucza `Array.isArray` z `isObject`) — POST nigdy nie przechodził z poprawną tablicą stringów. */
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  variables!: string[];
}
