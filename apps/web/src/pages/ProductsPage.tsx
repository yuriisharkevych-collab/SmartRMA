import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { isApiError } from '@/api/client';
import { contractorsApi } from '@/api/contractors.api';
import { manufacturersApi } from '@/api/manufacturers.api';
import {
  brandsApi,
  productCategoriesApi,
  productsApi,
  type Brand,
  type Product,
  type ProductCategory,
} from '@/api/products.api';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { Modal } from '@/components/common/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { PlusIcon, ProductsIcon, SearchIcon } from '@/components/common/icons';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';

type Tab = 'products' | 'categories';

interface ProductFormState {
  manufacturerId: string;
  brandId: string;
  categoryId: string;
  name: string;
  sku: string;
}

const EMPTY_PRODUCT_FORM: ProductFormState = {
  manufacturerId: '',
  brandId: '',
  categoryId: '',
  name: '',
  sku: '',
};

/**
 * Etap 4 (Produkty i konfiguracja formularza) — katalog produktów Producenta/
 * Dystrybutora: Organizacja → Producent → Marka → Kategoria → Produkt. Marki
 * mają już własny ekran w `ManufacturersPage.tsx` (nadpisania wymagań,
 * Etap 3) — ta strona reużywa te same dane (`brandsApi`) zamiast duplikować
 * ich zarządzanie, i dokłada dwa BRAKUJĄCE zasoby: `Product` (katalog, do tej
 * pory tworzony wyłącznie przy okazji zakładania sprawy) i `ProductCategory`
 * (do tej pory płaska lista tekstowa na `Manufacturer`, patrz migracja
 * `20260827194200_product_categories`).
 *
 * Produkt/kategoria NIGDY nie są fizycznie usuwane — `active:false` (ten sam
 * wzorzec co `Brand`/`Manufacturer`/`User`), bo historyczne `CaseItem` mogą
 * na nie wskazywać.
 */
