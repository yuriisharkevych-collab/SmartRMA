import { apiClient } from './client';

export interface DashboardSummary {
  totalActive: number;
  overdue: number;
  dueToday: number;
  awaitingCustomer: number;
  readyForPickup: number;
  myCases: number;
}

export const dashboardApi = {
  getSummary: () => apiClient.get<DashboardSummary>('/dashboard/summary').then((res) => res.data),
};
