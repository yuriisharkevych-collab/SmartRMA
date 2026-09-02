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
}

/** Etap 4 (Produkty i konfiguracja formularza) — schemat Organizacja → Producent → Marka → Kategoria → Produkt. */
export interface PublicBrand {
  id: string;
  name: string;
}

export interface PublicProductCategory {
  id: string;
  name: string;
}

export interface PublicProduct {
  id: string;
  name: string;
  brandId: string | null;
  categoryId: string | null;
}

/** Wymagania rozwiązane DLA WYBRANEJ marki (`resolveRequirements`, ten sam resolver co reszta systemu) — patrz `GET /intake/brand/:brandSlug/requirements`. */
export type PublicRequirements = Pick<
  PublicManufacturer,
  | 'requiresSerialNumber'
  | 'requiresFrameNumber'
  | 'requiresProofOfPurchase'
  | 'minPhotos'
  | 'requiresVideo'
  | 'maxPhotos'
  | 'maxAttachmentSizeMb'
>;

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
  /** Etap 4 — wybór z katalogu, gdy producent go skonfigurował (patrz `intakeApi.getManufacturerProducts`). */
  productId?: string;
  brandId?: string;
  /** Fallback wolnotekstowy — wyłącznie gdy katalog producenta jest pusty. Dokładnie jedno z `productId`/`productName` musi być podane. */
  productName?: string;
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
  /** Etap 4 — krok "Marka" (pomijany w UI, gdy producent ma ≤1 aktywną markę) + wybór z katalogu (`GET /intake/brand/:brandSlug/products`). Marka sprawy wynika z `Product.brandId`, `brandId` tutaj jest tylko krokiem zawężającym listę. */
  brandId?: string;
  productId: string;
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
  getManufacturerBrands: (orgSlug: string, manufacturerId: string) =>
    publicClient
      .get<PublicBrand[]>(`/intake/${orgSlug}/manufacturers/${manufacturerId}/brands`)
      .then((res) => res.data),
  getManufacturerCategories: (orgSlug: string, manufacturerId: string) =>
    publicClient
      .get<PublicProductCategory[]>(`/intake/${orgSlug}/manufacturers/${manufacturerId}/categories`)
      .then((res) => res.data),
  getManufacturerProducts: (
    orgSlug: string,
    manufacturerId: string,
    filters: { brandId?: string; categoryId?: string } = {},
  ) =>
    publicClient
      .get<PublicProduct[]>(`/intake/${orgSlug}/manufacturers/${manufacturerId}/products`, {
        params: filters,
      })
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
  // `partnerCompanyId` (Etap 5) zawęża listę do marek objętych `PartnershipBrand` tego
  // partnera — wyłącznie UX (skraca listę), granica bezpieczeństwa jest w `submitBrandComplaint`.
  getBrandBrands: (brandSlug: string, partnerCompanyId?: string | null) =>
    publicClient
      .get<PublicBrand[]>(`/intake/brand/${brandSlug}/brands`, {
        params: partnerCompanyId ? { partnerCompanyId } : undefined,
      })
      .then((res) => res.data),
  getBrandCategories: (brandSlug: string) =>
    publicClient
      .get<PublicProductCategory[]>(`/intake/brand/${brandSlug}/categories`)
      .then((res) => res.data),
  getBrandProducts: (brandSlug: string, filters: { brandId?: string; categoryId?: string } = {}) =>
    publicClient
      .get<PublicProduct[]>(`/intake/brand/${brandSlug}/products`, { params: filters })
      .then((res) => res.data),
  getBrandRequirements: (brandSlug: string, brandId?: string) =>
    publicClient
      .get<PublicRequirements>(`/intake/brand/${brandSlug}/requirements`, { params: { brandId } })
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
