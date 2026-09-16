import { apiClient } from './client';
import { publicClient } from './publicClient';
import type { AuthTokens } from '@/types/auth';

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<AuthTokens>('/auth/login', { email, password }).then((res) => res.data),

  /**
   * Fundament „Fresh Install" — cztery endpointy przed-sesyjne (potwierdzenie
   * e-maila, reset hasła), `publicClient` (bez tokenu) jak `companiesApi.signup`.
   * `resendVerification`/`forgotPassword` odpowiadają ZAWSZE 204, niezależnie
   * od tego, czy podany e-mail istnieje (przeciw enumeracji kont) — frontend
   * pokazuje ten sam neutralny komunikat sukcesu w obu przypadkach.
   */
  verifyEmail: (token: string) =>
    publicClient.post<void>('/auth/verify-email', { token }).then(() => undefined),
  resendVerification: (email: string) =>
    publicClient.post<void>('/auth/verify-email/resend', { email }).then(() => undefined),
  forgotPassword: (email: string) =>
    publicClient.post<void>('/auth/forgot-password', { email }).then(() => undefined),
  resetPassword: (token: string, password: string) =>
    publicClient.post<void>('/auth/reset-password', { token, password }).then(() => undefined),
};
