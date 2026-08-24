import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { CompaniesModule } from '../companies/companies.module';
import { CustomersModule } from '../customers/customers.module';
import { ManufacturersModule } from '../manufacturers/manufacturers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PortalModule } from '../portal/portal.module';
import { StorageModule } from '../../storage/storage.module';
import { IntakeController } from './intake.controller';
import { IntakeRepository } from './intake.repository';
import { IntakeService } from './intake.service';

/**
 * Publiczny Formularz Reklamacyjny — orkiestruje moduły źródłowe zamiast
 * duplikować logikę (patrz komentarz klasy `IntakeService`). Bez cyklu:
 * żaden z importowanych modułów nie zna `IntakeModule`. `StorageModule` —
 * `IStorageService` do serwowania logo marki (formularz rozgałęziony), patrz
 * `IntakeService.getBrandLogoBuffer`.
 */
@Module({
  imports: [
    CasesModule,
    CompaniesModule,
    CustomersModule,
    ManufacturersModule,
    NotificationsModule,
    PortalModule,
    StorageModule,
  ],
  controllers: [IntakeController],
  providers: [IntakeService, IntakeRepository],
})
export class IntakeModule {}
