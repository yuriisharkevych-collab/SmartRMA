import { forwardRef, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CompaniesModule } from '../companies/companies.module';
import { CustomersModule } from '../customers/customers.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';
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
  imports: [AuditModule, CustomersModule, CompaniesModule, ProductsModule, OrdersModule, forwardRef(() => UsersModule)],
  controllers: [CasesController],
  providers: [CasesService, CasesRepository, CaseItemsRepository, CaseHistoryRepository, NotesRepository, MessagesRepository],
  exports: [CasesService, CasesRepository],
})
export class CasesModule {}
