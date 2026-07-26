import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

/**
 * `users.edit`. Hasło i role mają osobne endpointy/uprawnienia
 * (resetPassword, roles.assign — RBAC.md §2). `active` CELOWO wyłączone —
 * dezaktywacja ma własne uprawnienie (`users.deactivate`) i własną regułę
 * (USER-003, ostrzeżenie o otwartych sprawach); gdyby `active` było tu
 * dostępne, `PATCH /users/:id` pozwalałoby dezaktywować konto samym
 * `users.edit`, omijając zarówno gating RBAC.md, jak i to ostrzeżenie.
 */
export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['password', 'roleIds'] as const)) {}
