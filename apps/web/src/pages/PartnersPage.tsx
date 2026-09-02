import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { isApiError } from '@/api/client';
import { type Partnership, partnershipsApi } from '@/api/partnerships.api';
import { brandsApi } from '@/api/products.api';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { Modal } from '@/components/common/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { PlusIcon } from '@/components/common/icons';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';

const STATUS_LABELS: Record<Partnership['status'], string> = {
  Invited: 'Zaproszono',
  Active: 'Aktywne',
  Inactive: 'Nieaktywne',
  Rejected: 'Odrzucone',
};

const STATUS_BADGE_CLASS: Record<Partnership['status'], string> = {
  Invited: 'badge-amber',
  Active: 'badge-green',
  Inactive: 'badge-gray',
  Rejected: 'badge-red',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * Etap 5 — panel "Partnerzy B2B". Odpowiednik `ManufacturersPage.tsx` (ta sama
 * struktura karta+tabela+modal), ale dla `Partnership`/`PartnershipBrand`
 * zamiast `Manufacturer`/`Brand`. "Firma" w tabeli to zawsze DRUGA strona
 * partnerstwa względem zalogowanej firmy — `Partnership` nie ma pojęcia
 * "kto jest kim" z góry, każda firma może być stroną Sklepu w jednym wierszu
 * i stroną Dystrybutora w innym (`findAllForCompany`, `OR: [shop, distributor]`).
 */
export function PartnersPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission('partnerships.manage');

  const { data: partnerships, isLoading } = useQuery({
    queryKey: ['partnerships'],
    queryFn: partnershipsApi.list,
  });

  const { data: brands } = useQuery({
    queryKey: ['brands'],
    queryFn: brandsApi.list,
    enabled: canManage,
    retry: false,
  });
  const activeBrands = (brands ?? []).filter((b) => b.active);

  const [inviteModal, setInviteModal] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  function openInvite() {
    setCompanyName('');
    setAdminEmail('');
    setBrandIds([]);
    setInviteError(null);
    setInviteModal(true);
  }

  function toggleBrand(id: string) {
    setBrandIds((current) =>
      current.includes(id) ? current.filter((b) => b !== id) : [...current, id],
    );
  }

  const inviteMutation = useMutation({
    mutationFn: () =>
      partnershipsApi.invitePartner(companyName.trim(), adminEmail.trim(), brandIds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['partnerships'] });
      showToast('Zaproszenie wysłane. Partner otrzyma e-mail z linkiem do założenia konta.');
      setInviteModal(false);
    },
    onError: (err) => {
      setInviteError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się wysłać zaproszenia.')
          : 'Nie udało się wysłać zaproszenia.',
      );
    },
  });

  function handleInviteSubmit() {
    setInviteError(null);
    if (!companyName.trim()) {
      setInviteError('Podaj nazwę firmy partnera.');
      return;
    }
    if (!adminEmail.trim()) {
      setInviteError('Podaj e-mail administratora partnera.');
      return;
    }
    if (brandIds.length === 0) {
      setInviteError('Wybierz co najmniej jedną markę, którą partner ma obsługiwać.');
      return;
    }
    inviteMutation.mutate();
  }

  const acceptMutation = useMutation({
    mutationFn: (id: string) => partnershipsApi.accept(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['partnerships'] });
      showToast('Partnerstwo zaakceptowane.');
    },
    onError: (err) =>
      setActionError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się zaakceptować.')
          : 'Nie udało się zaakceptować.',
      ),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => partnershipsApi.reject(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['partnerships'] });
      showToast('Zaproszenie odrzucone.');
    },
    onError: (err) =>
      setActionError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się odrzucić.')
          : 'Nie udało się odrzucić.',
      ),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => partnershipsApi.deactivate(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['partnerships'] });
      showToast('Współpraca zakończona.');
    },
    onError: (err) =>
      setActionError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się zakończyć współpracy.')
          : 'Nie udało się zakończyć współpracy.',
      ),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Partnerzy B2B</h1>
          <p className="page-subtitle">
            Firmy powiązane z Twoją organizacją jako partnerzy handlowi — zaproś nowego partnera i
            określ, jakie marki może obsługiwać w reklamacjach B2B.
          </p>
        </div>
        <PermissionGate permissions={['partnerships.manage']}>
          <button className="btn btn-primary" onClick={openInvite}>
            <PlusIcon />
            Dodaj partnera
          </button>
        </PermissionGate>
      </div>

      {actionError && (
        <p className="field-error" style={{ display: 'block', marginBottom: 12 }}>
          {actionError}
        </p>
      )}

      <div className="card">
        {isLoading && <LoadingIndicator />}

        {partnerships && partnerships.length === 0 && (
          <div className="empty-state">
            <h4>Brak partnerów</h4>
            <p>Nie zaproszono jeszcze żadnego partnera B2B.</p>
          </div>
        )}

        {partnerships && partnerships.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Firma</th>
                  <th>Rola</th>
                  <th>Status</th>
                  <th>Obsługiwane marki</th>
                  <th>Reklamacje</th>
                  <th>Utworzono</th>
                  {canManage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {partnerships.map((p) => {
                  const iAmDistributor = p.distributorCompanyId === user?.companyId;
                  const otherCompanyName = iAmDistributor
                    ? p.shopCompanyName
                    : p.distributorCompanyName;
                  const brandLabel =
                    p.brands.length > 0 ? p.brands.map((b) => b.name).join(', ') : '—';
                  // Akceptacja/odrzucenie zaproszenia (starego, po slugu) dozwolone WYŁĄCZNIE stronie
                  // Dystrybutora — patrz `PartnershipsService.assertDistributorSide`.
                  const canRespond =
                    iAmDistributor && p.status === 'Invited' && !p.hasPendingInvite;
                  const canDeactivate = p.status === 'Active';
                  return (
                    <tr key={p.id}>
                      <td className="cell-primary">{otherCompanyName}</td>
                      <td className="cell-secondary">
                        {iAmDistributor ? 'Nasz partner' : 'Jesteśmy partnerem'}
                      </td>
                      <td>
                        {p.hasPendingInvite ? (
                          <span
                            className="badge badge-amber"
                            title={p.inviteEmail ? `Wysłano na ${p.inviteEmail}` : undefined}
                          >
                            Oczekuje na założenie konta
                          </span>
                        ) : (
                          <span className={`badge ${STATUS_BADGE_CLASS[p.status]}`}>
                            {STATUS_LABELS[p.status]}
                          </span>
                        )}
                      </td>
                      <td className="cell-secondary">{brandLabel}</td>
                      <td className="cell-secondary">{p.caseCount}</td>
                      <td className="cell-secondary">{formatDate(p.invitedAt)}</td>
                      {canManage && (
                        <td>
                          <div className="flex gap-8">
                            {canRespond && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => acceptMutation.mutate(p.id)}
                                  disabled={acceptMutation.isPending}
                                >
                                  Akceptuj
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  onClick={() => rejectMutation.mutate(p.id)}
                                  disabled={rejectMutation.isPending}
                                >
                                  Odrzuć
                                </button>
                              </>
                            )}
                            {canDeactivate && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Zakończyć współpracę z firmą „${otherCompanyName}”? Partner straci możliwość zgłaszania nowych reklamacji B2B do Twojej organizacji.`,
                                    )
                                  ) {
                                    deactivateMutation.mutate(p.id);
                                  }
                                }}
                                disabled={deactivateMutation.isPending}
                              >
                                Zakończ współpracę
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={inviteModal}
        title="Dodaj partnera"
        onClose={() => setInviteModal(false)}
        error={inviteError}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setInviteModal(false)}>
              Anuluj
            </button>
            <button
              className="btn btn-primary"
              onClick={handleInviteSubmit}
              disabled={inviteMutation.isPending}
            >
              {inviteMutation.isPending ? 'Wysyłanie…' : 'Wyślij zaproszenie'}
            </button>
          </>
        }
      >
        <p className="field-hint-static" style={{ marginTop: 0, marginBottom: 14 }}>
          Partner otrzyma e-mail z linkiem do samodzielnego założenia konta Administratora. Nie
          twórz konta partnera ręcznie — zrobi to sam po kliknięciu w link.
        </p>
        <div className="form-grid single">
          <div className="field">
            <label htmlFor="pt-company-name">Nazwa firmy partnera</label>
            <input
              id="pt-company-name"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="pt-admin-email">E-mail administratora partnera</label>
            <input
              id="pt-admin-email"
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
            />
            <span className="hint">
              Link do założenia konta i akceptacji zaproszenia trafi na ten adres.
            </span>
          </div>
        </div>
        <div className="modal-section-label">Obsługiwane marki</div>
        {activeBrands.length === 0 && (
          <p className="text-sm text-muted">
            Brak aktywnych marek — dodaj markę w sekcji „Producenci", zanim zaprosisz partnera.
          </p>
        )}
        <div className="chip-list">
          {activeBrands.map((brand) => {
            const checked = brandIds.includes(brand.id);
            return (
              <label
                key={brand.id}
                className="chip"
                style={{
                  cursor: 'pointer',
                  background: checked ? undefined : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  style={{ width: 'auto', marginRight: 6 }}
                  checked={checked}
                  onChange={() => toggleBrand(brand.id)}
                />
                {brand.name}
              </label>
            );
          })}
        </div>
        <span className="hint">
          Partner będzie mógł zgłaszać reklamacje B2B wyłącznie dla wybranych tutaj marek — próba
          zgłoszenia dla innej marki zostanie odrzucona przez serwer.
        </span>
      </Modal>
    </div>
  );
}
