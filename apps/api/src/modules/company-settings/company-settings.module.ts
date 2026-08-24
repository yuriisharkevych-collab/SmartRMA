import { Module } from '@nestjs/common';
import { CompanySettingsRepository } from './company-settings.repository';
import { CompanySettingsService } from './company-settings.service';

/**
 * Moduł liściowy (bez importów innych modułów funkcjonalnych) — wykorzystywany
 * przez Auth (polityka haseł/sesja/blokada), Users (polityka haseł), Cases
 * (numeracja) i Settings (ekran administracyjny), bez ryzyka cyklu.
 */
@Module({
  providers: [CompanySettingsService, CompanySettingsRepository],
  exports: [CompanySettingsService],
})
export class CompanySettingsModule {}
