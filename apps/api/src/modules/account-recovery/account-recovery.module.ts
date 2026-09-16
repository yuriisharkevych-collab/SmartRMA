import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../../mail/mail.module';
import { AccountRecoveryController } from './account-recovery.controller';
import { AccountRecoveryService } from './account-recovery.service';
import { CompanySignupCompletedHandler } from './handlers/company-signup-completed.handler';

/**
 * Fundament „Fresh Install" — moduł liściowy: NIC nie importuje
 * `CompaniesModule` z powrotem tutaj wprost — `CompanySignupCompletedHandler`
 * subskrybuje `COMPANY_SIGNUP_COMPLETED` (`EVENT_BUS`, globalny —
 * `DomainEventBusModule`) zamiast `CompaniesModule` importować TEN moduł
 * (co zamykałoby cykl `CompaniesModule → AccountRecoveryModule → MailModule →
 * CompaniesModule`, patrz doc-comment `CompaniesModule` — empirycznie
 * ustalono, że taki cykl wiesza `NestFactory.create()` bez żadnego błędu).
 * `IdempotencyService` — provider `DomainEventBusModule` (też globalny), nie
 * trzeba go tu deklarować w `imports`.
 */
@Module({
  imports: [UsersModule, AuthModule, CompanySettingsModule, NotificationsModule, MailModule],
  controllers: [AccountRecoveryController],
  providers: [AccountRecoveryService, CompanySignupCompletedHandler],
  exports: [AccountRecoveryService],
})
export class AccountRecoveryModule {}
