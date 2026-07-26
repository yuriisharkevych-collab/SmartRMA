import { SetMetadata } from '@nestjs/common';
import { PermissionCode } from '../constants/permissions.const';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * `@RequirePermissions(PERMISSIONS.CASES_STATUS_CHANGE)` na handlerze
 * kontrolera. Wiele kodów = użytkownik musi mieć **którekolwiek** z nich
 * (spójne z RBAC.md §4 "Wymagane uprawnienie (którekolwiek)"), nie wszystkie.
 */
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
