import { apiClient } from './client';

export interface NamedCount {
  key: string;
  label: string;
  count: number;
}

export interface MonthlyCount {
  month: string;
  count: number;
}

export interface ManufacturerReportRow {
  manufacturerId: string;
  name: string;
  caseCount: number;
  accepted: number;
  rejected: number;
  acceptanceRate: number | null;
  avgResponseDays: number | null;
  avgResolutionDays: number | null;
  slaResponseDays: number | null;
  slaBreaches: number;
}

export interface EmployeeReportRow {
  userId: string;
  name: string;
  total: number;
  closed: number;
  open: number;
  overdue: number;
  avgResolutionDays: number | null;
}

export interface ShopReportRow {
  shopId: string;
  name: string;
  total: number;
  closed: number;
  closeRate: number | null;
  avgResolutionDays: number | null;
}

export interface TopItem {
  id: string;
  name: string;
  count: number;
}

export interface FinanceReport {
  productValue: string;
  pricedItems: number;
  totalItems: number;
  logisticsCost: string;
  replacements: number;
  repairs: number;
  refunds: number;
  coverageNotes: string[];
}

export interface SlaReport {
  breaches: number;
  measured: number;
  avgResponseDays: number | null;
  avgResolutionDays: number | null;
}

export interface ReportOverview {
  from: string;
  to: string;
  totalCases: number;
  closedCases: number;
  openCases: number;
  overdueCases: number;
  avgResolutionDays: number | null;
  byComplaintType: NamedCount[];
  byStatus: NamedCount[];
  bySource: NamedCount[];
  byMonth: MonthlyCount[];
  manufacturers: ManufacturerReportRow[];
  employees: EmployeeReportRow[];
  shops: ShopReportRow[];
  topProducts: TopItem[];
  topBrands: TopItem[];
  sla: SlaReport;
  finance: FinanceReport;
}

export const reportsApi = {
  overview: (from: string, to: string) =>
    apiClient
      .get<ReportOverview>('/reports/overview', { params: { from, to } })
      .then((res) => res.data),

  /** Eksport wymaga nagłówka Authorization, więc nie da się go otworzyć zwykłym `<a href>` — pobieramy jako blob i zapisujemy przez tymczasowy link. */
  exportCsv: async (from: string, to: string) => {
    const res = await apiClient.get('/reports/overview/export', {
      params: { from, to },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data as Blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smartrma-raport-${from.slice(0, 10)}_${to.slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
