import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CaseStatusesModule } from '../case-statuses/case-statuses.module';
import { CasesModule } from '../cases/cases.module';
import { CompaniesModule } from '../companies/companies.module';
import { CustomersModule } from '../customers/customers.module';
import { DocumentsModule } from '../documents/documents.module';
import { PartnershipsModule } from '../partnerships/partnerships.module';
import { ProductsModule } from '../products/products.module';
import { StorageModule } from '../../storage/storage.module';
import { CaseHandoffController } from './case-handoff.controller';
import { CaseHandoffRepository } from './case-handoff.repository';
import { CaseHandoffService } from './case-handoff.service';
import { CaseHandoffPartnerUpdateHandler } from './handlers/case-handoff-partner-update.handler';

/**
 * Faza 5 planu — importuje `CasesModule` (reużycie `CasesService.create`/
 * `findById`/`appendCaseHistory` + `CasesRepository.findByIdTrusted`,
 * WSZYSTKIE już eksportowane, zero nowych eksportów) i `PartnershipsModule`
 * (autoryzacja przekazania). Jednokierunkowo — ani `CasesModule` ani
 * `PartnershipsModule` nie importują `CaseHandoffModule` z powrotem, więc
 * `forwardRef` nie jest tu potrzebny (w przeciwieństwie do np.
 * `DocumentsModule`↔`CasesModule`).
 */
@Module({
  imports: [
    CasesModule,
    PartnershipsModule,
    CustomersModule,
    ProductsModule,
    CompaniesModule,
    CaseStatusesModule,
    AuditModule,
    DocumentsModule,
    StorageModule,
  ],
  controllers: [CaseHandoffController],
  providers: [CaseHandoffService, CaseHandoffRepository, CaseHandoffPartnerUpdateHandler],
})
export class CaseHandoffModule {}
