import { PlaceholderPage } from '@/components/common/PlaceholderPage';

/** Numer sprawy + kod dostępu / bezpieczny link — mechanizm ODRĘBNY od loginu pracownika, brak JWT (RBAC.md §1.2). */
export function ClientLoginPage() {
  return <PlaceholderPage title="Portal Klienta — logowanie" prototypeRef="client-login.html" />;
}
