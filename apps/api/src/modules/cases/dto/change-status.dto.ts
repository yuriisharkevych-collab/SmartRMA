import { ApiProperty } from '@nestjs/swagger';
import { CaseStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

/**
 * `cases.status.change`. Dozwolone przejścia z bieżącego statusu —
 * `STATE_MACHINE.md` (CASE-001, jeśli nieosiągalne). Walidacja NIE jest
 * wykonywana w tym DTO — to `case-status.rules.ts` (jeszcze do napisania),
 * patrz `WORKFLOW.md` uwaga na początku ("dozwolone przejścia... w warstwie
 * aplikacji, nie ograniczenie bazy danych").
 */
export class ChangeStatusDto {
  @ApiProperty({ enum: CaseStatus }) @IsEnum(CaseStatus) status!: CaseStatus;
}
