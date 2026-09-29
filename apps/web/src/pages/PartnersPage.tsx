import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { isApiError } from '@/api/client';
import {
  type Partnership,
  type SearchCompanyResult,
  partnershipsApi,
} from '@/api/partnerships.api';
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

  // Etap 6 — modal "Dodaj partnera B2B" ma teraz DWA tryby wyboru na starcie:
  // "Zaproś nową firmę" (Etap 5, bez zmiany ducha) i "Połącz z istniejącą
  // firmą" (nowość). Żaden z nich nie zna pojęcia marek — marki NIE są
  // częścią relacji B2B (decyzja właściciela), każda firma zarządza własnymi
  // niezależnie w sekcji "Producenci".
  type PartnerModalMode = 'choose' | 'invite' | 'connect';

  const [inviteModal, setInviteModal] = useState(false);
  const [mode, setMode] = useState<PartnerModalMode>('choose');
  const [modalError, setModalError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [inviteNip, setInviteNip] = useState('');

  const [connectNip, setConnectNip] = useState('');
  // `undefined` = jeszcze nie szukano, `null` = szukano, nie znaleziono, obiekt = znaleziono.
  const [searchResult, setSearchResult] = useState<SearchCompanyResult | null | undefined>(
    undefined,
  );

  const [actionError, setActionError] = useState<string | null>(null);

  function openPartnerModal() {
    setMode('choose');
    setModalError(null);
    setCompanyName('');
    setAdminEmail('');
    setInviteNip('');
    setConnectNip('');
    setSearchResult(undefined);
    setInviteModal(true);
  }

  function closePartnerModal() {
    setInviteModal(false);
  }

  const inviteMutation = useMutation({
    mutationFn: () =>
      partnershipsApi.invitePartner(companyName.trim(), adminEmail.trim(), inviteNip.trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['partnerships'] });
      showToast('Zaproszenie wysłane. Partner otrzyma e-mail z linkiem do założenia konta.');
      closePartnerModal();
    },
    onError: (err) => {
      setModalError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się wysłać zaproszenia.')
          : 'Nie udało się wysłać zaproszenia.',
      );
    },
  });

  function handleInviteSubmit() {
    setModalError(null);
    if (!companyName.trim()) {
      setModalError('Podaj nazwę firmy partnera.');
      return;
    }
    if (!adminEmail.trim()) {
      setModalError('Podaj e-mail administratora partnera.');
      return;
    }
    if (!inviteNip.trim()) {
      setModalError('Podaj NIP firmy.');
      return;
    }
    inviteMutation.mutate();
  }

  const searchCompanyMutation = useMutation({
    mutationFn: () => partnershipsApi.searchCompanyByNip(connectNip.trim()),
    onSuccess: (result) => {
      setSearchResult(result);
    },
    onError: (err) => {
      setSearchResult(undefined);
      setModalError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się wyszukać firmy.')
          : 'Nie udało się wyszukać firmy.',
      );
    },
  });

  function handleSearchCompany() {
    setModalError(null);
    setSearchResult(undefined);
    if (!connectNip.trim()) {
      setModalError('Podaj NIP firmy.');
      return;
    }
    searchCompanyMutation.mutate();
  }

  const requestConnectionMutation = useMutation({
    mutationFn: (targetCompanyId: string) => partnershipsApi.requestConnection(targetCompanyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['partnerships'] });
      showToast('Prośba o połączenie wysłana. Druga firma musi ją zaakceptować.');
      closePartnerModal();
    },
    onError: (err) => {
      setModalError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się wysłać prośby o połączenie.')
          : 'Nie udało się wysłać prośby o połączenie.',
      );
    },
  });

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
            Firmy powiązane z Twoją organizacją jako partnerzy handlowi — zaproś nową firmę albo
            połącz się z firmą, która już ma konto w SmartRMA.
          </p>
        </div>
        <PermissionGate permissions={['partnerships.manage']}>
          <button className="btn btn-primary" onClick={openPartnerModal}>
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
                  <th className="col-hide-mobile">Obsługiwane marki</th>
                  <th>Reklamacje</th>
                  <th className="col-hide-mobile">Utworzono</th>
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
                      <td className="cell-secondary col-hide-mobile">{brandLabel}</td>
                      <td className="cell-secondary">{p.caseCount}</td>
                      <td className="cell-secondary col-hide-mobile">{formatDate(p.invitedAt)}</td>
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
        title={
          mode === 'choose'
            ? 'Dodaj partnera B2B'
            : mode === 'invite'
              ? 'Zaproś nową firmę'
              : 'Połącz z istniejącą firmą'
        }
        onClose={closePartnerModal}
        error={modalError}
        footer={
          mode === 'choose' ? (
            <button className="btn btn-secondary" onClick={closePartnerModal}>
              Anuluj
            </button>
          ) : mode === 'invite' ? (
            <>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setModalError(null);
                  setMode('choose');
                }}
              >
                Wstecz
              </button>
              <button
                className="btn btn-primary"
                onClick={handleInviteSubmit}
                disabled={inviteMutation.isPending}
              >
                {inviteMutation.isPending ? 'Wysyłanie…' : 'Wyślij zaproszenie'}
              </button>
            </>
          ) : (
            <button
              className="btn btn-secondary"
              onClick={() => {
                setModalError(null);
                setMode('choose');
              }}
            >
              Wstecz
            </button>
          )
        }
      >
        {mode === 'choose' && (
          <div className="form-grid single">
            <div className="field">
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%' }}
                onClick={() => {
                  setModalError(null);
                  setMode('invite');
                }}
              >
                Zaproś nową firmę
              </button>
              <span className="hint">
                Firma jeszcze nie ma konta w SmartRMA — założymy jej puste konto i wyślemy
                zaproszenie e-mailem do samodzielnego założenia konta Administratora.
              </span>
            </div>
            <div className="field">
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%' }}
                onClick={() => {
                  setModalError(null);
                  setMode('connect');
                }}
              >
                Połącz z istniejącą firmą
              </button>
              <span className="hint">
                Firma już korzysta ze SmartRMA — wyszukaj ją po NIP-ie i wyślij prośbę o współpracę.
                Druga strona musi ją zaakceptować.
              </span>
            </div>
          </div>
        )}

        {mode === 'invite' && (
          <>
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
                <label htmlFor="pt-nip">NIP</label>
                <input
                  id="pt-nip"
                  type="text"
                  placeholder="np. 123-456-32-18"
                  value={inviteNip}
                  onChange={(e) => setInviteNip(e.target.value)}
                />
                <span className="hint">10 cyfr — myślniki i spacje są dozwolone.</span>
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
          </>
        )}

        {mode === 'connect' && (
          <>
            <div className="form-grid single">
              <div className="field">
                <label htmlFor="pt-connect-nip">NIP firmy</label>
                <div className="flex gap-8">
                  <input
                    id="pt-connect-nip"
                    type="text"
                    placeholder="np. 123-456-32-18"
                    value={connectNip}
                    style={{ flex: 1 }}
                    onChange={(e) => {
                      setConnectNip(e.target.value);
                      setSearchResult(undefined);
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleSearchCompany}
                    disabled={searchCompanyMutation.isPending}
                  >
                    {searchCompanyMutation.isPending ? 'Szukam…' : 'Wyszukaj'}
                  </button>
                </div>
                <span className="hint">10 cyfr — myślniki i spacje są dozwolone.</span>
              </div>
            </div>

            {searchResult === null && (
              <p className="text-sm text-muted" style={{ marginTop: 4 }}>
                Nie znaleziono firmy o podanym NIP-ie.
              </p>
            )}

            {searchResult && (
              <div className="card" style={{ marginTop: 14, padding: 14 }}>
                <div style={{ fontWeight: 600 }}>{searchResult.name}</div>
                <div className="text-sm text-muted">NIP: {searchResult.nip}</div>
                <div className="text-sm text-muted">
                  {searchResult.type === 'Shop' ? 'Sklep' : 'Producent / Dystrybutor'}
                </div>

                {searchResult.alreadyConnected ? (
                  <p className="hint" style={{ marginTop: 10, display: 'block' }}>
                    Ta firma jest już Twoim partnerem B2B.
                  </p>
                ) : searchResult.pendingRequest ? (
                  <p className="hint" style={{ marginTop: 10, display: 'block' }}>
                    Prośba o współpracę z tą firmą została już wysłana.
                  </p>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ marginTop: 10 }}
                    onClick={() => requestConnectionMutation.mutate(searchResult.id)}
                    disabled={requestConnectionMutation.isPending}
                  >
                    {requestConnectionMutation.isPending
                      ? 'Wysyłanie…'
                      : 'Wyślij prośbę o połączenie'}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
