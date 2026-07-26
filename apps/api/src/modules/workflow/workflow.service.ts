import { Injectable } from '@nestjs/common';
import { CaseStatus } from '@prisma/client';
import { CASE_STATE_MACHINE, CaseStatusTransition } from './case-status-transitions.const';

/**
 * `case-status.rules.ts` docelowy — dziś tylko odczyt tabeli przejść.
 * `CasesService.changeStatus` (przy implementacji) powinien wołać
 * `isTransitionAllowed` PRZED zapisem (CASE-001), nie duplikować logiki.
 */
@Injectable()
export class WorkflowService {
  getAllowedTransitions(from: CaseStatus): CaseStatusTransition[] {
    return CASE_STATE_MACHINE[from];
  }

  isTransitionAllowed(from: CaseStatus, to: CaseStatus): boolean {
    return CASE_STATE_MACHINE[from].some((transition) => transition.to === to);
  }

  isActiveStatus(status: CaseStatus): boolean {
    return status !== CaseStatus.Zamknieta && status !== CaseStatus.Anulowana && status !== CaseStatus.Zarchiwizowana;
  }
}
