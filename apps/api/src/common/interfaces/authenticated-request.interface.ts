import { Request } from 'express';

/**
 * Payload dołączany do `req.user` przez `JwtStrategy` po weryfikacji tokenu.
 * `permissions` to już wyliczona suma uprawnień ze wszystkich ról
 * użytkownika (RBAC.md §1.1 "unia zbiorów") — `PermissionsGuard` porównuje
 * z tą listą, nie dopytuje bazy przy każdym żądaniu.
 */
export interface AuthenticatedUser {
  userId: string;
  companyId: string;
  shopId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions: string[];
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
