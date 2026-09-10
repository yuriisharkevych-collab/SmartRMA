import { forwardRef, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CaseHandoffRepository } from '../case-handoff/case-handoff.repository';
import { CaseStatusesModule } from '../case-statuses/case-statuses.module';
import { CompaniesModule } from '../companies/companies.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { ContractorsModule } from '../contractors/contractors.module';
import { CustomersModule } from '../customers/customers.module';
import { DocumentsModule } from '../documents/documents.module';
import { ManufacturersModule } from '../manufacturers/manufacturers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { PartnershipsModule } from '../partnerships/partnerships.module';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';
import { CaseAttentionScannerService } from './case-attention-scanner.service';
import { CaseConsentRepository } from './case-consent.repository';
import { CaseHistoryRepository } from './case-history.repository';
import { CaseItemsRepository } from './case-items.repository';
import { CasesController } from './cases.controller';
import { CasesRepository } from './cases.repository';
import { CasesService } from './cases.service';
import { MessagesRepository } from './messages.repository';
import { NotesRepository } from './notes.repository';

/**
 * `AuditModule` — BR-088. `CustomersModule`/`CompaniesModule`/`ProductsModule`/
 * `OrdersModule` — reużycie istniejących `findById`-stylu serwisów do
 * weryfikacji referencji (Customer/Shop/Product/OrderItem) przed zapisem
 * sprawy. `UsersModule` (od poprawki po code review Zadania 16) — reużycie
 * `UsersService.findById` do walidacji `Case.ownerId` (create/assignOwner),
 * zamiast pozwalać na surowy błąd FK z Prisma. `forwardRef`: `UsersModule`
 * już importuje `CasesModule` (po `CasesRepository.countActiveByOwner`,
 * Zadanie 2) — cykl w grafie MODUŁÓW, ale nie w grafie providerów
 * (`UsersService -> CasesRepository -> PrismaService`, `CasesService ->
 * UsersService -> jw.` — żaden łańcuch nie wraca do punktu startu), więc
 * `forwardRef` na poziomie modułu (obie strony) wystarcza, dokładnie jak
 * dla `AuthModule`↔`UsersModule`.
 */
@Module({
  imports: [
    AuditModule,
    CaseStatusesModule,
    CustomersModule,
    CompaniesModule,
    CompanySettingsModule,
    ContractorsModule,
    ProductsModule,
    OrdersModule,
    ManufacturersModule,
    PartnershipsModule,
    forwardRef(() => UsersModule),
    // `DocumentsModule` importuje `CasesModule` (potrzebuje `CasesService`), a teraz
    // `CasesService` potrzebuje `DocumentsRepository` do kontroli CASE-002 — cykl na
    // poziomie MODUŁÓW, rozwiązany `forwardRef` po obu stronach. Graf PROVIDERÓW
    // pozostaje acykliczny: `DocumentsRepository → PrismaService`, bez powrotu do Cases.
    forwardRef(() => DocumentsModule),
    // `NotificationsModule` importuje `CasesModule` (kontekst dla handlerów zdarzeń), a
    // `CasesService.enablePortal` woła `NotificationsService` bezpośrednio (e-mail z
    // jednorazowym kodem dostępu, patrz doc-comment `createNotificationFromTemplate`) —
    // ten sam wzorzec `forwardRef` po obu stronach co `DocumentsModule` powyżej.
    forwardRef(() => NotificationsModule),
  ],
  controllers: [CasesController],
  providers: [
    CasesService,
    CasesRepository,
    CaseItemsRepository,
    CaseHistoryRepository,
    NotesRepository,
    MessagesRepository,
    CaseConsentRepository,
    CaseAttentionScannerService,
    // `hardDelete` (usuwanie spraw testowych) musi wyczyścić powiązany
    // `CaseHandoff` PRZED samą sprawą — patrz doc-comment
    // `CaseHandoffRepository.deleteAllForCase`. Reużywamy tej samej klasy co
    // `CaseHandoffModule`, ale NIE importujemy stamtąd całego modułu: on sam
    // importuje `CasesModule` (jednokierunkowo, patrz jego doc-comment), więc
    // odwrotny import zamknąłby cykl modułów. `CaseHandoffRepository`
    // zależy WYŁĄCZNIE od `PrismaService` (bezstanowe opakowanie zapytań) —
    // podanie jej tu jako osobnego providera daje drugą, w pełni
    // równoważną instancję, bez `forwardRef` i bez dotykania
    // `CaseHandoffModule`.
    CaseHandoffRepository,
  ],
  // `CaseConsentRepository` — współdzielone przez Portal Klienta i Publiczny Formularz
  // Reklamacyjny (oba tworzą/czytają zgody RODO powiązane ze sprawą), stąd żyje przy
  // Cases (CaseConsent jest logicznie częścią agregatu Case), nie przy żadnym z nich.
  exports: [
    CasesService,
    CasesRepository,
    CaseHistoryRepository,
    MessagesRepository,
    CaseConsentRepository,
  ],
})
export class CasesModule {}
