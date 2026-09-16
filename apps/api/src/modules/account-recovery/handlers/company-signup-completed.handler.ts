import { Injectable } from '@nestjs/common';
import { CompanySignupCompletedPayload } from '../../../events/contracts/company.events';
import { DomainEventHandler } from '../../../events/decorators/domain-event-handler.decorator';
import { DomainEvent } from '../../../events/domain-event.base';
import { EVENT_NAMES } from '../../../events/event-names.const';
import { IdempotencyService } from '../../../events/idempotency.service';
import { AccountRecoveryService } from '../account-recovery.service';

/**
 * Fundament „Fresh Install" — subskrybent `COMPANY_SIGNUP_COMPLETED`
 * (`CompaniesService.signup`, właściciel agregatu Company publikuje).
 * Rozdziela `CompaniesModule` od `AccountRecoveryModule` strukturalnie —
 * patrz doc-comment `CompaniesModule`/TODO przy tym zdarzeniu w
 * `event-names.const.ts` (bez tego handlera `CompaniesModule` musiałby
 * importować `AccountRecoveryModule` wprost, co zamykało cykl modułów, na
 * którym zawieszał się `NestFactory.create()`).
 */
@Injectable()
export class CompanySignupCompletedHandler {
  constructor(
    private readonly accountRecoveryService: AccountRecoveryService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @DomainEventHandler(EVENT_NAMES.COMPANY_SIGNUP_COMPLETED)
  async handle(event: DomainEvent<CompanySignupCompletedPayload>): Promise<void> {
    const isFirst = await this.idempotencyService.tryMarkProcessed(
      event.eventId,
      CompanySignupCompletedHandler.name,
    );
    if (!isFirst) return;

    await this.accountRecoveryService.sendVerificationEmail({
      email: event.payload.email,
      firstName: event.payload.firstName,
      companyName: event.payload.companyName,
      token: event.payload.verificationToken,
    });
  }
}
