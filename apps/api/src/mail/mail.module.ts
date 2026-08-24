import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CompaniesModule } from '../modules/companies/companies.module';
import { CompanySettingsModule } from '../modules/company-settings/company-settings.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { MailService } from './mail.service';
import { MAIL_SERVICE } from './mail.interface';
import { NotificationDispatcherService } from './notification-dispatcher.service';

@Module({
  imports: [ScheduleModule.forRoot(), CompanySettingsModule, CompaniesModule, NotificationsModule],
  providers: [{ provide: MAIL_SERVICE, useClass: MailService }, NotificationDispatcherService],
  exports: [MAIL_SERVICE],
})
export class MailModule {}
