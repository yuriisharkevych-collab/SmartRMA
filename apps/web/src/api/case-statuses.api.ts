import { apiClient } from './client';

export type PortalStage = 'Zgloszona' | 'Przyjeta' | 'WTrakcie' | 'Decyzja' | 'Zakonczona';

/** Kształt odzwierciedla `CaseStatusEntity` z `apps/api` — katalog statusów reklamacji per firma (Status Workflow Refactor). */
export interface CaseStatus {
  id: string;
  code: string;
  label: string;
  description: string | null;
  order: number;
  active: boolean;
  isFinal: boolean;
  isDefaultForNew: boolean;
  requiresConfirmation: boolean;
  requiredCheck: string | null;
  portalStage: PortalStage;
  defaultNextAction: string | null;
  notifyCustomerTemplateCode: string | null;
  isSystem: boolean;
}

export interface CreateCaseStatusPayload {
  label: string;
  description?: string;
  order?: number;
  isFinal?: boolean;
}

export type UpdateCaseStatusPayload = Partial<CreateCaseStatusPayload> & { active?: boolean };

export const caseStatusesApi = {
  list: () => apiClient.get<CaseStatus[]>('/case-statuses').then((res) => res.data),
  create: (payload: CreateCaseStatusPayload) =>
    apiClient.post<CaseStatus>('/case-statuses', payload).then((res) => res.data),
  update: (id: string, payload: UpdateCaseStatusPayload) =>
    apiClient.patch<CaseStatus>(`/case-statuses/${id}`, payload).then((res) => res.data),
  reorder: (statusIds: string[]) =>
    apiClient.post<CaseStatus[]>('/case-statuses/reorder', { statusIds }).then((res) => res.data),
};
