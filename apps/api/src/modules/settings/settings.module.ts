import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { MailModule } from '../../mail/mail.module';
import { SettingsController } from './settings.controller';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';
import { SystemStatsService } from './system-stats.service';

@Module({
  imports: [CompanySettingsModule, AuditModule, MailModule],
  controllers: [SettingsController],
  providers: [SettingsService, SettingsRepository, SystemStatsService],
})
export class SettingsModule {}
