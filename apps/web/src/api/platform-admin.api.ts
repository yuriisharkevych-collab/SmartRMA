import { platformAdminClient } from './platformAdminClient';

export interface PlatformAdminSessionTokens {
  accessToken: string;
  expiresIn: number;
}

export interface PlatformAdminProfile {
  id: string;
  email: string;
  lastLoginAt: string | null;
}

/** Kształt odzwierciedla `PlatformCompanySummaryEntity` (backend) — WYŁĄCZNIE pola przeglądowe, bez użytkowników/spraw/katalogu/ustawień żadnej firmy. */
export interface PlatformCompanySummary {
  id: string;
  name: string;
  type: 'Shop' | 'ManufacturerDistributor';
  orgKind: 'Producent' | 'Dystrybutor' | null;
  active: boolean;
  createdAt: string;
}

export const platformAdminApi = {
  login: (email: string, password: string) =>
    platformAdminClient
      .post<PlatformAdminSessionTokens>('/platform-auth/login', { email, password })
      .then((res) => res.data),

  me: () =>
    platformAdminClient.get<PlatformAdminProfile>('/platform-admin/me').then((res) => res.data),

  companies: () =>
    platformAdminClient
      .get<PlatformCompanySummary[]>('/platform-admin/companies')
      .then((res) => res.data),
};
