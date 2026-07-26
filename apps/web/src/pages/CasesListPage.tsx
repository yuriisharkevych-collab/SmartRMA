import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { casesApi } from '@/api/cases.api';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { PermissionGate } from '@/components/common/PermissionGate';

/** Odpowiednik `cases.html` — lista + filtry (WORKFLOW.md §7 statusy) do dopisania przy implementacji ekranu. */
export function CasesListPage() {
  const { data, isLoading } = useQuery({ queryKey: ['cases'], queryFn: casesApi.list });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Reklamacje</h1>
        <PermissionGate permissions={['cases.create']}>
          <Link to="/cases/new" className="rounded bg-gray-900 px-3 py-2 text-sm text-white">
            Nowa reklamacja
          </Link>
        </PermissionGate>
      </div>

      {isLoading && <LoadingIndicator />}

      {data && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">Numer</th>
              <th className="py-2">Status</th>
              <th className="py-2">Priorytet</th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id} className="border-b border-gray-100">
                <td className="py-2">
                  <Link to={`/cases/${c.id}`} className="text-blue-600 hover:underline">
                    {c.caseNumber}
                  </Link>
                </td>
                <td className="py-2">{c.status}</td>
                <td className="py-2">{c.priority}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
