import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/** RBAC.md §3a — "Wysyłanie wiadomości (Message)"; tworzy zawsze senderType=Customer, direction=Inbound, channel=Portal. */
export class SendPortalMessageDto {
  @ApiProperty() @IsString() @MinLength(1) content!: string;
}
