import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CompaniesController } from './companies.controller';
import { CompaniesRepository } from './companies.repository';
import { CompaniesService } from './companies.service';

/** `AuditModule` importowany po `AuditRepository` — BR-088, zapis AuditLog przy każdej mutacji (Zadanie 12). */
@Module({
  imports: [AuditModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, CompaniesRepository],
  exports: [CompaniesService],
})
export class CompaniesModule {}
