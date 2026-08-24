import { apiClient } from './client';

/** Kształt odzwierciedla `ProductEntity` z `apps/api` (patrz `cases.api.ts` dla uzasadnienia duplikacji). */
export interface Product {
  id: string;
  companyId: string;
  manufacturerId: string;
  brandId: string | null;
  name: string;
  sku: string | null;
  category: string | null;
  active: boolean;
}

/** Kształt odzwierciedla `BrandEntity` z `apps/api`. Marka należy do dokładnie jednego producenta (BR-076, świadome uproszczenie modelu). */
export interface Brand {
  id: string;
  companyId: string;
  manufacturerId: string;
  name: string;
  active: boolean;
  /** Etap 3 — opcjonalne nadpisania wymagań/SLA producenta. `null` = dziedzicz z producenta (patrz `BrandOverridesPayload`). */
  requiresSerialNumber: boolean | null;
  requiresFrameNumber: boolean | null;
  requiresProofOfPurchase: boolean | null;
  minPhotos: number | null;
  requiresVideo: boolean | null;
  maxPhotos: number | null;
  maxAttachmentSizeMb: number | null;
  statusStaleDaysOverride: number | null;
  caseAgeStaleDaysOverride: number | null;
}

/** `PATCH /brands/:id` — pola nadpisań, patrz `Brand`. Pominięcie pola = "nie zmieniaj", `null` wprost = "usuń nadpisanie, wróć do dziedziczenia z producenta". */
export interface BrandOverridesPayload {
  requiresSerialNumber?: boolean | null;
  requiresFrameNumber?: boolean | null;
  requiresProofOfPurchase?: boolean | null;
  minPhotos?: number | null;
  requiresVideo?: boolean | null;
  maxPhotos?: number | null;
  maxAttachmentSizeMb?: number | null;
  statusStaleDaysOverride?: number | null;
  caseAgeStaleDaysOverride?: number | null;
}

export const productsApi = {
  list: () => apiClient.get<Product[]>('/products').then((res) => res.data),
  search: (query: string) =>
    apiClient.get<Product[]>('/products', { params: { query } }).then((res) => res.data),
  create: (payload: {
    manufacturerId: string;
    brandId?: string;
    name: string;
    sku?: string;
    category?: string;
  }) => apiClient.post<Product>('/products', payload).then((res) => res.data),
};

/** `GET/POST /brands` są bramkowane uprawnieniem `brands.manage` (RBAC.md nie zna `brands.view`) — patrz `ProductsController`. */
export const brandsApi = {
  list: () => apiClient.get<Brand[]>('/brands').then((res) => res.data),
  create: (payload: { manufacturerId: string; name: string }) =>
    apiClient.post<Brand>('/brands', payload).then((res) => res.data),
  /** Marki NIE usuwamy — `Product.brandId` na nią wskazuje, a historyczne reklamacje muszą zachować dane produktu. `active=false` to soft delete (ten sam wzorzec co `Shop`/`User`). */
  update: (
    id: string,
    payload: { name?: string; manufacturerId?: string; active?: boolean } & BrandOverridesPayload,
  ) => apiClient.patch<Brand>(`/brands/${id}`, payload).then((res) => res.data),
};
