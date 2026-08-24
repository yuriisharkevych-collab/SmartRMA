import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Decision, DecisionFulfillmentMethod } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * `cases.decision.set` / `cases.decision.approve` (ZwrotSrodkow — zawsze
 * `.approve`, RBAC.md, WORKFLOW.md §8). Status Workflow Refactor — pola
 * `decisionContractorId`/`decisionJustification`/`decisionFulfillmentMethod`/
 * `decisionManufacturerResponse` rozszerzają decyzję poza sam enum wyniku,
 * żeby Raporty/przyszłe AI mogły analizować DLACZEGO i JAK zrealizowano
 * decyzję, nie tylko jaki był jej kod. Wszystkie opcjonalne — pracownik może
 * nadal zapisać samą decyzję bez dodatkowego kontekstu.
 */
export class SetDecisionDto {
  @ApiProperty({ enum: Decision }) @IsEnum(Decision) decision!: Decision;

  @ApiPropertyOptional({
    description: 'Contractor.id producenta/dystrybutora, który podjął decyzję.',
  })
  @IsOptional()
  @IsUUID()
  decisionContractorId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) decisionJustification?: string;

  @ApiPropertyOptional({ enum: DecisionFulfillmentMethod })
  @IsOptional()
  @IsEnum(DecisionFulfillmentMethod)
  decisionFulfillmentMethod?: DecisionFulfillmentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decisionManufacturerResponse?: string;
}
