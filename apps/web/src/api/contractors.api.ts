import { apiClient } from './client';

export type ContractorCategory =
  'Manufacturer' | 'Distributor' | 'LogisticsPartner' | 'Supplier' | 'Other';

/** Kształt odzwierciedla `ContractorEntity` z `apps/api`. `Contractor` trzyma dane FIRMOWE (nazwa, NIP, adres, kontakt); reklamacyjny profil tej firmy to `Manufacturer` (patrz `manufacturers.api.ts`). */
export interface Contractor {
  id: string;
  companyId: string;
  name: string;
  category: ContractorCategory;
  country: string | null;
  nip: string | null;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactPerson: string | null;
  active: boolean;
  hasManufacturerProfile: boolean;
}

export interface ContractorPayload {
  name?: string;
  category?: ContractorCategory;
  country?: string;
  nip?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactPerson?: string;
  active?: boolean;
}

export const contractorsApi = {
  list: () => apiClient.get<Contractor[]>('/contractors').then((res) => res.data),
  create: (payload: ContractorPayload & { name: string; category: ContractorCategory }) =>
    apiClient.post<Contractor>('/contractors', payload).then((res) => res.data),
  update: (id: string, payload: ContractorPayload) =>
    apiClient.patch<Contractor>(`/contractors/${id}`, payload).then((res) => res.data),
};
