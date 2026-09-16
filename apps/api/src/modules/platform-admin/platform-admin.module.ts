import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminRepository } from './platform-admin.repository';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAuthGuard } from './platform-auth.guard';
import { PlatformAuthService } from './platform-auth.service';

/**
 * Fundament „Fresh Install" — moduł CAŁKOWICIE oddzielny od `AuthModule`
 * (pracownicy)/`PortalModule` (Portal Klienta) pod względem STANU (własny
 * `JwtModule.register({})`, sekret przekazywany JAWNIE per wywołanie z ENV —
 * patrz `PlatformAuthService`/`PlatformAuthGuard` — nigdy z domyślnej
 * konfiguracji modułu, żeby nie było pokusy pomylenia z sekretem
 * pracowniczym), reużywa WYŁĄCZNIE `PasswordService` (bcrypt) z `AuthModule`.
 */
@Module({
  imports: [JwtModule.register({}), AuthModule],
  controllers: [PlatformAuthController, PlatformAdminController],
  providers: [
    PlatformAdminRepository,
    PlatformAdminService,
    PlatformAuthService,
    PlatformAuthGuard,
  ],
})
export class PlatformAdminModule {}