export function ProductsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('products.manage');

  const [tab, setTab] = useState<Tab>('products');

  // `retry:false` — panel "Produkty" jest gated `products.view`, ale te trzy
  // zależne zasoby mają WŁASNE, osobne uprawnienia (`manufacturers.view`,
  // `contractors.view`, `brands.manage`) — rola z samym `products.view` (np.
  // wąsko uprawniony Pracownik) dostanie 403 na nich, panel ma wtedy po
  // prostu pokazać "—" zamiast pętli ponawiania (ten sam wzorzec co `UsersPage`).
  const { data: manufacturersRaw } = useQuery({
    queryKey: ['manufacturers'],
    queryFn: manufacturersApi.list,
    retry: false,
  });
  const { data: contractors } = useQuery({
    queryKey: ['contractors'],
    queryFn: contractorsApi.list,
    retry: false,
  });
  const { data: brands } = useQuery({
    queryKey: ['brands'],
    queryFn: brandsApi.list,
    retry: false,
  });
  const { data: categories } = useQuery({
    queryKey: ['product-categories'],
    queryFn: () => productCategoriesApi.list(),
  });

  /** `Manufacturer` samo w sobie nie ma nazwy — żyje na powiązanym `Contractor` (patrz `manufacturers.api.ts`). */
  const manufacturers = useMemo(() => {
    const contractorById = new Map((contractors ?? []).map((c) => [c.id, c]));
    return (manufacturersRaw ?? []).map((m) => ({
      id: m.id,
      name: contractorById.get(m.contractorId)?.name ?? '—',
    }));
  }, [manufacturersRaw, contractors]);

  const manufacturerName = useMemo(() => {
    const map = new Map(manufacturers.map((m) => [m.id, m.name]));
    return (id: string) => map.get(id) ?? '—';
  }, [manufacturers]);
  const brandById = useMemo(() => new Map((brands ?? []).map((b) => [b.id, b])), [brands]);
  const categoryById = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Produkty</h1>
          <p className="page-subtitle">
            Katalog produktów i kategorii Twojej organizacji — formularz publiczny
            (/reklamacja-marka/…) pobiera je stąd na żywo.
          </p>
        </div>
      </div>

      <div className="filter-tabs" style={{ marginBottom: 16 }}>
        <div
          className={`filter-tab ${tab === 'products' ? 'active' : ''}`}
          onClick={() => setTab('products')}
          role="button"
          tabIndex={0}
        >
          Produkty
        </div>
        <div
          className={`filter-tab ${tab === 'categories' ? 'active' : ''}`}
          onClick={() => setTab('categories')}
          role="button"
          tabIndex={0}
        >
          Kategorie
        </div>
      </div>

      {tab === 'products' ? (
        <ProductsTab
          canManage={canManage}
          manufacturers={manufacturers ?? []}
          brands={brands ?? []}
          categories={categories ?? []}
          manufacturerName={manufacturerName}
          brandById={brandById}
          categoryById={categoryById}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['products'] })}
          showToast={showToast}
        />
      ) : (
        <CategoriesTab
          canManage={canManage}
          manufacturers={manufacturers ?? []}
          categories={categories ?? []}
          manufacturerName={manufacturerName}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['product-categories'] })}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function ProductsTab({
  canManage,
  manufacturers,
  brands,
  categories,
  manufacturerName,
  brandById,
  categoryById,
  onChanged,
  showToast,
}: {
  canManage: boolean;
  manufacturers: { id: string; name: string }[];
  brands: Brand[];
  categories: ProductCategory[];
  manufacturerName: (id: string) => string;
  brandById: Map<string, Brand>;
  categoryById: Map<string, ProductCategory>;
  onChanged: () => void;
  showToast: (message: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [manufacturerFilter, setManufacturerFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const { data: products, isLoading } = useQuery({
    queryKey: [
      'products',
      {
        search,
        manufacturerId: manufacturerFilter,
        brandId: brandFilter,
        categoryId: categoryFilter,
      },
    ],
    queryFn: () =>
      productsApi.list({
        query: search.trim() || undefined,
        manufacturerId: manufacturerFilter || undefined,
        brandId: brandFilter || undefined,
        categoryId: categoryFilter || undefined,
      }),
  });

  const brandsForFilter = manufacturerFilter
    ? brands.filter((b) => b.manufacturerId === manufacturerFilter)
    : brands;
  const categoriesForFilter = manufacturerFilter
    ? categories.filter((c) => c.manufacturerId === manufacturerFilter)
    : categories;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_PRODUCT_FORM);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setForm({
      manufacturerId: product.manufacturerId,
      brandId: product.brandId ?? '',
      categoryId: product.categoryId ?? '',
      name: product.name,
      sku: product.sku ?? '',
    });
    setError(null);
    setModalOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        manufacturerId: form.manufacturerId,
        brandId: form.brandId || undefined,
        categoryId: form.categoryId || undefined,
        name: form.name.trim(),
        sku: form.sku.trim() || undefined,
      };
      if (editing) return productsApi.update(editing.id, payload);
      return productsApi.create(payload);
    },
    onSuccess: () => {
      onChanged();
      setModalOpen(false);
      showToast(editing ? 'Produkt zaktualizowany.' : 'Produkt dodany.');
    },
    onError: (err: unknown) => {
      setError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się zapisać.')
          : 'Nie udało się zapisać.',
      );
    },
  });

  const canSave = form.manufacturerId !== '' && form.name.trim() !== '';

  async function toggleActive(product: Product) {
    if (
      product.active &&
      !window.confirm(
        `Dezaktywować produkt „${product.name}”? Przestanie być proponowany przy nowych reklamacjach/formularzu publicznym, ale zostanie w danych historycznych.`,
      )
    ) {
      return;
    }
    try {
      await productsApi.update(product.id, { active: !product.active });
      onChanged();
      showToast(product.active ? 'Produkt dezaktywowany.' : 'Produkt aktywowany.');
    } catch (err) {
      showToast(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się zmienić statusu produktu.')
          : 'Nie udało się zmienić statusu produktu.',
      );
    }
  }

  const rows = products ?? [];
  const brandsForForm = brands.filter((b) => b.manufacturerId === form.manufacturerId);
  const categoriesForForm = categories.filter((c) => c.manufacturerId === form.manufacturerId);

  return (
    <div className="card">
      <div className="table-toolbar">
        <div className="search-input">
          <SearchIcon width={15} height={15} />
          <input
            type="text"
            placeholder="Nazwa lub SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <PermissionGate permissions={['products.manage']}>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            <PlusIcon width={14} height={14} /> Dodaj produkt
          </button>
        </PermissionGate>
      </div>

      <div className="table-toolbar" style={{ borderTop: 'none', paddingTop: 0 }}>
        <div className="toolbar-filters">
          <select
            className="toolbar-select"
            value={manufacturerFilter}
            onChange={(e) => {
              setManufacturerFilter(e.target.value);
              setBrandFilter('');
              setCategoryFilter('');
            }}
            aria-label="Filtr: producent"
          >
            <option value="">Producent: wszyscy</option>
            {manufacturers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            className="toolbar-select"
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            aria-label="Filtr: marka"
          >
            <option value="">Marka: wszystkie</option>
            {brandsForFilter.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            className="toolbar-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filtr: kategoria"
          >
            <option value="">Kategoria: wszystkie</option>
            {categoriesForFilter.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {(search || manufacturerFilter || brandFilter || categoryFilter) && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSearch('');
                setManufacturerFilter('');
                setBrandFilter('');
                setCategoryFilter('');
              }}
            >
              Wyczyść filtry
            </button>
          )}
        </div>
      </div>

      {isLoading && <LoadingIndicator />}

      {!isLoading && rows.length === 0 && (
        <div className="empty-state">
          <div className="icon-wrap">
            <ProductsIcon />
          </div>
          <h4>Brak produktów</h4>
          <p>Zmień filtry albo dodaj pierwszy produkt.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Producent</th>
                <th>Marka</th>
                <th className="col-hide-mobile">Kategoria</th>
                <th className="col-hide-mobile">SKU</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} onClick={() => canManage && openEdit(p)}>
                  <td className="cell-primary">{p.name}</td>
                  <td className="cell-secondary">{manufacturerName(p.manufacturerId)}</td>
                  <td className="cell-secondary">
                    {p.brandId ? (brandById.get(p.brandId)?.name ?? '—') : '—'}
                  </td>
                  <td className="cell-secondary col-hide-mobile">
                    {p.categoryId
                      ? (categoryById.get(p.categoryId)?.name ?? '—')
                      : (p.category ?? '—')}
                  </td>
                  <td className="cell-secondary col-hide-mobile">{p.sku ?? '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-6 items-center">
                      {p.active ? (
                        <span className="badge badge-green">Aktywny</span>
                      ) : (
                        <span className="badge badge-gray">Nieaktywny</span>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => toggleActive(p)}
                        >
                          {p.active ? 'Dezaktywuj' : 'Aktywuj'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editing ? `Edytuj produkt „${editing.name}”` : 'Nowy produkt'}
        onClose={() => setModalOpen(false)}
        error={error}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
              Anuluj
            </button>
            <button
              className="btn btn-primary"
              onClick={() => saveMutation.mutate()}
              disabled={!canSave || saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Zapisywanie…' : 'Zapisz'}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <div className="field">
            <label htmlFor="p-manufacturer">
              Producent <span className="required-star">*</span>
            </label>
            <select
              id="p-manufacturer"
              value={form.manufacturerId}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  manufacturerId: e.target.value,
                  brandId: '',
                  categoryId: '',
                }))
              }
            >
              <option value="">— wybierz —</option>
              {manufacturers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-brand">Marka</label>
            <select
              id="p-brand"
              value={form.brandId}
              onChange={(e) => setForm((f) => ({ ...f, brandId: e.target.value }))}
              disabled={!form.manufacturerId}
            >
              <option value="">— brak / dowolna —</option>
              {brandsForForm.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-category">Kategoria</label>
            <select
              id="p-category"
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              disabled={!form.manufacturerId}
            >
              <option value="">— brak —</option>
              {categoriesForForm.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-name">
              Nazwa / model <span className="required-star">*</span>
            </label>
            <input
              id="p-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="p-sku">SKU</label>
            <input
              id="p-sku"
              type="text"
              value={form.sku}
              onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function CategoriesTab({
  canManage,
  manufacturers,
  categories,
  manufacturerName,
  onChanged,
  showToast,
}: {
  canManage: boolean;
  manufacturers: { id: string; name: string }[];
  categories: ProductCategory[];
  manufacturerName: (id: string) => string;
  onChanged: () => void;
  showToast: (message: string) => void;
}) {
  const [manufacturerFilter, setManufacturerFilter] = useState('');
  const [newCategoryManufacturerId, setNewCategoryManufacturerId] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      productCategoriesApi.create({
        manufacturerId: newCategoryManufacturerId,
        name: newCategoryName.trim(),
      }),
    onSuccess: () => {
      onChanged();
      setNewCategoryName('');
      showToast('Kategoria dodana.');
    },
    onError: (err: unknown) => {
      setError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się dodać kategorii.')
          : 'Nie udało się dodać kategorii.',
      );
    },
  });

  async function renameCategory(category: ProductCategory) {
    const nextName = window.prompt(`Nowa nazwa kategorii „${category.name}”:`, category.name);
    if (!nextName || nextName.trim() === category.name) return;
    try {
      await productCategoriesApi.update(category.id, { name: nextName.trim() });
      onChanged();
      showToast('Nazwa kategorii zaktualizowana.');
    } catch (err) {
      showToast(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się zmienić nazwy kategorii.')
          : 'Nie udało się zmienić nazwy kategorii.',
      );
    }
  }

  async function toggleActive(category: ProductCategory) {
    if (
      category.active &&
      !window.confirm(
        `Dezaktywować kategorię „${category.name}”? Zniknie z formularza publicznego i panelu wyboru, ale istniejące produkty/sprawy zachowają ją bez zmian.`,
      )
    ) {
      return;
    }
    try {
      await productCategoriesApi.update(category.id, { active: !category.active });
      onChanged();
      showToast(category.active ? 'Kategoria dezaktywowana.' : 'Kategoria aktywowana.');
    } catch (err) {
      showToast(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się zmienić statusu kategorii.')
          : 'Nie udało się zmienić statusu kategorii.',
      );
    }
  }

  const rows = manufacturerFilter
    ? categories.filter((c) => c.manufacturerId === manufacturerFilter)
    : categories;

  return (
    <div className="card">
      {canManage && (
        <div className="table-toolbar">
          <div className="flex gap-10 items-center" style={{ flexWrap: 'wrap', width: '100%' }}>
            <select
              className="toolbar-select"
              value={newCategoryManufacturerId}
              onChange={(e) => setNewCategoryManufacturerId(e.target.value)}
              aria-label="Producent nowej kategorii"
            >
              <option value="">— wybierz producenta —</option>
              {manufacturers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Nazwa nowej kategorii…"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              style={{ flex: 1, minWidth: 180 }}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={
                !newCategoryManufacturerId || !newCategoryName.trim() || createMutation.isPending
              }
              onClick={() => {
                setError(null);
                createMutation.mutate();
              }}
            >
              <PlusIcon width={14} height={14} /> Dodaj kategorię
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="field-error" role="alert" style={{ display: 'block', padding: '0 20px' }}>
          {error}
        </p>
      )}

      <div className="table-toolbar" style={{ borderTop: 'none', paddingTop: 0 }}>
        <select
          className="toolbar-select"
          value={manufacturerFilter}
          onChange={(e) => setManufacturerFilter(e.target.value)}
          aria-label="Filtr: producent"
        >
          <option value="">Producent: wszyscy</option>
          {manufacturers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 && (
        <div className="empty-state">
          <div className="icon-wrap">
            <ProductsIcon />
          </div>
          <h4>Brak kategorii</h4>
          <p>Dodaj pierwszą kategorię dla wybranego producenta.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Producent</th>
                <th>Status</th>
                {canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="cell-primary">{c.name}</td>
                  <td className="cell-secondary">{manufacturerName(c.manufacturerId)}</td>
                  <td>
                    {c.active ? (
                      <span className="badge badge-green">Aktywna</span>
                    ) : (
                      <span className="badge badge-gray">Nieaktywna</span>
                    )}
                  </td>
                  {canManage && (
                    <td>
                      <div className="flex gap-6">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => renameCategory(c)}
                        >
                          Zmień nazwę
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => toggleActive(c)}
                        >
                          {c.active ? 'Dezaktywuj' : 'Aktywuj'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
