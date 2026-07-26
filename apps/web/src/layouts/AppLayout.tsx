import { NavLink, Outlet } from 'react-router-dom';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useAuth } from '@/hooks/useAuth';

/**
 * Odpowiednik `initShell()`/`renderSidebar()` z prototypu (`app.js`) —
 * nawigacja bramkowana uprawnieniem, wprost wg `RBAC.md` §4 "Dostęp do
 * modułów". Ikony/branding pominięte celowo (ekran biznesowy poza zakresem
 * tego kroku).
 */
const NAV_ITEMS: Array<{ to: string; label: string; permissions: string[] }> = [
  { to: '/', label: 'Dashboard', permissions: ['cases.view'] },
  { to: '/cases', label: 'Reklamacje', permissions: ['cases.view'] },
  { to: '/manufacturers', label: 'Producenci', permissions: ['manufacturers.view'] },
  { to: '/users', label: 'Użytkownicy', permissions: ['users.view'] },
  { to: '/settings', label: 'Ustawienia', permissions: ['settings.view'] },
  { to: '/audit-log', label: 'Log audytowy', permissions: ['auditlog.view'] },
  { to: '/reports', label: 'Raporty', permissions: ['reports.view'] },
];

export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-gray-200 p-4">
        <div className="mb-6 text-lg font-semibold">SmartRMA</div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <PermissionGate key={item.to} permissions={item.permissions}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `rounded px-3 py-2 text-sm ${isActive ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`
                }
              >
                {item.label}
              </NavLink>
            </PermissionGate>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button className="text-sm text-gray-500 hover:text-gray-900" onClick={logout}>
            Wyloguj
          </button>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
