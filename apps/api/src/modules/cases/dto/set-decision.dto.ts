import { ApiProperty } from '@nestjs/swagger';
import { Decision } from '@prisma/client';
import { IsEnum } from 'class-validator';

/** `cases.decision.set` / `cases.decision.approve` (ZwrotSrodkow, rękojmia — RBAC.md, WORKFLOW.md §8). */
export class SetDecisionDto {
  @ApiProperty({ enum: Decision }) @IsEnum(Decision) decision!: Decision;
}
