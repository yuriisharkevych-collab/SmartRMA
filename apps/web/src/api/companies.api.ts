import { apiClient } from './client';
import { publicClient } from './publicClient';
import type { AuthTokens } from '@/types/auth';

/** Kształt odzwierciedla `CompanyEntity` z `apps/api`. */
export interface Company {
  id: string;
  name: string;
  /** Etap 2 (Dashboard Producenta/Dystrybutora) — rozstrzyga, który layout Dashboardu renderować. */
  type: 'Shop' | 'ManufacturerDistributor';
  orgKind: 'Producent' | 'Dystrybutor' | null;
  /** Publiczny Formularz Reklamacyjny — `/reklamacja/:slug` tej organizacji. */
  slug: string | null;
  nip: string | null;
  regon: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  /** Portal Klienta — link "Polityka Prywatności" pod sekcją RODO formularza (pobierany dynamicznie, nigdy wpisany na stałe). */
  privacyPolicyUrl: string | null;
  privacyPolicyVersion: string | null;
  /** Publiczny Formularz Reklamacyjny — link "Regulamin" na kroku RODO. */
  termsUrl: string | null;
  /** Ścieżka względna do `GET /companies/:id/logo` (publiczny) — `null`, gdy firma nie wgrała jeszcze logo. */
  logoUrl: string | null;
  active: boolean;
}

export interface UpdateCompanyPayload {
  name?: string;
  nip?: string;
  regon?: string;
  address?: string;
  email?: string;
  phone?: string;
  website?: string;
  privacyPolicyUrl?: string;
  privacyPolicyVersion?: string;
  termsUrl?: string;
}

/** `POST /companies/signup` (Etap 6) — publiczny, bez sesji. */
export interface CompanySignupPayload {
  companyName: string;
  orgKind: 'Producent' | 'Dystrybutor';
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  password: string;
}

export const companiesApi = {
  /** Onboarding samoobsługowy nowej firmy Producent/Dystrybutor — zwraca AuthTokens, logowanie od razu (jak `partnershipsApi.acceptInvite`). */
  signup: (payload: CompanySignupPayload) =>
    publicClient.post<AuthTokens>('/companies/signup', payload).then((res) => res.data),
  me: () => apiClient.get<Company>('/companies/me').then((res) => res.data),
  update: (payload: UpdateCompanyPayload) =>
    apiClient.patch<Company>('/companies/me', payload).then((res) => res.data),
  uploadLogo: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient
      .post<Company>('/companies/me/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((res) => res.data);
  },
  /** `logoUrl` z `Company` jest już ścieżką API (`/companies/:id/logo`) — ta funkcja dokleja tylko `baseURL`, endpoint jest publiczny (bez tokenu), więc gołe `<img src>` też zadziała. */
  logoAbsoluteUrl: (logoUrl: string) => `${apiClient.defaults.baseURL}${logoUrl}`,
};
