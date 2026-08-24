import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { MessageChannel } from '@prisma/client';
import { ArrayMaxSize, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

/** `messages.send`. `direction=Outbound`, `senderType=Employee` — wymuszone w serwisie, nie tutaj (DATABASE.md §24). */
export class CreateMessageDto {
  @ApiProperty({ enum: MessageChannel }) @IsEnum(MessageChannel) channel!: MessageChannel;
  @ApiProperty({ required: false }) @IsOptional() @IsString() subject?: string;
  @ApiProperty() @IsString() @MinLength(1) content!: string;
  /** Załączniki (0..10) — każdy dokument musi być wcześniej wgrany przez `POST /cases/:id/documents` (ten sam wzorzec co Portal Klienta, patrz `SendPortalMessageDto`). Walidowane w serwisie (muszą należeć do TEJ sprawy). */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(10)
  documentIds?: string[];
}
