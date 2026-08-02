import { forwardRef, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CasesModule } from '../cases/cases.module';
import { StorageModule } from '../../storage/storage.module';
import { DocumentsController } from './documents.controller';
import { DocumentsRepository } from './documents.repository';
import { DocumentsService } from './documents.service';

/**
 * `AuditModule` — BR-088. `CasesModule` — `CasesService.findById` (istnienie
 * sprawy + `companyId`, izolacja dzierżawy) i `CasesService.appendCaseHistory`
 * (zapis `CaseHistory` atomowo z `Document`). Brak cyklu: `CasesModule` nie
 * importuje `DocumentsModule`. `StorageModule` — `IStorageService` dla
 * zapisu/odczytu binarium (`DocumentsController`).
 */
@Module({
  imports: [AuditModule, forwardRef(() => CasesModule), StorageModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsRepository],
  // `DocumentsRepository` eksportowane dla `CasesService` (CASE-002 — liczy załączniki
  // wewnątrz transakcji zmiany statusu). Świadomie repozytorium, nie serwis:
  // `DocumentsService` zależy od `CasesService`, więc użycie go tutaj zamknęłoby
  // cykl providerów, a nie tylko modułów.
  exports: [DocumentsService, DocumentsRepository],
})
export class DocumentsModule {}
