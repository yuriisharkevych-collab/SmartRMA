import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

/** RBAC.md §3a — "Wysyłanie wiadomości (Message)"; tworzy zawsze senderType=Customer, direction=Inbound, channel=Portal. */
export class SendPortalMessageDto {
  @ApiProperty() @IsString() @MinLength(1) content!: string;

  /**
   * Załączniki (0..10) — `id` dokumentów WCZEŚNIEJ wgranych przez `POST /portal/case/documents`
   * (osobny upload multipart, ta sama ścieżka co reszta załączników sprawy). Wiadomość
   * tylko się do nich odwołuje, patrz `Document.messageId` w schemacie.
   */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(10)
  documentIds?: string[];
}
