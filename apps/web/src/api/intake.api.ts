import { publicClient } from './publicClient';

export interface PublicCompanyBranding {
  name: string;
  address: string | null;
  nip: string | null;
  logoUrl: string | null;
  privacyPolicyUrl: string | null;
  privacyPolicyVersion: string | null;
  termsUrl: string | null;
}

export interface PublicManufacturer {
  id: string;
  name: string;
  requiresSerialNumber: boolean;
  requiresFrameNumber: boolean;
  requiresProofOfPurchase: boolean;
  minPhotos: number;
  requiresVideo: boolean;
  maxPhotos: number;
  maxAttachmentSizeMb: number;
  /** Etap 3 — kategorie produktowe skonfigurowane PER PRODUCENT (`GET /intake/brand/:brandSlug/manufacturer`) — zastępuje dawną, wspólną dla wszystkich firm listę na sztywno w kodzie. `undefined` na formularzu firmowym generycznym (ten krok tam nie istnieje). */
  productCategories?: string[];
}

export interface SubmitPublicComplaintPayload {
  customer: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    postalCode: string;
  };
  manufacturerId: string;
  productName: string;
  serialNumber?: string;
  frameNumber?: string;
  purchaseProofNumber?: string;
  description: string;
  incompleteOrder?: boolean;
  incompleteOrderDetails?: string;
  requiredConsent: boolean;
  marketingConsent?: boolean;
  documentSharingConsent?: boolean;
}

export interface PublicComplaintCreated {
  caseNumber: string;
  accessToken: string;
  expiresIn: number;
}

export interface PublicPartner {
  id: string;
  name: string;
}

export type BrandReporterType = 'Customer' | 'Partner';
export type BrandPartnerRequestType = 'Presale' | 'OnBehalfOfCustomer';
export type BrandContactPreference = 'Customer' | 'Partner';
export type BrandIssueType = 'MissingPart' | 'DamagedPart' | 'Defect' | 'Other';

export interface BrandComplaintCustomer {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
}

export interface BrandComplaintPartnerContact {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

/** Formularz rozgałęziony marki (np. Veres Meble) — patrz `BrandComplaintFormPage.tsx`. Ta sama firma może mieć kilka marek, każda pod własnym `brandSlug` (`Manufacturer.publicFormSlug`), obok formularza firmowego pod `orgSlug` (`Company.slug`). */
export interface SubmitBrandComplaintPayload {
  reporterType: BrandReporterType;
  customer?: BrandComplaintCustomer;
  partnerCompanyId?: string;
  partnerRequestType?: BrandPartnerRequestType;
  contactPreference?: BrandContactPreference;
  partnerContact?: BrandComplaintPartnerContact;
  category: string;
  productName: string;
  color?: string;
  serialNumber?: string;
  purchaseProofNumber?: string;
  issueType: BrandIssueType;
  affectedPartNumber?: string;
  description: string;
  requiredConsent: boolean;
  marketingConsent?: boolean;
  documentSharingConsent?: boolean;
}

/** Każda organizacja (Sklep, Producent/Dystrybutor) ma WŁASNY formularz publiczny pod swoim `orgSlug` — patrz `PublicComplaintFormPage.tsx` (`useParams().orgSlug`). */
export const intakeApi = {
  getBranding: (orgSlug: string) =>
    publicClient.get<PublicCompanyBranding>(`/intake/${orgSlug}/company`).then((res) => res.data),
  getManufacturers: (orgSlug: string) =>
    publicClient
      .get<PublicManufacturer[]>(`/intake/${orgSlug}/manufacturers`)
      .then((res) => res.data),
  submitComplaint: (orgSlug: string, payload: SubmitPublicComplaintPayload) =>
    publicClient
      .post<PublicComplaintCreated>(`/intake/${orgSlug}/complaints`, payload)
      .then((res) => res.data),

  // --- Formularz rozgałęziony marki (np. Veres Meble) ---
  getBrandBranding: (brandSlug: string) =>
    publicClient
      .get<PublicCompanyBranding>(`/intake/brand/${brandSlug}/company`)
      .then((res) => res.data),
  getBrandManufacturer: (brandSlug: string) =>
    publicClient
      .get<PublicManufacturer>(`/intake/brand/${brandSlug}/manufacturer`)
      .then((res) => res.data),
  getBrandPartners: (brandSlug: string) =>
    publicClient
      .get<PublicPartner[]>(`/intake/brand/${brandSlug}/partners`)
      .then((res) => res.data),
  submitBrandComplaint: (brandSlug: string, payload: SubmitBrandComplaintPayload) =>
    publicClient
      .post<PublicComplaintCreated>(`/intake/brand/${brandSlug}/complaints`, payload)
      .then((res) => res.data),
};
