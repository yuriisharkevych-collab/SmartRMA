import { Injectable } from '@nestjs/common';
import { CaseHistoryAction } from '@prisma/client';
import {
  CaseDecisionSetPayload,
  CaseStatusChangedPayload,
} from '../../../events/contracts/case.events';
import { DomainEventHandler } from '../../../events/decorators/domain-event-handler.decorator';
import { DomainEvent } from '../../../events/domain-event.base';
import { EVENT_NAMES } from '../../../events/event-names.const';
import { IdempotencyService } from '../../../events/idempotency.service';
import { CaseStatusesService } from '../../case-statuses/case-statuses.service';
import { CasesService } from '../../cases/cases.service';
import { CompaniesService } from '../../companies/companies.service';
import { CaseHandoffRepository } from '../case-handoff.repository';

/** Zabezpieczenie przed nieskończoną pętlą przy uszkodzonych/cyklicznych danych — łańcuch Sklep→Dystrybutor→Producent w praktyce ma 2-3 ogniwa, 20 to already absurdalnie dużo. */
const MAX_CHAIN_HOPS = 20;

/**
 * Plan Fazy 5/6 — "nowe zdarzenie domenowe `CaseHandoffStatusChanged`, ten sam
 * wzorzec co `case.closed.customer`, wyświetlane jako baner 'aktualizacja od
 * partnera', NIE pole na żywo": subskrybuje ISTNIEJĄCE `case.status_changed`/
 * `case.decision_set` (właściciel agregatu `Case` już je publikuje, EVENTS.md
 * §6.2 — "publikuje wyłącznie moduł-właściciel", subskrybować może każdy),
 * bez nowego eventName. Gdy zmieniona sprawa jest CELEM (`targetCaseId`)
 * jakiegoś `CaseHandoff`, dokleja WYŁĄCZNIE nieczułą notatkę
 * (`HandoffPartnerUpdate`) do sprawy ŹRÓDŁOWEJ — nigdy pełnych danych sprawy
 * partnera.
 *
 * Faza 6 (trasy wieloetapowe) — dokleja notatkę do CAŁEGO łańcucha
 * przodków, nie tylko bezpośredniego rodzica: przy Sklep→Dystrybutor→
 * Producent decyzja Producenta musi dotrzeć zarówno do sprawy Dystrybutora,
 * jak i do oryginalnej sprawy Sklepu — bo `appendCaseHistory` samo w sobie
 * NIE publikuje nowego `case.status_changed`/`case.decision_set` (to zwykły
 * zapis do dziennika, nie mutacja `Case.status/decision`), więc bez
 * jawnego wejścia w pętlę tutaj aktualizacja zatrzymałaby się na
 * pierwszym ogniwie. Każdy hop = kolejny, niezależny rekord `CaseHandoff`
 * (`originCaseId` jednej sprawy = `targetCaseId` poprzedniej), pętla idzie
 * "w tył" po `findByTargetCaseId`, aż trafi na sprawę, która niczyim celem
 * nie jest.
 */
@Injectable()
export class CaseHandoffPartnerUpdateHandler {
  constructor(
    private readonly caseHandoffRepository: CaseHandoffRepository,
    private readonly casesService: CasesService,
    private readonly caseStatusesService: CaseStatusesService,
    private readonly companiesService: CompaniesService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @DomainEventHandler(EVENT_NAMES.CASE_STATUS_CHANGED)
  async handleStatusChanged(event: DomainEvent<CaseStatusChangedPayload>): Promise<void> {
    const isFirst = await this.idempotencyService.tryMarkProcessed(
      event.eventId,
      `${CaseHandoffPartnerUpdateHandler.name}.status`,
    );
    if (!isFirst) return;

    const statusDef = await this.caseStatusesService.findByCode(
      event.payload.newStatus,
      event.companyId,
    );
    const companyName = await this.resolveCompanyName(event.companyId);
    await this.propagateToAncestors(
      event.aggregateId,
      `Status u partnera (${companyName}): ${statusDef?.label ?? event.payload.newStatus}`,
    );
  }

  @DomainEventHandler(EVENT_NAMES.CASE_DECISION_SET)
  async handleDecisionSet(event: DomainEvent<CaseDecisionSetPayload>): Promise<void> {
    const isFirst = await this.idempotencyService.tryMarkProcessed(
      event.eventId,
      `${CaseHandoffPartnerUpdateHandler.name}.decision`,
    );
    if (!isFirst) return;

    const companyName = await this.resolveCompanyName(event.companyId);
    await this.propagateToAncestors(
      event.aggregateId,
      `Decyzja partnera (${companyName}): ${event.payload.decision}`,
    );
  }

  /**
   * Problem 8c (raport wdrożeniowy 17.08) — komunikaty propagacji nie
   * identyfikowały, KTÓRA firma w łańcuchu spowodowała aktualizację; przy
   * łańcuchu Sklep→Dystrybutor→Producent Sklep widział dwa pozornie
   * identyczne wpisy "Status u partnera: Przyjęta". Nazwa firmy, która
   * FAKTYCZNIE wykonała operację (`event.companyId` — zawsze firma-właściciel
   * zmienionej sprawy, niezależnie od tego, ile ogniw wstecz wiadomość
   * dotrze w `propagateToAncestors`), dopisana RAZ, ta sama dla WSZYSTKICH
   * przodków w łańcuchu — bo to zawsze ta sama firma spowodowała zmianę.
   */
  private async resolveCompanyName(companyId: string): Promise<string> {
    const company = await this.companiesService.findById(companyId);
    return company.name;
  }

  private async propagateToAncestors(caseId: string, message: string): Promise<void> {
    let currentCaseId = caseId;
    for (let hop = 0; hop < MAX_CHAIN_HOPS; hop += 1) {
      const handoff = await this.caseHandoffRepository.findByTargetCaseId(currentCaseId);
      if (!handoff) return;

      await this.casesService.appendCaseHistory(handoff.originCaseId, {
        userId: null,
        action: CaseHistoryAction.HandoffPartnerUpdate,
        newValue: message,
        visibleForCustomer: false,
      });

      currentCaseId = handoff.originCaseId;
    }
  }
}
