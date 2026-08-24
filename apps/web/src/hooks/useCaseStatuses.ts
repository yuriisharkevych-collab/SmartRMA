import { useQuery } from '@tanstack/react-query';
import { type CaseStatus, caseStatusesApi } from '@/api/case-statuses.api';
import { useAuth } from './useAuth';

/**
 * Katalog statusów reklamacji per firma (Status Workflow Refactor) — jedno
 * źródło prawdy dla modala zmiany statusu, filtrów listy spraw i etykiet/
 * kolorów odznak, zamiast hardkodowanych stałych po stronie frontendu.
 * `caseStatuses.view` mają wszystkie role (patrz RBAC.md) — modal zmiany
 * statusu potrzebuje katalogu, nie tylko admin.
 */
export function useCaseStatuses() {
  const { hasPermission } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['case-statuses'],
    queryFn: caseStatusesApi.list,
    enabled: hasPermission('caseStatuses.view'),
  });

  const statuses = data ?? [];
  const sorted = [...statuses].sort((a, b) => a.order - b.order);
  const activeSorted = sorted.filter((s) => s.active);
  const byCode = new Map(statuses.map((s) => [s.code, s]));
  const finalStatusCodes = new Set(statuses.filter((s) => s.isFinal).map((s) => s.code));

  return {
    statuses: sorted,
    activeStatuses: activeSorted,
    byCode,
    finalStatusCodes,
    isLoading,
    statusLabel: (code: string): string => byCode.get(code)?.label ?? code,
    statusTone: (code: string): string => resolveStatusTone(byCode.get(code)),
    isFinalStatus: (code: string): boolean => byCode.get(code)?.isFinal ?? false,
  };
}

/**
 * Kolor odznaki liczony deterministycznie z metadanych katalogu — admin NIE
 * wybiera koloru per status (poza zakresem §9 wymagań właściciela), tylko
 * etykietę/opis/kolejność/końcowość/wymóg potwierdzenia.
 */
function resolveStatusTone(status: CaseStatus | undefined): string {
  if (!status) return 'gray';
  if (status.isFinal) return 'gray';
  if (status.requiresConfirmation) return 'amber';
  if (status.order <= 2) return 'blue';
  return 'primary';
}
