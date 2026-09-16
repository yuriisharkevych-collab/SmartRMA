import { apiClient } from './client';
import { publicClient } from './publicClient';

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

/**
 * `POST /companies/signup` — publiczny, bez sesji. Fundament „Fresh Install"
 * rozszerza `orgKind` na `orgType` (dokłada `Shop`) i dokłada `nip` wymagany.
 */
export interface CompanySignupPayload {
  companyName: string;
  orgType: 'Shop' | 'Producent' | 'Dystrybutor';
  nip: string;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  password: string;
}

/** Fundament „Fresh Install" — signup NIE loguje już automatycznie, konto czeka na potwierdzenie e-maila. */
export interface SignupResult {
  message: string;
  email: string;
}

export const companiesApi = {
  /** Onboarding samoobsługowy nowej firmy (Sklep/Producent/Dystrybutor) — wysyła e-mail weryfikacyjny, NIE loguje automatycznie (AUTH-007). */
  signup: (payload: CompanySignupPayload) =>
    publicClient.post<SignupResult>('/companies/signup', payload).then((res) => res.data),
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
