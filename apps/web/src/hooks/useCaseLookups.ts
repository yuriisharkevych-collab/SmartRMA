import { useQuery } from '@tanstack/react-query';
import { contractorsApi } from '@/api/contractors.api';
import { customersApi } from '@/api/customers.api';
import { manufacturersApi } from '@/api/manufacturers.api';
import { brandsApi, productsApi } from '@/api/products.api';
import { usersApi } from '@/api/users.api';
import { useAuth } from './useAuth';

/**
 * Słowniki do rozwinięcia identyfikatorów na nazwy w liście spraw —
 * odpowiednik `SMARTRMA_DATA.findCustomer/findManufacturer/findUser` z
 * prototypu, który trzymał wszystko w jednym obiekcie w pamięci.
 *
 * Każde zapytanie jest bramkowane uprawnieniem (`enabled`), bo RBAC.md daje
 * różnym rolom różny dostęp — np. `users.view` ma tylko Kierownik i
 * Administrator, więc Pracownik zobaczy w kolumnie "Właściciel" kreskę
 * zamiast nazwiska. To świadome ustępstwo: alternatywą byłoby dosypanie nazw
 * do odpowiedzi `GET /cases` po stronie API, co rozszerza kontrakt tylko na
 * potrzeby jednego widoku.
 */
export function useCaseLookups() {
  const { hasPermission } = useAuth();

  const customers = useQuery({
    queryKey: ['customers'],
    queryFn: customersApi.list,
    enabled: hasPermission('customers.view'),
  });
  const products = useQuery({
    queryKey: ['products'],
    queryFn: productsApi.list,
    enabled: hasPermission('products.view'),
  });
  const manufacturers = useQuery({
    queryKey: ['manufacturers'],
    queryFn: manufacturersApi.list,
    enabled: hasPermission('manufacturers.view'),
  });
  const contractors = useQuery({
    queryKey: ['contractors'],
    queryFn: contractorsApi.list,
    enabled: hasPermission('contractors.view'),
  });
  const users = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
    enabled: hasPermission('users.view'),
  });
  // Etap 2 (Dashboard Producenta/Dystrybutora) — kolumna "Marka" na liście spraw.
  const brands = useQuery({
    queryKey: ['brands'],
    queryFn: brandsApi.list,
    enabled: hasPermission('brands.manage'),
  });

  const contractorById = new Map((contractors.data ?? []).map((c) => [c.id, c]));
  const productById = new Map((products.data ?? []).map((p) => [p.id, p]));
  const brandById = new Map((brands.data ?? []).map((b) => [b.id, b]));

  return {
    customerById: new Map((customers.data ?? []).map((c) => [c.id, c])),
    productById,
    userById: new Map((users.data ?? []).map((u) => [u.id, u])),
    users: users.data ?? [],
    manufacturers: manufacturers.data ?? [],
    contractors: contractors.data ?? [],
    contractorById,
    brandById,
    /** `Manufacturer` to profil reklamacyjny — nazwa firmy żyje na powiązanym `Contractor`. */
    manufacturerName: (manufacturerId: string | null | undefined): string => {
      if (!manufacturerId) return '—';
      const manufacturer = (manufacturers.data ?? []).find((m) => m.id === manufacturerId);
      if (!manufacturer) return '—';
      return contractorById.get(manufacturer.contractorId)?.name ?? '—';
    },
    /** Marka produktu tej pozycji sprawy — `—`, gdy produkt spoza katalogu (`brandId=null`, model wpisany "jak na paragonie") albo brak uprawnienia `brands.manage`. */
    brandName: (productId: string | null | undefined): string => {
      if (!productId) return '—';
      const product = productById.get(productId);
      if (!product?.brandId) return '—';
      return brandById.get(product.brandId)?.name ?? '—';
    },
  };
}
