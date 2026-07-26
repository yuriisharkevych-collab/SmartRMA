import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationRecipientType } from '@prisma/client';
import { CaseCreatedPayload } from '../../../events/contracts/case.events';
import { DomainEventHandler } from '../../../events/decorators/domain-event-handler.decorator';
import { DomainEvent } from '../../../events/domain-event.base';
import { EVENT_NAMES } from '../../../events/event-names.const';
import { IdempotencyService } from '../../../events/idempotency.service';
import { CasesService } from '../../cases/cases.service';
import { CustomersService } from '../../customers/customers.service';
import { ProductsService } from '../../products/products.service';
import { NotificationsService } from '../notifications.service';

/**
 * NOTIFICATIONS.md §3, wiersz `case.created.customer` — wyzwalacz warunkowy:
 * TYLKO gdy `Case.clientPortalEnabled=true`. Payload zdarzenia go nie niesie
 * (EVENTS.md §2.1 pkt 1 — identyfikatory, nie encje), więc odczyt na żywo
 * przez `CasesService.findById` (dozwolone, EVENTS.md §7.2: subskrybent
 * doczytuje z bazy po commicie). Handler NIE wykonuje logiki biznesowej
 * modułu Cases — tylko czyta już zatwierdzony stan.
 */
@Injectable()
export class CaseCreatedNotificationHandler {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly casesService: CasesService,
    private readonly customersService: CustomersService,
    private readonly productsService: ProductsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @DomainEventHandler(EVENT_NAMES.CASE_CREATED)
  async handle(event: DomainEvent<CaseCreatedPayload>): Promise<void> {
    const isFirst = await this.idempotencyService.tryMarkProcessed(event.eventId, CaseCreatedNotificationHandler.name);
    if (!isFirst) return;

    const caseEntity = await this.casesService.findById(event.aggregateId);
    if (!caseEntity.clientPortalEnabled) return;

    const customer = await this.customersService.findById(event.payload.customerId);
    const firstItem = caseEntity.items[0];
    const productName = firstItem ? (await this.productsService.findById(firstItem.productId)).name : '';

    await this.notificationsService.createNotificationFromTemplate({
      companyId: caseEntity.companyId,
      code: 'case.created.customer',
      channel: NotificationChannel.Email,
      recipientType: NotificationRecipientType.Customer,
      recipientEmail: customer.email ?? undefined,
      relatedCaseId: caseEntity.id,
      variables: { caseNumber: caseEntity.caseNumber, customerName: `${customer.firstName} ${customer.lastName}`, productModel: productName },
    });
  }
}
