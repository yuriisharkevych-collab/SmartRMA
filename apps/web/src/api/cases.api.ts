import { apiClient } from './client';

/** Kształt odzwierciedla `CaseEntity` z `apps/api` — celowo zdублowany, nie importowany między apps (osobne bundle'e, `apps/web` nie zależy od `apps/api`). Rozważyć w przyszłości pakiet `packages/shared-types`, jeśli rozjazd zacznie boleć. */
export interface CaseSummary {
  id: string;
  caseNumber: string;
  status: string;
  priority: string;
  customerId: string;
  createdAt: string;
}

/**
 * Wzorzec dla pozostałych 16 modułów (Users, Manufacturers, ...) — jeden
 * plik `*.api.ts` per zasób, cienka warstwa nad `apiClient`, bez logiki.
 * Nie skopiowany 1:1 dla wszystkich w tym scaffoldzie (redundancja bez
 * wartości na tym etapie) — patrz raport końcowy.
 */
export const casesApi = {
  list: () => apiClient.get<CaseSummary[]>('/cases').then((res) => res.data),
  getById: (id: string) => apiClient.get<CaseSummary>(`/cases/${id}`).then((res) => res.data),
};
