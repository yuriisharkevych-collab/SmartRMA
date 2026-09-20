import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MessageDirection,
  NotificationChannel,
  NotificationRecipientType,
  SenderType,
} from '@prisma/client';
import { CaseMessageAddedPayload } from '../../../events/contracts/case.events';
import { DomainEventHandler } from '../../../events/decorators/domain-event-handler.decorator';
import { DomainEvent } from '../../../events/domain-event.base';
import { EVENT_NAMES } from '../../../events/event-names.const';
import { IdempotencyService } from '../../../events/idempotency.service';
import { CasesService } from '../../cases/cases.service';
import { MessagesRepository } from '../../cases/messages.repository';
import { CompaniesService } from '../../companies/companies.service';
import { CustomersService } from '../../customers/customers.service';
import { NotificationsService } from '../notifications.service';

const MESSAGE_PREVIEW_MAX_LENGTH = 200;

/**
 * `case.message_added.customer` — "nowa wiadomość od pracownika" (moduł
 * e-mail). `CasesService.sendMessage` publikuje `CASE_MESSAGE_ADDED` dla
 * KAŻDEJ wiadomości (klient→sklep i sklep→klient), ale twardo koduje
 * `senderType=Employee`+`direction=Outbound` RAZEM przy zapisie wiadomości
 * wysyłanej przez pracownika — dlatego `payload.direction===Outbound` dziś
 * wystarcza jako filtr "to wiadomość DO klienta". Dodatkowy warunek
 * `message.senderType===Employee` po pobraniu wiadomości to tani bezpiecznik
 * na przyszłość: gdyby kiedyś odpowiedź klienta w Portalu też zaczęła
 * publikować to zdarzenie z innym kierunkiem, ten handler ma jeszcze jedną
 * niezależną przesłankę, zanim wyśle e-mail.
 */
@Injectable()
export class CaseMessageAddedNotificationHandler {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly casesService: CasesService,
    private readonly customersService: CustomersService,
    private readonly companiesService: CompaniesService,
    private readonly messagesRepository: MessagesRepository,
    private readonly idempotencyService: IdempotencyService,
    private readonly config: ConfigService,
  ) {}

  @DomainEventHandler(EVENT_NAMES.CASE_MESSAGE_ADDED)
  async handle(event: DomainEvent<CaseMessageAddedPayload>): Promise<void> {
    if (event.payload.direction !== MessageDirection.Outbound) return;

    const isFirst = await this.idempotencyService.tryMarkProcessed(
      event.eventId,
      CaseMessageAddedNotificationHandler.name,
    );
    if (!isFirst) return;

    const messages = await this.messagesRepository.findByCaseId(event.aggregateId);
    const message = messages.find((m) => m.id === event.payload.messageId);
    if (!message || message.senderType !== SenderType.Employee) return;

    const caseEntity = await this.casesService.findById(event.aggregateId, event.companyId);
    const customer = await this.customersService.findById(caseEntity.customerId, event.companyId);
    if (!customer.email) return;

    const company = await this.companiesService.findById(event.companyId);
    const publicUrl = this.config.get<string>('publicUrl.url')!;
    const portalUrl = `${publicUrl}/portal/login`;
    const messagePreview =
      message.content.length > MESSAGE_PREVIEW_MAX_LENGTH
        ? `${message.content.slice(0, MESSAGE_PREVIEW_MAX_LENGTH)}…`
        : message.content;

    await this.notificationsService.createNotificationFromTemplate({
      companyId: caseEntity.companyId,
      code: 'case.message_added.customer',
      channel: NotificationChannel.Email,
      recipientType: NotificationRecipientType.Customer,
      recipientEmail: customer.email,
      relatedCaseId: caseEntity.id,
      senderNameOverride: caseEntity.notificationSenderName ?? undefined,
      variables: {
        caseNumber: caseEntity.caseNumber,
        customerName: `${customer.firstName} ${customer.lastName}`,
        messagePreview,
        portalUrl,
        companyName: company.name,
      },
    });
  }
}
