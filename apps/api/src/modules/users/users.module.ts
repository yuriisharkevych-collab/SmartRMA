import { forwardRef, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CaseStatusesModule } from '../case-statuses/case-statuses.module';
import { CasesModule } from '../cases/cases.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { RolesModule } from '../roles/roles.module';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  imports: [
    // forwardRef: AuthModule importuje UsersModule (po UsersRepository) —
    // patrz komentarz w auth.module.ts.
    forwardRef(() => AuthModule),
    // forwardRef: od Zadania 16 CasesModule TEŻ importuje UsersModule (po
    // UsersService, walidacja istnienia Case.ownerId) — cykl w grafie modułów,
    // ale NIE w grafie providerów (UsersService -> CasesRepository -> tylko
    // PrismaService; CasesService -> UsersService -> jw. — żaden łańcuch nie
    // wraca do punktu startu), więc forwardRef na poziomie modułu wystarcza,
    // dokładnie jak dla AuthModule↔UsersModule wyżej.
    forwardRef(() => CasesModule),
    CaseStatusesModule,
    CompanySettingsModule,
    AuditModule,
    RolesModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
