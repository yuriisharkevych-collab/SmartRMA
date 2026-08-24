import { createContext, useContext, useState } from 'react';
import { Outlet } from 'react-router-dom';

/**
 * Problem 8e (raport wdrożeniowy 17.08) — nagłówek Portalu pokazywał na
 * stałe "SmartRMA", nigdy nazwę firmy, z którą klient faktycznie się
 * kontaktuje. `PortalLayout` (ten plik) nie ma jak SAM znać tej nazwy —
 * firma wynika z zalogowanej sprawy, a to dane, które ładuje dopiero
 * `ClientPortalPage` (dziecko `<Outlet/>`), już PO zalogowaniu. Kontekst
 * pozwala dziecku "podać" nazwę do rodzica bez przenoszenia zapytania o
 * sprawę w górę drzewa. Ekran logowania (przed zalogowaniem, firma
 * jeszcze nieznana) celowo zostaje przy neutralnym "SmartRMA".
 */
const PortalBrandContext = createContext<(name: string | null) => void>(() => {});

export function usePortalBrand(): (name: string | null) => void {
  return useContext(PortalBrandContext);
}

export function PortalLayout() {
  const [brandName, setBrandName] = useState<string | null>(null);

  return (
    <PortalBrandContext.Provider value={setBrandName}>
      <div className="public-page">
        <header className="public-header">
          <div className="brand">
            <span style={{ fontWeight: 700, fontSize: 15 }}>{brandName ?? 'SmartRMA'}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Portal Klienta</span>
          </div>
        </header>
        <main className="public-main">
          <Outlet />
        </main>
      </div>
    </PortalBrandContext.Provider>
  );
}
