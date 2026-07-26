import { Outlet } from 'react-router-dom';

/**
 * Powłoka Portalu Klienta — CELOWO nie współdzieli `AppLayout` (inny
 * odbiorca, inny model dostępu: kod/token per sprawa, nie JWT pracownika).
 * DECISIONS.md, "Portal Klienta — Code Review": "client-login.js i
 * client-portal.js... nie wywołują initShell()/renderSidebar()... nie mają
 * odpowiednika po stronie klienta detalicznego". Ten layout to ten sam
 * podział przeniesiony do React.
 */
export function PortalLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <span className="text-lg font-semibold">SmartRMA — Portal Klienta</span>
      </header>
      <main className="mx-auto max-w-2xl p-6">
        <Outlet />
      </main>
    </div>
  );
}
