import { forwardRef, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './services/password.service';
import { RefreshTokenStoreService } from './services/refresh-token-store.service';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';

// `JwtAuthGuard`/`RefreshTokenGuard`/`RolesGuard` NIE są tu prowidowane jako
// zwykłe providery — `JwtAuthGuard` jest globalny (`APP_GUARD` w `AppModule`),
// `RefreshTokenGuard`/`RolesGuard` są referencjonowane bezpośrednio przez
// `@UseGuards(Klasa)` (Nest instancjonuje je przez własny DI po drodze, bez
// potrzeby wpisu w `providers` — ten sam wzorzec co wcześniejsze
// `LocalAuthGuard`/`JwtAuthGuard`).

@Module({
  imports: [
    // forwardRef: Zadanie 2 (Users) wprowadza odwrotną zależność
    // (UsersModule -> AuthModule, po PasswordService) — bez tego Nest nie
    // rozwiąże cyklu importów przy starcie. Graf providerów NIE jest
    // cykliczny (AuthService zależy od UsersRepository, UsersService od
    // PasswordService — różne serwisy), tylko graf modułów, więc
    // wystarczy forwardRef na poziomie `imports`, bez `@Inject(forwardRef())`
    // w konstruktorach.
    forwardRef(() => UsersModule),
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret'),
        signOptions: { expiresIn: config.get<string>('jwt.accessExpiresIn') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, RefreshTokenStoreService, LocalStrategy, JwtStrategy, JwtRefreshStrategy],
  exports: [AuthService, PasswordService],
})
export class AuthModule {}
