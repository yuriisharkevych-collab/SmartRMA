import { apiClient } from './client';

/** Kształt odzwierciedla `CustomerEntity` z `apps/api` (patrz `cases.api.ts` dla uzasadnienia duplikacji zamiast wspólnego pakietu typów). */
export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CreateCustomerPayload {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  address?: string;
}

export interface UpdateCustomerPayload {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  notes?: string;
}

export const customersApi = {
  list: () => apiClient.get<Customer[]>('/customers').then((res) => res.data),
  search: (query: string) =>
    apiClient.get<Customer[]>('/customers', { params: { query } }).then((res) => res.data),
  create: (payload: CreateCustomerPayload) =>
    apiClient.post<Customer>('/customers', payload).then((res) => res.data),
  update: (id: string, payload: UpdateCustomerPayload) =>
    apiClient.patch<Customer>(`/customers/${id}`, payload).then((res) => res.data),
};
