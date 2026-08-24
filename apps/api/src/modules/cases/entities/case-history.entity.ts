import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CaseHistoryAction } from '@prisma/client';

export class CaseHistoryEntity {
  @ApiProperty() id!: string;
  @ApiProperty() caseId!: string;
  @ApiPropertyOptional({ nullable: true }) userId!: string | null;
  /** Dociągnięte JOIN-em (`CaseHistoryRepository.findByCaseId`) — UI pokazuje nazwisko autora bez potrzeby osobnego uprawnienia `users.view` (Pracownik go nie ma, patrz `CaseDetailPage`). `null` dla wpisów systemowych (`userId=null`). */
  @ApiPropertyOptional({ nullable: true }) userFirstName!: string | null;
  @ApiPropertyOptional({ nullable: true }) userLastName!: string | null;
  @ApiProperty({ enum: CaseHistoryAction }) action!: CaseHistoryAction;
  @ApiPropertyOptional({ nullable: true }) previousValue!: string | null;
  @ApiPropertyOptional({ nullable: true }) newValue!: string | null;
  @ApiProperty() visibleForCustomer!: boolean;
  @ApiProperty() createdAt!: Date;
}
