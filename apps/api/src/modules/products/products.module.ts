import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ManufacturersModule } from '../manufacturers/manufacturers.module';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

/**
 * `AuditModule` — BR-088, zapis AuditLog przy każdej mutacji (wzorzec z
 * Companies/Customers). `ManufacturersModule` — `ManufacturersService.findById()`
 * reużyty do weryfikacji `manufacturerId` przed zapisem Product/Brand, żeby
 * naruszenie klucza obcego kończyło się kontrolowanym 404, nie surowym
 * wyjątkiem Prisma (P2003). Brak cyklu: `ManufacturersModule` nie importuje
 * `ProductsModule`.
 */
@Module({
  imports: [AuditModule, ManufacturersModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductsRepository],
  exports: [ProductsService],
})
export class ProductsModule {}
