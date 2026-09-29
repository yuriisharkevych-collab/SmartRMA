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

export type OrganizationType = 'Shop' | 'ManufacturerDistributor';

/**
 * Etap 6 — "Połącz z istniejącą firmą". Kształt odzwierciedla
 * `SearchCompanyResultEntity` z `apps/api` — WYŁĄCZNIE dane bezpieczne do
 * potwierdzenia "czy to właściwa firma" (bez adresu/e-maila/użytkowników/
 * produktów/marek drugiej firmy, patrz doc-comment backendu).
 */
export interface SearchCompanyResult {
  id: string;
  name: string;
  nip: string;
  type: OrganizationType;
  alreadyConnected: boolean;
  pendingRequest: boolean;
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

  // --- Etap 5/6 — wołający (Sklep ALBO Producent/Dystrybutor, symetryczne od
  // Etapu 6) zaprasza NOWEGO partnera e-mailem. BEZ `brandIds` (Etap 6,
  // decyzja właściciela) — marki nie są częścią zapraszania/łączenia
  // partnera, każda firma zarządza własnymi niezależnie. ---
  invitePartner: (companyName: string, adminEmail: string, nip: string) =>
    apiClient
      .post<Partnership>('/partnerships/invite-partner', { companyName, adminEmail, nip })
      .then((res) => res.data),

  // --- Etap 6 — "Połącz z istniejącą firmą" (symetryczne, obie strony) ---
  /** `POST`, NIE `GET` — NIP w body, nie w query string (nie trafia do logów dostępu). Zwraca `null`, gdy nie znaleziono (backend odpowiada `{}` — puste query-object, patrz doc-comment kontrolera — normalizowane tu do `null`, wygodniejsze dla wywołującego). */
  searchCompanyByNip: (nip: string) =>
    apiClient
      .post<SearchCompanyResult | Record<string, never>>('/partnerships/search-company', { nip })
      .then((res) => ('id' in res.data ? res.data : null) as SearchCompanyResult | null),
  /** Firma znaleziona WCZEŚNIEJ przez `searchCompanyByNip` — `targetCompanyId` weryfikowany od nowa na serwerze. */
  requestConnection: (targetCompanyId: string) =>
    apiClient
      .post<Partnership>('/partnerships/request-connection', { targetCompanyId })
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
