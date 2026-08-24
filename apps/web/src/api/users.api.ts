import { apiClient } from './client';

/** `User.loginMethod` — Password (domyślny) albo Pin (nowość: PIN zamiast hasła, wyłącznie konta bez roli Administrator/Kierownik). */
export type LoginMethod = 'Password' | 'Pin';

/** Kształt odzwierciedla `UserEntity` z `apps/api` — NIGDY `passwordHash`/`pinHash` (DATABASE.md zasada #3). */
export interface User {
  id: string;
  companyId: string;
  shopId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  loginMethod: LoginMethod;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  /** Kody ról (`Role.code`). */
  roles: string[];
}

/** `RoleEntity` — role systemowe (`companyId: null`) i firmowe. */
export interface Role {
  id: string;
  companyId: string | null;
  name: string;
  code: string;
  description: string | null;
  isSystem: boolean;
  permissionCodes: string[];
}

/** `LoginEventEntity` — próba logowania, w tym nieudana. */
export interface LoginEvent {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  createdAt: string;
}

/** `password` wymagane, gdy `loginMethod` pominięte albo `Password`; `pin` wymagane, gdy `loginMethod='Pin'`. */
export interface CreateUserPayload {
  firstName: string;
  lastName: string;
  email: string;
  loginMethod?: LoginMethod;
  password?: string;
  pin?: string;
  shopId?: string;
  roleIds: string[];
}

/** `UpdateUserDto` — bez hasła, ról i `active`: każde ma własny endpoint i własne uprawnienie (RBAC.md §2). */
export interface UpdateUserPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  shopId?: string;
}

export interface DeactivateUserResponse {
  user: User;
  /** Kody ostrzeżeń z ERROR_CODES.md, np. `USER-003` gdy użytkownik prowadzi otwarte sprawy. */
  warnings: string[];
}

export const usersApi = {
  list: () => apiClient.get<User[]>('/users').then((res) => res.data),
  create: (payload: CreateUserPayload) =>
    apiClient.post<User>('/users', payload).then((res) => res.data),
  update: (id: string, payload: UpdateUserPayload) =>
    apiClient.patch<User>(`/users/${id}`, payload).then((res) => res.data),
  deactivate: (id: string) =>
    apiClient.post<DeactivateUserResponse>(`/users/${id}/deactivate`).then((res) => res.data),
  activate: (id: string) => apiClient.post<User>(`/users/${id}/activate`).then((res) => res.data),
  assignRoles: (id: string, roleIds: string[]) =>
    apiClient.put<User>(`/users/${id}/roles`, { roleIds }).then((res) => res.data),
  resetPassword: (id: string) =>
    apiClient
      .post<{ temporaryPassword: string }>(`/users/${id}/reset-password`)
      .then((res) => res.data),
  /** Odpowiednik `resetPassword` dla kont `loginMethod=Pin`. */
  resetPin: (id: string) =>
    apiClient.post<{ temporaryPin: string }>(`/users/${id}/reset-pin`).then((res) => res.data),
  loginEvents: (id: string) =>
    apiClient.get<LoginEvent[]>(`/users/${id}/login-events`).then((res) => res.data),
  /** `users.delete` — TRWAŁE usunięcie, wyłącznie Administrator. Zablokowane, gdy konto ma historię działań, lub przy próbie usunięcia własnego konta. */
  delete: (id: string) => apiClient.delete<void>(`/users/${id}`).then(() => undefined),
};

export const rolesApi = {
  list: () => apiClient.get<Role[]>('/roles').then((res) => res.data),
};

/** `Shop` — oddział/sklep (prototypowe „Sklep / oddział"). */
export interface Shop {
  id: string;
  companyId: string;
  name: string;
  city: string | null;
  active: boolean;
}

export const shopsApi = {
  list: () => apiClient.get<Shop[]>('/shops').then((res) => res.data),
};
