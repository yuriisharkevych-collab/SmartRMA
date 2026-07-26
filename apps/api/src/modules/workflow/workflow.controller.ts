import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CaseStatus } from '@prisma/client';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { CaseStatusTransition } from './case-status-transitions.const';
import { WorkflowService } from './workflow.service';

/**
 * Wyłącznie introspekcja automatu stanów (np. do renderowania w UI listy
 * dozwolonych akcji) — bez `repository`/`dto`/`mapper`/`entity`: nie ma
 * tabeli, tylko stała `CASE_STATE_MACHINE` (patrz plik obok). Dodanie tych
 * warstw byłoby atrapą bez realnej funkcji.
 */
@ApiTags('Workflow')
@ApiBearerAuth()
@Controller('workflow')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get('case-status/transitions')
  @ApiQuery({ name: 'from', enum: CaseStatus })
  @RequirePermissions(PERMISSIONS.CASES_VIEW)
  getTransitions(@Query('from') from: CaseStatus): CaseStatusTransition[] {
    return this.workflowService.getAllowedTransitions(from);
  }
}
