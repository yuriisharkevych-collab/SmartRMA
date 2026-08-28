import { type FormEvent, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { PermissionGate } from '@/components/common/PermissionGate';
import {
  CasesIcon,
  ChevronDownIcon,
  DashboardIcon,
  ManufacturersIcon,
  ProductsIcon,
  ReportsIcon,
  SearchIcon,
  SettingsIcon,
  UsersIcon,
} from '@/components/common/icons';
import { useAuth } from '@/hooks/useAuth';

/**
 * Odpowiednik `renderSidebar()`/`renderTopbar()` z prototypu (`app.js`) —
 * te same klasy (`.sidebar`, `.nav-item`, `.topbar`, `.user-chip`...) z
 * `design-system.css`. Dwie celowe różnice względem prototypu, wymuszone
 * przez to, że logowanie jest już prawdziwe (JWT/RBAC), nie symulowane
 * przełącznikiem w `localStorage`:
 *  - brak "Podgląd jako" (role switcher) — tożsamość i uprawnienia
 *    pochodzą z tokenu, nie da się (i nie powinno) przełączać ról klientem;
 *  - brak "Resetuj dane demo" — dane są prawdziwe w Postgresie, nie
 *    seedem w `localStorage`.
 * Trzy pozycje nawigacji (Ustawienia/Log audytowy/Raporty) nie istniały w
 * tym zrzucie prototypu (`NAV_ITEMS` miało 4 pozycje) — dodane w tym samym
 * stylu, bo realny backend już ma te moduły z RBAC.
 */
const NAV_ITEMS: Array<{
  to: string;
  label: string;
  permissions: string[];
  icon: (props: { width?: number; height?: number }) => JSX.Element;
}> = [
  { to: '/', label: 'Dashboard', permissions: ['cases.view'], icon: DashboardIcon },
  { to: '/cases', label: 'Reklamacje', permissions: ['cases.view'], icon: CasesIcon },
  {
    to: '/manufacturers',
    label: 'Producenci',
    permissions: ['manufacturers.view'],
    icon: ManufacturersIcon,
  },
  {
    to: '/products',
    label: 'Produkty',
    permissions: ['products.view'],
    icon: ProductsIcon,
  },
  { to: '/users', label: 'Użytkownicy', permissions: ['users.view'], icon: UsersIcon },
  { to: '/settings', label: 'Ustawienia', permissions: ['settings.view'], icon: SettingsIcon },
  // "Log audytowy" celowo NIE ma pozycji w menu — nie był częścią zakresu MVP
  // (nie istnieje w prototypie, `NAV_ITEMS` w `app.js` miało 4 pozycje).
  // Backend `auditlog.view` i `AuditLog` (BR-088/BR-090) zostają nietknięte —
  // dziennik nadal się zapisuje, po prostu nie ma dla niego ekranu w MVP.
  { to: '/reports', label: 'Raporty', permissions: ['reports.view'], icon: ReportsIcon },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    const query = search.trim();
    if (query) navigate(`/cases?q=${encodeURIComponent(query)}`);
  }

  function handleLogout() {
    if (window.confirm('Wylogować się z SmartRMA?')) logout();
  }

  const primaryRole = user?.roles[0] ?? '—';
  // Token wydany przed dodaniem firstName/lastName do payloadu (stara sesja w localStorage)
  // niesie puste stringi — awaryjnie e-mail, dopóki `POST /auth/refresh` nie wyda nowego tokenu.
  const displayName =
    user && (user.firstName || user.lastName)
      ? `${user.firstName} ${user.lastName}`.trim()
      : (user?.email ?? '');
  const avatarInitial = (user?.firstName?.[0] ?? user?.email[0] ?? '?').toUpperCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">R</div>
          <div className="sidebar-brand-text">
            Smart<span>RMA</span>
          </div>
        </div>
        <div className="nav-section-label">Menu</div>
        {NAV_ITEMS.map((item) => (
          <PermissionGate key={item.to} permissions={item.permissions}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <item.icon />
              <span>{item.label}</span>
            </NavLink>
          </PermissionGate>
        ))}
      </aside>

      <div className="main">
        <header className="topbar">
          <form className="topbar-search" onSubmit={handleSearchSubmit}>
            <SearchIcon />
            <input
              type="text"
              placeholder="Szukaj sprawy po numerze…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
          <div className="topbar-right">
            <div
              className="user-chip"
              role="button"
              tabIndex={0}
              onClick={handleLogout}
              aria-label={`Menu użytkownika: ${displayName}, wyloguj się`}
            >
              <div className="avatar">{avatarInitial}</div>
              <div>
                <div className="user-chip-name">{displayName}</div>
                <div className="user-chip-role">{primaryRole}</div>
              </div>
              <ChevronDownIcon />
            </div>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
