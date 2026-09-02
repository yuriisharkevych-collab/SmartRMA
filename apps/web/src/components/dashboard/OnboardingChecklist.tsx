import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { manufacturersApi } from '@/api/manufacturers.api';
import { partnershipsApi } from '@/api/partnerships.api';
import { productCategoriesApi, productsApi } from '@/api/products.api';
import { useAuth } from '@/hooks/useAuth';

/**
 * Etap 6 — checklist onboardingu na Dashboardzie Producenta/Dystrybutora.
 * `POST /companies/signup` zakłada od razu Producenta i jedną (domyślną)
 * Markę o nazwie firmy — stąd te dwa kroki liczą się jako zrobione od razu, a
 * checklist skupia się na tym, co REALNIE trzeba jeszcze zrobić, żeby
 * formularz publiczny miał co pokazać klientowi (kategorie/produkty) i żeby
 * firma miała z kim wymieniać reklamacje B2B (partnerzy — opcjonalnie).
 * Znika automatycznie, gdy wszystkie WYMAGANE kroki są zrobione (Partnerzy są
 * opcjonalni, nie blokują zniknięcia) — nie zaśmieca Dashboardu na stałe.
 */
export function OnboardingChecklist() {
  const { hasPermission } = useAuth();
  const canViewManufacturers = hasPermission('manufacturers.view');
  const canViewProducts = hasPermission('products.view');
  const canViewPartnerships = hasPermission('partnerships.view');

  const { data: manufacturers, isLoading: loadingManufacturers } = useQuery({
    queryKey: ['manufacturers'],
    queryFn: manufacturersApi.list,
    enabled: canViewManufacturers,
  });
  const { data: categories, isLoading: loadingCategories } = useQuery({
    queryKey: ['product-categories', undefined],
    queryFn: () => productCategoriesApi.list(),
    enabled: canViewProducts,
  });
  const { data: products, isLoading: loadingProducts } = useQuery({
    queryKey: ['products', {}],
    queryFn: () => productsApi.list(),
    enabled: canViewProducts,
  });
  const { data: partnerships } = useQuery({
    queryKey: ['partnerships'],
    queryFn: partnershipsApi.list,
    enabled: canViewPartnerships,
    retry: false,
  });

  const loading = loadingManufacturers || loadingCategories || loadingProducts;
  if (loading || !manufacturers) return null;

  const steps = [
    {
      key: 'manufacturer',
      label: 'Producent i marka',
      done: manufacturers.length > 0,
      href: '/manufacturers',
      cta: 'Skonfiguruj producenta',
    },
    {
      key: 'categories',
      label: 'Kategorie produktowe',
      done: (categories?.length ?? 0) > 0,
      href: '/products',
      cta: 'Dodaj kategorię',
    },
    {
      key: 'products',
      label: 'Produkty',
      done: (products?.length ?? 0) > 0,
      href: '/products',
      cta: 'Dodaj produkt',
    },
    {
      key: 'partners',
      label: 'Partnerzy B2B',
      done: (partnerships?.length ?? 0) > 0,
      href: '/partners',
      cta: 'Zaproś partnera',
      optional: true,
    },
  ];

  const requiredDone = steps.filter((s) => !s.optional).every((s) => s.done);
  if (requiredDone) return null;

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="card" style={{ marginBottom: 20, borderColor: 'var(--primary-soft, #dbe4ff)' }}>
      <div className="card-header">
        <h3>Konfiguracja firmy</h3>
        <span className="text-sm text-muted">
          {doneCount}/{steps.length} kroków
        </span>
      </div>
      <div style={{ padding: '4px 20px 16px' }}>
        <p className="text-sm text-muted" style={{ marginTop: 0, marginBottom: 14 }}>
          Kilka kroków dzieli Cię od pierwszej prawdziwej reklamacji przez formularz publiczny.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {steps.map((step) => (
            <div
              key={step.key}
              className="flex items-center justify-between"
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                background: step.done
                  ? 'var(--green-soft, #e8f7ee)'
                  : 'var(--surface-alt, #f7f7f8)',
              }}
            >
              <span className="flex items-center gap-8">
                <span style={{ fontSize: 16 }}>{step.done ? '✅' : '⬜'}</span>
                <span style={{ fontWeight: 500 }}>{step.label}</span>
                {step.optional && (
                  <span className="text-xs text-muted" style={{ marginLeft: 4 }}>
                    (opcjonalnie)
                  </span>
                )}
              </span>
              {!step.done && (
                <Link to={step.href} className="btn btn-secondary btn-sm">
                  {step.cta}
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
