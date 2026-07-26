import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CompaniesModule } from '../companies/companies.module';
import { CustomersModule } from '../customers/customers.module';
import { ProductsModule } from '../products/products.module';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

/**
 * `AuditModule` — BR-088. `CustomersModule`/`CompaniesModule`/`ProductsModule`
 * — reużycie istniejących `findById`-stylu serwisów do weryfikacji referencji
 * `customerId`/`shopId`/`OrderItem.productId` PRZED zapisem (żeby naruszenie
 * FK kończyło się kontrolowanym 404, nie surowym P2003 z Prisma), zamiast
 * duplikować te sprawdzenia w module Orders. Brak cyklu: żaden z tych modułów
 * nie importuje `OrdersModule`.
 */
@Module({
  imports: [AuditModule, CustomersModule, CompaniesModule, ProductsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository],
  exports: [OrdersService],
})
export class OrdersModule {}
