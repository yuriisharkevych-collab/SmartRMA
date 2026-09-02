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
