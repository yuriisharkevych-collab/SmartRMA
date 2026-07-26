import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Wyłącza `JwtAuthGuard` dla endpointu (np. login, health check, Portal
 * Klienta — który i tak ma odrębny mechanizm dostępu, patrz RBAC.md §1.2).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
