import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../../storage/storage.module';
import { ManufacturersController } from './manufacturers.controller';
import { ManufacturersRepository } from './manufacturers.repository';
import { ManufacturersService } from './manufacturers.service';

/** `StorageModule` (Etap 6) — `IStorageService`, logo formularza marki (`publicFormLogoPath`), ten sam port co logo firmy (`CompaniesModule`). */
@Module({
  imports: [AuditModule, StorageModule],
  controllers: [ManufacturersController],
  providers: [ManufacturersService, ManufacturersRepository],
  exports: [ManufacturersService],
})
export class ManufacturersModule {}
