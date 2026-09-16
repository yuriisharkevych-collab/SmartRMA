import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { AppLayout } from '@/layouts/AppLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { PortalLayout } from '@/layouts/PortalLayout';
import { CaseDetailPage } from '@/pages/CaseDetailPage';
import { CaseNewPage } from '@/pages/CaseNewPage';
import { CasePrintPage } from '@/pages/CasePrintPage';
import { CasesListPage } from '@/pages/CasesListPage';
import { DashboardRouter } from '@/pages/DashboardRouter';
import { LoginPage } from '@/pages/LoginPage';
import { ManufacturersPage } from '@/pages/ManufacturersPage';
import { PartnersPage } from '@/pages/PartnersPage';
import { ProductsPage } from '@/pages/ProductsPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { UsersPage } from '@/pages/UsersPage';
import { ClientLoginPage } from '@/pages/portal/ClientLoginPage';
import { ClientNewCasePage } from '@/pages/portal/ClientNewCasePage';
import { ClientPortalPage } from '@/pages/portal/ClientPortalPage';
import { AcceptPartnerInvitePage } from '@/pages/public/AcceptPartnerInvitePage';
import { BrandComplaintFormPage } from '@/pages/public/BrandComplaintFormPage';
import { ForgotPasswordPage } from '@/pages/public/ForgotPasswordPage';
import { PublicComplaintFormPage } from '@/pages/public/PublicComplaintFormPage';
import { ResetPasswordPage } from '@/pages/public/ResetPasswordPage';
import { SignupPage } from '@/pages/public/SignupPage';
import { VerifyEmailPage } from '@/pages/public/VerifyEmailPage';

/**
 * Trasy pod powłoką pracownika (`/`), pod Portalem Klienta (`/portal`, obsługa
 * JUŻ ISTNIEJĄCEJ sprawy) i Publicznym Formularzem Reklamacyjnym (`/reklamacja`,
 * ZAKŁADA nową sprawę, bez logowania — pierwszy krok całego workflow SmartRMA)
 * są celowo rozdzielone na osobne poddrzewa z różnymi layoutami.
 */
export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [{ path: '/login', element: <LoginPage /> }],
  },
  // Etap 6 — onboarding samoobsługowy nowej firmy Producent/Dystrybutor. Poza
  // `AuthLayout`/`ProtectedRoute` z tego samego powodu co `/partner-invite/:token`:
  // zakładający nie ma jeszcze żadnej sesji ani firmy.
  { path: '/signup', element: <SignupPage /> },
  // Fundament „Fresh Install" — potwierdzenie e-maila / reset hasła, oba
  // BEZ sesji z tego samego powodu co `/signup` wyżej (token w query string
  // jest jedyną tożsamością wołającego na tym etapie).
  { path: '/verify-email', element: <VerifyEmailPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  // Publiczny Formularz Reklamacyjny — świadomie POZA każdym layoutem (nie
  // `AppLayout`/`ProtectedRoute`: klient nie ma sesji; nie `PortalLayout`: to
  // ekran PRZED istnieniem jakiejkolwiek sprawy). `.wizard-page` z
  // `design-system.css` jest samowystarczalny wizualnie. Każda organizacja
  // (Sklep, Producent/Dystrybutor) ma WŁASNY formularz pod swoim slugiem —
  // `/reklamacja` bez sluga to już rozesłany link DAWIDAM sprzed wprowadzenia
  // wielu organizacji, zostaje jako trwałe przekierowanie, żeby nie przestał działać.
  { path: '/reklamacja', element: <Navigate to="/reklamacja/dawidam" replace /> },
  { path: '/reklamacja/:orgSlug', element: <PublicComplaintFormPage /> },
  // Formularz rozgałęziony marki (np. Veres Meble) — inna organizacja może być tą
  // samą Company (jeden NIP), tylko innym `Manufacturer.publicFormSlug` — patrz
  // `BrandComplaintFormPage.tsx` i komentarz przy tym polu w schemacie.
  { path: '/reklamacja-marka/:brandSlug', element: <BrandComplaintFormPage /> },
  // Etap 5 — zaproszenie e-mailem nowego partnera (Dystrybutor → firma, która jeszcze
  // nie istnieje w SmartRMA). Poza `AppLayout`/`ProtectedRoute`: zaproszony nie ma
  // jeszcze sesji ani konta — dokładnie ten sam powód co dwie trasy `/reklamacja*` wyżej.
  { path: '/partner-invite/:token', element: <AcceptPartnerInvitePage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <DashboardRouter /> },
          { path: '/cases', element: <CasesListPage /> },
          { path: '/cases/new', element: <CaseNewPage /> },
          { path: '/cases/:id', element: <CaseDetailPage /> },
          { path: '/manufacturers', element: <ManufacturersPage /> },
          { path: '/products', element: <ProductsPage /> },
          { path: '/partners', element: <PartnersPage /> },
          { path: '/users', element: <UsersPage /> },
          { path: '/settings', element: <SettingsPage /> },
          { path: '/reports', element: <ReportsPage /> },
        ],
      },
      // Wydruk potwierdzenia — celowo POZA `AppLayout`: strona ma się drukować bez
      // sidebaru i topbaru, dokładnie jak `case-print.html` był osobnym dokumentem
      // w prototypie. Nadal pod `ProtectedRoute`, bo pobiera dane sprawy z API.
      { path: '/cases/:id/print', element: <CasePrintPage /> },
    ],
  },
  {
    path: '/portal',
    element: <PortalLayout />,
    children: [
      { path: 'login', element: <ClientLoginPage /> },
      // Tożsamość sprawy pochodzi z zapisanej sesji Portalu (token niesie `caseId`
      // wewnątrz, RBAC.md §1.2), nie z parametru URL — stała ścieżka zamiast `:caseId`.
      { path: 'case', element: <ClientPortalPage /> },
      { path: 'new-case', element: <ClientNewCasePage /> },
    ],
  },
]);
