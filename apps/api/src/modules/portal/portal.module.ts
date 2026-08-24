import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CaseStatusesModule } from '../case-statuses/case-statuses.module';
import { CasesModule } from '../cases/cases.module';
import { CompaniesModule } from '../companies/companies.module';
import { DocumentsModule } from '../documents/documents.module';
import { StorageModule } from '../../storage/storage.module';
import { UsersModule } from '../users/users.module';
import { PortalAccessGuard } from './guards/portal-access.guard';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { PortalLoginThrottleService } from './services/portal-login-throttle.service';

/**
 * Integracja z Cases/Documents (Zadanie 9 pkt 1) — importuje ich moduły
 * zamiast duplikować dostęp do Prisma; `PortalService` wstrzykuje
 * `CasesRepository` (wyeksportowany przez `CasesModule`) i
 * `DocumentsService` (jedyne, co eksportuje `DocumentsModule`).
 *
 * Własna, DRUGA rejestracja `JwtModule` — celowo NIE dzieli sekretu z
 * `AuthModule` (RBAC.md §1.2, patrz `PortalAccessGuard`).
 */
@Module({
  imports: [
    CasesModule,
    CaseStatusesModule,
    CompaniesModule,
    DocumentsModule,
    StorageModule,
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('portal.secret'),
        signOptions: { expiresIn: config.get<string>('portal.expiresIn') },
      }),
    }),
  ],
  controllers: [PortalController],
  providers: [PortalService, PortalAccessGuard, PortalLoginThrottleService],
  // `PortalService` — Publiczny Formularz Reklamacyjny (`IntakeModule`) wystawia sesję
  // Portalu OD RAZU po utworzeniu sprawy (`issueSession`), żeby klient mógł bez
  // ponownego logowania wgrać zdjęcia/wideo/dowód zakupu tym samym tokenem.
  exports: [PortalService],
})
export class PortalModule {}
