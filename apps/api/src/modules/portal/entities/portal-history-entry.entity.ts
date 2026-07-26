import { ApiProperty } from '@nestjs/swagger';
import { CaseHistoryAction } from '@prisma/client';

/** Filtrowane po `visibleForCustomer=true` (BR-079) w `PortalService`. Nigdy `userId` (RBAC.md §3a). */
export class PortalHistoryEntryEntity {
  @ApiProperty() action!: CaseHistoryAction;
  @ApiProperty({ nullable: true }) newValue!: string | null;
  @ApiProperty() createdAt!: Date;
}
