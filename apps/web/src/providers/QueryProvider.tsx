import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import { useState, type ReactNode } from 'react';

/** Błędy 4xx (brak uprawnień, zły request) nie naprawią się przy ponowieniu — tylko opóźniają pokazanie komunikatu. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status && status >= 400 && status < 500) return false;
  return failureCount < 1;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: shouldRetry, staleTime: 30_000 } },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
