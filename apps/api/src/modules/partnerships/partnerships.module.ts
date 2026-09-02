import { forwardRef, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CaseStatusesModule } from '../case-statuses/case-statuses.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { PartnershipsController } from './partnerships.controller';
import { PartnershipsRepository } from './partnerships.repository';
import { PartnershipsService } from './partnerships.service';

@Module({
  imports: [
    AuditModule,
    CaseStatusesModule,
    NotificationsModule,
    // forwardRef: `UsersModule`/`AuthModule` importują (transitywnie, przez
    // `forwardRef(() => CasesModule)`) `CasesModule`, który importuje
    // `PartnershipsModule` — cykl w GRAFIE MODUŁÓW (nie w grafie providerów:
    // `PartnershipsService` zależy od `UsersRepository`/`AuthService`, żaden
    // z nich nie zależy od `PartnershipsService` z powrotem), dokładnie ten
    // sam wzorzec co `AuthModule`↔`UsersModule` (patrz komentarz tam). Etap 5
    // — `PartnershipsService.acceptPartnerInvite` zakłada pierwszego
    // Administratora nowej firmy partnera i od razu wydaje mu sesję logowania.
    forwardRef(() => UsersModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [PartnershipsController],
  providers: [PartnershipsService, PartnershipsRepository],
  exports: [PartnershipsService],
})
export class PartnershipsModule {}
