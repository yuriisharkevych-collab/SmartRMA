import { forwardRef, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { StorageModule } from '../../storage/storage.module';
import { CompaniesController } from './companies.controller';
import { CompaniesRepository } from './companies.repository';
import { CompaniesService } from './companies.service';

/**
 * `AuditModule` importowany po `AuditRepository` — BR-088, zapis AuditLog przy
 * każdej mutacji (Zadanie 12). `StorageModule` — `IStorageService`, logo firmy
 * (Ustawienia). Etap 6 dokłada `AuthModule` (`AuthService`/`PasswordService`,
 * `signup()` loguje od razu jak `PartnershipsService.acceptPartnerInvite`) i
 * `UsersModule` (`UsersRepository.findPasswordAccountByEmail`) — oba przez
 * `forwardRef`, bo `UsersModule` → `CasesModule` → `CompaniesModule` zamyka
 * cykl w grafie MODUŁÓW (nie w grafie providerów — `AuthService`/`UsersRepository`
 * nie zależą od `CompaniesService`), dokładnie ten sam wzorzec co
 * `PartnershipsModule` w Etapie 5.
 *
 * Fundament „Fresh Install" — `signup()` NIE loguje już od razu, tylko
 * publikuje `COMPANY_SIGNUP_COMPLETED` (`IEventBus`, `EVENT_BUS` jest
 * globalny — `DomainEventBusModule`, nie trzeba go tu importować).
 * `AccountRecoveryModule` (wysyłka e-maila weryfikacyjnego) subskrybuje to
 * zdarzenie, ale celowo NIE jest tu importowany bezpośrednio — próba
 * dołożenia go (nawet przez `forwardRef`) zamyka cykl modułów
 * `CompaniesModule → AccountRecoveryModule → MailModule → CompaniesModule`,
 * na którym `NestFactory.create()` faktycznie wiesza się bez żadnego błędu
 * (zaobserwowane empirycznie — zbyt wiele jednoczesnych `forwardRef` na tym
 * samym module). Zdarzenie domenowe rozwiązuje to strukturalnie: właściciel
 * agregatu (Company) publikuje, subskrybent doczytuje niezależnie — zero
 * zależności modułowej w tę stronę. Patrz TODO przy `COMPANY_SIGNUP_COMPLETED`
 * w `event-names.const.ts`.
 */
@Module({
  imports: [
    AuditModule,
    StorageModule,
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService, CompaniesRepository],
  exports: [CompaniesService],
})
export class CompaniesModule {}
