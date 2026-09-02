import { apiClient } from './client';

export type SubmissionMethod = 'Email' | 'PortalB2B' | 'FormularzWWW';
export type TransportOrganizer = 'Klient' | 'Sklep' | 'Producent';

export interface ManufacturerSla {
  responseDays: number | null;
  repairDays: number | null;
  reminderAfterDays: number | null;
  escalationAfterDays: number | null;
  /** Przypomnienia o reakcji — nadpisanie wartości domyślnej firmy (Ustawienia → Przypomnienia). `null` = użyj wartości domyślnej. */
  statusStaleDaysOverride: number | null;
  caseAgeStaleDaysOverride: number | null;
}

export interface ManufacturerLogistics {
  returnAddress: string | null;
  transportOrganizer: TransportOrganizer;
  manufacturerProvidesLabel: boolean;
  shopCanOrderCourier: boolean;
  /** Decimal w bazie — serializowany jako string, żeby nie tracić precyzji kwoty. */
  shopCourierCost: string;
  originalPackagingRequired: boolean;
  substitutePackagingAllowed: boolean;
  transportProtectionNote: string | null;
  productConditionNote: string | null;
}

export interface ManufacturerAutomation {
  autoEmailEnabled: boolean;
  autoCloseEnabled: boolean;
  autoCloseDays: number;
}

/** Kształt odzwierciedla `ManufacturerEntity` z `apps/api`. Nazwa/kraj/NIP/kontakt żyją na powiązanym `Contractor` (patrz `contractors.api.ts`) — `Manufacturer` to PROFIL reklamacyjny kontrahenta, nie osobna firma. */
export interface Manufacturer {
  id: string;
  contractorId: string;
  companyId: string;
  submissionMethod: SubmissionMethod;
  complaintEmail: string | null;
  portalUrl: string | null;
  portalLogin: string | null;
  /** Etap 6 — formularz rozgałęziony marki (`/reklamacja-marka/:slug`), np. Veres Meble. `null` = ten producent nie ma własnego formularza (używa wyłącznie `/reklamacja/:orgSlug` firmy). */
  publicFormSlug: string | null;
  publicFormDisplayName: string | null;
  /** Ścieżka do `GET /manufacturers/:id/logo` (publiczny) — `null`, gdy nie wgrano jeszcze logo formularza marki. */
  publicFormLogoUrl: string | null;
  complaintProcedure: string | null;
  requiredDocumentsNote: string | null;
  requiredPhotosNote: string | null;
  requiredVideosNote: string | null;
  requiresSerialNumber: boolean;
  requiresFrameNumber: boolean;
  requiresProofOfPurchase: boolean;
  /** Wymagania EGZEKWOWANE przez backend przy zmianie statusu (CASE-002). */
  minPhotos: number;
  requiresVideo: boolean;
  maxPhotos: number;
  maxAttachmentSizeMb: number;
  active: boolean;
  sla: ManufacturerSla | null;
  logistics: ManufacturerLogistics | null;
  automation: ManufacturerAutomation | null;
}

export interface ManufacturerProfilePayload {
  submissionMethod?: SubmissionMethod;
  complaintEmail?: string;
  minPhotos?: number;
  requiresVideo?: boolean;
  portalUrl?: string;
  portalLogin?: string;
  publicFormSlug?: string;
  publicFormDisplayName?: string;
  complaintProcedure?: string;
  requiredDocumentsNote?: string;
  requiredPhotosNote?: string;
  requiredVideosNote?: string;
  requiresSerialNumber?: boolean;
  requiresFrameNumber?: boolean;
  requiresProofOfPurchase?: boolean;
  maxPhotos?: number;
  maxAttachmentSizeMb?: number;
  active?: boolean;
}

export interface LogisticsPayload {
  returnAddress?: string;
  transportOrganizer?: TransportOrganizer;
  manufacturerProvidesLabel?: boolean;
  shopCanOrderCourier?: boolean;
  shopCourierCost?: number;
  originalPackagingRequired?: boolean;
  substitutePackagingAllowed?: boolean;
  transportProtectionNote?: string;
  productConditionNote?: string;
}

export interface AutomationPayload {
  autoEmailEnabled?: boolean;
  autoCloseEnabled?: boolean;
  autoCloseDays?: number;
}

/** `UpdateManufacturerSlaDto` — progi dniowe. `null` = brak progu (np. „brak przypomnień dla tego producenta"). */
export interface SlaPayload {
  responseDays?: number | null;
  repairDays?: number | null;
  reminderAfterDays?: number | null;
  escalationAfterDays?: number | null;
  statusStaleDaysOverride?: number | null;
  caseAgeStaleDaysOverride?: number | null;
}

export const manufacturersApi = {
  list: () => apiClient.get<Manufacturer[]>('/manufacturers').then((res) => res.data),
  create: (payload: ManufacturerProfilePayload & { contractorId: string }) =>
    apiClient.post<Manufacturer>('/manufacturers', payload).then((res) => res.data),
  update: (id: string, payload: ManufacturerProfilePayload) =>
    apiClient.patch<Manufacturer>(`/manufacturers/${id}`, payload).then((res) => res.data),
  updateLogistics: (id: string, payload: LogisticsPayload) =>
    apiClient.put<Manufacturer>(`/manufacturers/${id}/logistics`, payload).then((res) => res.data),
  updateAutomation: (id: string, payload: AutomationPayload) =>
    apiClient.put<Manufacturer>(`/manufacturers/${id}/automation`, payload).then((res) => res.data),
  updateSla: (id: string, payload: SlaPayload) =>
    apiClient.put<Manufacturer>(`/manufacturers/${id}/sla`, payload).then((res) => res.data),
  /** Etap 6 — logo formularza marki (odrębne od logo firmy, `companiesApi.uploadLogo`). */
  uploadLogo: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient
      .post<Manufacturer>(`/manufacturers/${id}/logo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((res) => res.data);
  },
  logoAbsoluteUrl: (logoUrl: string) => `${apiClient.defaults.baseURL}${logoUrl}`,
  /** `manufacturers.delete` — TRWAŁE usunięcie, wyłącznie Administrator. Zablokowane, gdy producent ma przypisane produkty/marki. */
  delete: (id: string) => apiClient.delete<void>(`/manufacturers/${id}`).then(() => undefined),
};
