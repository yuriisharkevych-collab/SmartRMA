import { apiClient } from './client';

export type DashboardSource = 'all' | 'b2b' | 'b2c';

export interface DashboardSummary {
  totalActive: number;
  overdue: number;
  dueToday: number;
  readyForPickup: number;
  myCases: number;
  /** Wiadomości od klienta jeszcze nieprzeczytane przez pracownika, we wszystkich sprawach firmy. */
  unreadMessages: number;
  /** Przypomnienia o reakcji — sprawy, które przekroczyły próg "brak zmiany statusu" i/lub "dni od zgłoszenia" (Ustawienia → Przypomnienia). */
  casesNeedingAttention: number;
  /** Faza 6 (Producent/Dystrybutor + Partnerzy B2B) — CAŁKOWITE liczby wg pochodzenia, niezależne od `source` (etykiety przełącznika). Pozostałe pola powyżej SĄ przefiltrowane przez `source`, gdy podane. */
  directCustomerTotal: number;
  partnerB2BTotal: number;
}

export const dashboardApi = {
  getSummary: (source: DashboardSource = 'all') =>
    apiClient
      .get<DashboardSummary>('/dashboard/summary', { params: { source } })
      .then((res) => res.data),
};
