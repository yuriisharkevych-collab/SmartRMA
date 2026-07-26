import { ApiProperty } from '@nestjs/swagger';
import { MessageChannel } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

/** `messages.send`. `direction=Outbound`, `senderType=Employee` — wymuszone w serwisie, nie tutaj (DATABASE.md §24). */
export class CreateMessageDto {
  @ApiProperty({ enum: MessageChannel }) @IsEnum(MessageChannel) channel!: MessageChannel;
  @ApiProperty({ required: false }) @IsOptional() @IsString() subject?: string;
  @ApiProperty() @IsString() @MinLength(1) content!: string;
}
