import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * `@Roles('Administrator', 'Kierownik')` — sprawdza `Role.code` z RBAC.md §1
 * (5 ról systemowych; kody bez zmian względem RBAC.md, żeby nie łamać
 * dopasowania w seedzie/UI). Wymaga `JwtAuthGuard` wcześniej (czyta
 * `request.user.roles`, ustawiane przez `JwtStrategy`).
 *
 * CELOWO oddzielne od `@RequirePermissions()` (`rbac/decorators`) —
 * RBAC.md §4 mówi wprost, że docelowy sposób gatingu to `Permission.code`,
 * "nie nazwę roli wprost", właśnie po to, żeby dało się zmieniać
 * uprawnienia ról bez zmiany kodu. `@RequirePermissions()` pozostaje
 * GŁÓWNYM mechanizmem (już wpięty globalnie jako `APP_GUARD` —
 * `PermissionsGuard`, Zadanie 7). `@Roles()` to dodatkowe narzędzie, gdy
 * reguła naprawdę dotyczy przynależności do roli, nie zestawu uprawnień —
 * w obecnym zakresie dokumentacji żadna reguła RBAC.md §2/§3 tego nie
 * wymaga (wszystkie wyrażone przez `Permission.code`), więc `RolesGuard`
 * nie jest jeszcze podpięty globalnie ani użyty w żadnym kontrolerze —
 * gotowy do użycia, gdy pojawi się rzeczywista reguła "musi być rolą X".
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
