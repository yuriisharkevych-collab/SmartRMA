import { apiClient } from './client';

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
};
