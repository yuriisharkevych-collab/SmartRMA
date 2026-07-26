import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { CustomersModule } from '../customers/customers.module';
import { ProductsModule } from '../products/products.module';
import { CaseCreatedNotificationHandler } from './handlers/case-created-notification.handler';
import { CaseOwnerChangedNotificationHandler } from './handlers/case-owner-changed-notification.handler';
import { CaseStatusChangedNotificationHandler } from './handlers/case-status-changed-notification.handler';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

/**
 * `CasesModule`/`CustomersModule`/`ProductsModule` — reużycie istniejących
 * serwisów przez handlery zdarzeń (odczyt kontekstu do renderowania
 * szablonu: `Case`/`Customer`/`Product`), zgodnie z EVENTS.md §7.2
 * ("subskrybent doczytuje z bazy"). Brak cyklu: żaden z tych modułów nie
 * importuje `NotificationsModule` (EVENTS.md §6.2 — "Notifications nigdy
 * nie publikuje case.*", więc nie ma też powodu, żeby był importowany
 * przez moduły źródłowe zdarzeń).
 *
 * Handlery zarejestrowane jako `providers` (wymóg `@DomainEventHandler`,
 * patrz `events/decorators/domain-event-handler.decorator.ts`) — NIE
 * eksportowane, nikt inny ich nie wstrzykuje bezpośrednio.
 */
@Module({
  imports: [CasesModule, CustomersModule, ProductsModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    CaseCreatedNotificationHandler,
    CaseStatusChangedNotificationHandler,
    CaseOwnerChangedNotificationHandler,
  ],
  exports: [NotificationsService, NotificationsRepository],
})
export class NotificationsModule {}
