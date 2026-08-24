import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { DomainEventBusModule } from './events/event-bus.module';
import { HealthModule } from './health/health.module';
import { LoggerModule } from './logger/logger.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { CaseHandoffModule } from './modules/case-handoff/case-handoff.module';
import { CaseStatusesModule } from './modules/case-statuses/case-statuses.module';
import { CasesModule } from './modules/cases/cases.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { ContractorsModule } from './modules/contractors/contractors.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { IntakeModule } from './modules/intake/intake.module';
import { ManufacturersModule } from './modules/manufacturers/manufacturers.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PartnershipsModule } from './modules/partnerships/partnerships.module';
import { PortalModule } from './modules/portal/portal.module';
import { ProductsModule } from './modules/products/products.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RolesModule } from './modules/roles/roles.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { PermissionsGuard } from './rbac/guards/permissions.guard';
import { RedisModule } from './redis/redis.module';
import { CryptoModule } from './crypto/crypto.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    // --- Infrastruktura (punkt 3) ---
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validationSchema }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    LoggerModule,
    PrismaModule,
    RedisModule,
    CryptoModule,
    MailModule,

    // --- Event Bus (punkt 4) ---
    DomainEventBusModule,

    // --- RBAC (punkt 5) ---
    RbacModule,

    HealthModule,

    // --- Moduły domenowe (punkt 2) ---
    AuthModule,
    UsersModule,
    RolesModule,
    CompaniesModule,
    CaseStatusesModule,
    CasesModule,
    CaseHandoffModule,
    CustomersModule,
    ProductsModule,
    OrdersModule,
    ContractorsModule,
    ManufacturersModule,
    PartnershipsModule,
    DocumentsModule,
    NotificationsModule,
    PortalModule,
    IntakeModule,
    AuditModule,
    DashboardModule,
    ReportsModule,
    SettingsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // Kolejność ma znaczenie: JwtAuthGuard (uwierzytelnienie) przed PermissionsGuard (autoryzacja).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
