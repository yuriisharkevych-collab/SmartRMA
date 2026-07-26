import { apiClient } from './client';
import type { AuthTokens } from '@/types/auth';

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<AuthTokens>('/auth/login', { email, password }).then((res) => res.data),
};
