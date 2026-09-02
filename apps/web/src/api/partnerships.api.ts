import { apiClient } from './client';
import { publicClient } from './publicClient';
import type { AuthTokens } from '@/types/auth';

export type PartnershipStatus = 'Invited' | 'Active' | 'Inactive' | 'Rejected';

export interface PartnershipBrandSummary {
  id: string;
  name: string;
}

/** Kształt odzwierciedla `PartnershipEntity` z `apps/api` — współpraca Sklep ↔ Producent/Dystrybutor, scope'owana do konkretnych marek (Faza 4 planu B2B). */
export interface Partnership {
  id: string;
  shopCompanyId: string;
  shopCompanyName: string;
  distributorCompanyId: string;
  distributorCompanyName: string;
  status: PartnershipStatus;
  invitedByUserId: string;
  invitedAt: string;
  acceptedAt: string | null;
  deactivatedAt: string | null;
  brands: PartnershipBrandSummary[];
  /** Etap 5 — liczba spraw tego partnerstwa (formularz marki + przekazania). */
  caseCount: number;
  /** `true` = zaproszenie e-mailem wysłane (`invitePartner`), zaproszony jeszcze NIE założył konta. */
  hasPendingInvite: boolean;
  inviteEmail: string | null;
}

/** `GET /partnerships/invite/:token` (publiczny) — co pokazać zaproszonemu, zanim założy konto. */
export interface PartnerInviteInfo {
  companyName: string;
  distributorName: string;
  email: string;
  brandNames: string[];
}

export const partnershipsApi = {
  list: () => apiClient.get<Partnership[]>('/partnerships').then((res) => res.data),
  getById: (id: string) =>
    apiClient.get<Partnership>(`/partnerships/${id}`).then((res) => res.data),
  invite: (distributorSlug: string, brandIds: string[]) =>
    apiClient
      .post<Partnership>('/partnerships/invite', { distributorSlug, brandIds })
      .then((res) => res.data),
  accept: (id: string) =>
    apiClient.post<Partnership>(`/partnerships/${id}/accept`).then((res) => res.data),
  reject: (id: string) =>
    apiClient.post<Partnership>(`/partnerships/${id}/reject`).then((res) => res.data),
  deactivate: (id: string) =>
    apiClient.post<Partnership>(`/partnerships/${id}/deactivate`).then((res) => res.data),

  // --- Etap 5 — Dystrybutor zaprasza NOWEGO partnera e-mailem ---
  invitePartner: (companyName: string, adminEmail: string, brandIds: string[]) =>
    apiClient
      .post<Partnership>('/partnerships/invite-partner', { companyName, adminEmail, brandIds })
      .then((res) => res.data),

  // --- Publiczne (bez sesji) — zaproszony akceptuje i zakłada własne konto ---
  getInviteInfo: (token: string) =>
    publicClient.get<PartnerInviteInfo>(`/partnerships/invite/${token}`).then((res) => res.data),
  acceptInvite: (
    token: string,
    payload: { firstName: string; lastName: string; password: string },
  ) =>
    publicClient
      .post<AuthTokens>(`/partnerships/invite/${token}/accept`, payload)
      .then((res) => res.data),
};
