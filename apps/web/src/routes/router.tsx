import { createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { AppLayout } from '@/layouts/AppLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { PortalLayout } from '@/layouts/PortalLayout';
import { AuditLogPage } from '@/pages/AuditLogPage';
import { CaseDetailPage } from '@/pages/CaseDetailPage';
import { CaseNewPage } from '@/pages/CaseNewPage';
import { CasesListPage } from '@/pages/CasesListPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { LoginPage } from '@/pages/LoginPage';
import { ManufacturersPage } from '@/pages/ManufacturersPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { UsersPage } from '@/pages/UsersPage';
import { ClientLoginPage } from '@/pages/portal/ClientLoginPage';
import { ClientNewCasePage } from '@/pages/portal/ClientNewCasePage';
import { ClientPortalPage } from '@/pages/portal/ClientPortalPage';

/**
 * Trasy pod powłoką pracownika (`/`) i pod Portalem Klienta (`/portal`) są
 * celowo rozdzielone na osobne poddrzewa z różnymi layoutami — ta sama
 * granica co w prototypie (`client-*.html` poza `app.js`), patrz
 * `PortalLayout.tsx`.
 */
export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [{ path: '/login', element: <LoginPage /> }],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/cases', element: <CasesListPage /> },
          { path: '/cases/new', element: <CaseNewPage /> },
          { path: '/cases/:id', element: <CaseDetailPage /> },
          { path: '/manufacturers', element: <ManufacturersPage /> },
          { path: '/users', element: <UsersPage /> },
          { path: '/settings', element: <SettingsPage /> },
          { path: '/audit-log', element: <AuditLogPage /> },
          { path: '/reports', element: <ReportsPage /> },
        ],
      },
    ],
  },
  {
    path: '/portal',
    element: <PortalLayout />,
    children: [
      { path: 'login', element: <ClientLoginPage /> },
      { path: ':caseId', element: <ClientPortalPage /> },
      { path: 'new-case', element: <ClientNewCasePage /> },
    ],
  },
]);
