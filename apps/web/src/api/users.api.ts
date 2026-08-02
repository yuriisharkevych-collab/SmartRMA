import { apiClient } from './client';

/** Kształt odzwierciedla `UserEntity` z `apps/api` — NIGDY `passwordHash` (DATABASE.md zasada #3). */
export interface User {
  id: string;
  companyId: string;
  shopId: string | null;
  firstName: string;
  lastName: string;
  email: string;
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

export interface CreateUserPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
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
  loginEvents: (id: string) =>
    apiClient.get<LoginEvent[]>(`/users/${id}/login-events`).then((res) => res.data),
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
