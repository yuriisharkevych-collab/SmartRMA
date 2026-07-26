import { Global, Module } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';

/**
 * Globalny, bo `AuthorizationService` jest potrzebny wszędzie tam, gdzie
 * liczone są efektywne uprawnienia użytkownika (dziś: `AuthService.login`).
 *
 * `PermissionsGuard` celowo NIE jest tu prowidowany — jest rejestrowany
 * bezpośrednio jako `APP_GUARD` w `AppModule` (obok `JwtAuthGuard`), więc
 * Nest instancjuje go sam przez własny DI; nic go stąd nie wstrzykuje
 * konstruktorowo, więc osobny provider byłby martwym duplikatem.
 */
@Global()
@Module({
  providers: [AuthorizationService],
  exports: [AuthorizationService],
})
export class RbacModule {}
