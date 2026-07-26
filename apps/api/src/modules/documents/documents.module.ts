import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CasesModule } from '../cases/cases.module';
import { DocumentsController } from './documents.controller';
import { DocumentsRepository } from './documents.repository';
import { DocumentsService } from './documents.service';

/**
 * `AuditModule` — BR-088. `CasesModule` — `CasesService.findById` (istnienie
 * sprawy + `companyId`, izolacja dzierżawy) i `CasesService.appendCaseHistory`
 * (zapis `CaseHistory` atomowo z `Document`). Brak cyklu: `CasesModule` nie
 * importuje `DocumentsModule`.
 */
@Module({
  imports: [AuditModule, CasesModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsRepository],
  exports: [DocumentsService],
})
export class DocumentsModule {}
