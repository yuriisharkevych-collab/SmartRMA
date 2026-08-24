import { forwardRef, Module } from '@nestjs/common';
import { CaseStatusesModule } from '../case-statuses/case-statuses.module';
import { CasesModule } from '../cases/cases.module';
import { CompaniesModule } from '../companies/companies.module';
import { CustomersModule } from '../customers/customers.module';
import { ProductsModule } from '../products/products.module';
import { CaseCreatedNotificationHandler } from './handlers/case-created-notification.handler';
import { CaseInfoRequestedNotificationHandler } from './handlers/case-info-requested-notification.handler';
import { CaseOwnerChangedNotificationHandler } from './handlers/case-owner-changed-notification.handler';
import { CaseStatusChangedNotificationHandler } from './handlers/case-status-changed-notification.handler';
import { CaseMessageAddedNotificationHandler } from './handlers/case-message-added-notification.handler';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

/**
 * `CasesModule`/`CustomersModule`/`ProductsModule` — reużycie istniejących
 * serwisów przez handlery zdarzeń (odczyt kontekstu do renderowania
 * szablonu: `Case`/`Customer`/`Product`), zgodnie z EVENTS.md §7.2
 * ("subskrybent doczytuje z bazy"). `forwardRef(CasesModule)` — od modułu
 * e-mail: `CasesService.enablePortal` woła `NotificationsService`
 * bezpośrednio (jednorazowy kod dostępu, patrz doc-comment
 * `createNotificationFromTemplate`), więc `CasesModule` teraz też importuje
 * `NotificationsModule` — cykl na poziomie MODUŁÓW, rozwiązany `forwardRef`
 * po obu stronach, dokładnie jak `CasesModule`↔`DocumentsModule`.
 *
 * Handlery zarejestrowane jako `providers` (wymóg `@DomainEventHandler`,
 * patrz `events/decorators/domain-event-handler.decorator.ts`) — NIE
 * eksportowane, nikt inny ich nie wstrzykuje bezpośrednio.
 */
@Module({
  imports: [
    forwardRef(() => CasesModule),
    CustomersModule,
    ProductsModule,
    CompaniesModule,
    CaseStatusesModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    CaseCreatedNotificationHandler,
    CaseStatusChangedNotificationHandler,
    CaseOwnerChangedNotificationHandler,
    CaseInfoRequestedNotificationHandler,
    CaseMessageAddedNotificationHandler,
  ],
  exports: [NotificationsService, NotificationsRepository],
})
export class NotificationsModule {}
