import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CustomersController } from './customers.controller';
import { CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';

/** `AuditModule` importowany po `AuditRepository` — BR-088, zapis AuditLog przy każdej mutacji (Zadanie 13, wzorzec z Companies). */
@Module({
  imports: [AuditModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomersRepository],
  exports: [CustomersService],
})
export class CustomersModule {}
