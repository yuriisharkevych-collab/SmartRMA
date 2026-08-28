import { apiClient } from './client';

/** Kształt odzwierciedla `ProductEntity` z `apps/api` (patrz `cases.api.ts` dla uzasadnienia duplikacji). */
export interface Product {
  id: string;
  companyId: string;
  manufacturerId: string;
  brandId: string | null;
  name: string;
  sku: string | null;
  /** Etap 3 — wolny tekst, zachowany dla kompatybilności wstecznej istniejących produktów. Panel Etapu 4 czyta/zapisuje wyłącznie `categoryId`. */
  category: string | null;
  categoryId: string | null;
  active: boolean;
}

/** Etap 4 (Produkty i konfiguracja formularza) — kategoria produktowa per producent, zastępuje płaską listę tekstową z Etapu 3. */
export interface ProductCategory {
  id: string;
  companyId: string;
  manufacturerId: string;
  name: string;
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

/** Etap 4 — filtry panelu "Produkty" (`GET /products`). Wszystkie opcjonalne — brak = pełna lista firmy. */
export interface ProductFilters {
  query?: string;
  manufacturerId?: string;
  brandId?: string;
  categoryId?: string;
  active?: boolean;
}

export const productsApi = {
  list: (filters: ProductFilters = {}) =>
    apiClient.get<Product[]>('/products', { params: filters }).then((res) => res.data),
  search: (query: string) =>
    apiClient.get<Product[]>('/products', { params: { query } }).then((res) => res.data),
  create: (payload: {
    manufacturerId: string;
    brandId?: string;
    name: string;
    sku?: string;
    categoryId?: string;
  }) => apiClient.post<Product>('/products', payload).then((res) => res.data),
  /** Edycja, w tym dezaktywacja przez `active:false` — `Product` NIE jest fizycznie usuwany (historyczne `CaseItem`/`OrderItem`). */
  update: (
    id: string,
    payload: {
      manufacturerId?: string;
      brandId?: string;
      name?: string;
      sku?: string;
      categoryId?: string;
      active?: boolean;
    },
  ) => apiClient.patch<Product>(`/products/${id}`, payload).then((res) => res.data),
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

/** Etap 4 — kategorie produktowe per producent (`ProductsController`, gated `products.view`/`products.manage`, zero nowego uprawnienia RBAC). Dezaktywacja (`active:false`) NIGDY nie usuwa kategorii ani nie zmienia `Product.categoryId` istniejących produktów. */
export const productCategoriesApi = {
  list: (manufacturerId?: string) =>
    apiClient
      .get<ProductCategory[]>('/product-categories', { params: { manufacturerId } })
      .then((res) => res.data),
  create: (payload: { manufacturerId: string; name: string }) =>
    apiClient.post<ProductCategory>('/product-categories', payload).then((res) => res.data),
  update: (id: string, payload: { name?: string; active?: boolean }) =>
    apiClient.patch<ProductCategory>(`/product-categories/${id}`, payload).then((res) => res.data),
};
