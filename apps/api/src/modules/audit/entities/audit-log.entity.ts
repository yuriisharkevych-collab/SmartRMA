import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** BR-090: tylko do odczytu z poziomu API — brak endpointów PUT/DELETE w tym module (świadomie). */
export class AuditLogEntity {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) userId!: string | null;
  @ApiProperty() action!: string;
  @ApiProperty() entityType!: string;
  @ApiPropertyOptional({ nullable: true }) entityId!: string | null;
  @ApiPropertyOptional({ nullable: true }) ipAddress!: string | null;
  @ApiProperty() createdAt!: Date;
}
