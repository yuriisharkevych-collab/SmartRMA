import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  type CaseStatus,
  type CreateCaseStatusPayload,
  caseStatusesApi,
  type UpdateCaseStatusPayload,
} from '@/api/case-statuses.api';
import { isApiError } from '@/api/client';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { useToast } from '@/hooks/useToast';

const QUERY_KEY = ['case-statuses'];

/**
 * §9 wymagania właściciela — admin może: utworzyć status, zmienić nazwę,
 * zmienić opis, ustawić kolejność, aktywować, dezaktywować, określić czy
 * jest końcowy. Nie definiuje przejść (żadnej tabeli) — pracownik zawsze
 * może wybrać KAŻDY aktywny status, patrz modal zmiany statusu w
 * `CaseDetailPage.tsx`.
 *
 * §10 — brak przycisku "Usuń": statusy nigdy nie są fizycznie kasowane
 * (wzorzec `Manufacturer` i innych encji katalogowych), wyłącznie
 * dezaktywowane przez przełącznik "Aktywny" — backend (CASE-015) sam
 * blokuje dezaktywację, jeśli status jest używany przez aktywną sprawę, i
 * zwraca to jako czytelny komunikat błędu.
 */
export function CaseStatusesTab({ canManage }: { canManage: boolean }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: caseStatusesApi.list,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  function reportError(fallback: string, error: unknown) {
    const detail = isApiError(error) ? error.response?.data.error.message : undefined;
    showToast(detail ?? fallback);
  }

  const createMutation = useMutation({
    mutationFn: (payload: CreateCaseStatusPayload) => caseStatusesApi.create(payload),
    onSuccess: () => {
      showToast('Status utworzony.');
      setCreating(false);
      invalidate();
    },
    onError: (err) => reportError('Nie udało się utworzyć statusu.', err),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCaseStatusPayload }) =>
      caseStatusesApi.update(id, payload),
    onSuccess: () => {
      showToast('Status zapisany.');
      setEditingId(null);
      invalidate();
    },
    onError: (err) => reportError('Nie udało się zapisać statusu.', err),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      caseStatusesApi.update(id, { active }),
    onSuccess: (_, variables) => {
      showToast(variables.active ? 'Status aktywowany.' : 'Status dezaktywowany.');
      invalidate();
    },
    onError: (err) =>
      reportError(
        'Nie można dezaktywować tego statusu — jest używany przez aktywne reklamacje. Najpierw zmień status tych spraw.',
        err,
      ),
  });

  const reorderMutation = useMutation({
    mutationFn: (statusIds: string[]) => caseStatusesApi.reorder(statusIds),
    onSuccess: () => invalidate(),
    onError: (err) => reportError('Nie udało się zmienić kolejności statusów.', err),
  });

  if (isLoading) return <LoadingIndicator />;
  if (isError || !data) return <EmptyState title="Nie udało się pobrać statusów reklamacji" />;

  const sorted = [...data].sort((a, b) => a.order - b.order);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    reorderMutation.mutate(reordered.map((s) => s.id));
  }

  return (
    <div className="card card-pad">
      <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
        Status reklamacji to prosty wskaźnik etapu — pracownik może w dowolnym momencie wybrać KAŻDY
        aktywny status (system tylko ostrzega przy nietypowych zmianach, nigdy nie blokuje).
        Kolejność poniżej ustawia wyłącznie sortowanie listy w modalu zmiany statusu.
      </p>

      {/* Audyt mobilny (Ustawienia → Statusy reklamacji) — jedyna tabela w tym
          module bez `.table-wrap`: 6 kolumn (w tym 160px na akcje) realnie
          nie mieści się poniżej ~580px, co ciągnęło CAŁĄ stronę w poziomy
          scroll (dokładnie efekt, przed którym chroni już W1-A na innych
          tabelach). `.table` (bez `.data-table`) nie ma żadnej własnej
          stylistyki w design-system.css, więc ten wrapper wyłącznie
          kontener izuje przewijanie do samej tabeli — zero zmiany wyglądu
          na desktopie. */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 70 }}>Kolejność</th>
              <th>Nazwa</th>
              <th>Opis</th>
              <th style={{ width: 90 }}>Końcowy</th>
              <th style={{ width: 90 }}>Aktywny</th>
              <th style={{ width: 160 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((status, index) => (
              <CaseStatusRow
                key={status.id}
                status={status}
                canManage={canManage}
                isEditing={editingId === status.id}
                isFirst={index === 0}
                isLast={index === sorted.length - 1}
                onEdit={() => setEditingId(status.id)}
                onCancelEdit={() => setEditingId(null)}
                onSave={(payload) => updateMutation.mutate({ id: status.id, payload })}
                onToggleActive={() =>
                  toggleActiveMutation.mutate({ id: status.id, active: !status.active })
                }
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
                saving={updateMutation.isPending}
              />
            ))}
          </tbody>
        </table>
      </div>

      {canManage && !creating && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ marginTop: 16 }}
          onClick={() => setCreating(true)}
        >
          + Nowy status
        </button>
      )}

      {creating && (
        <CaseStatusCreateForm
          onCancel={() => setCreating(false)}
          onSave={(payload) => createMutation.mutate(payload)}
          saving={createMutation.isPending}
        />
      )}
    </div>
  );
}

function CaseStatusRow({
  status,
  canManage,
  isEditing,
  isFirst,
  isLast,
  onEdit,
  onCancelEdit,
  onSave,
  onToggleActive,
  onMoveUp,
  onMoveDown,
  saving,
}: {
  status: CaseStatus;
  canManage: boolean;
  isEditing: boolean;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (payload: UpdateCaseStatusPayload) => void;
  onToggleActive: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  saving: boolean;
}) {
  const [label, setLabel] = useState(status.label);
  const [description, setDescription] = useState(status.description ?? '');
  const [isFinal, setIsFinal] = useState(status.isFinal);

  if (isEditing) {
    return (
      <tr>
        <td colSpan={6}>
          <div className="form-grid" style={{ padding: '8px 0' }}>
            <div className="field span-2">
              <label htmlFor={`cs-label-${status.id}`}>Nazwa</label>
              <input
                id={`cs-label-${status.id}`}
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="field span-2">
              <label htmlFor={`cs-desc-${status.id}`}>Opis</label>
              <input
                id={`cs-desc-${status.id}`}
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={isFinal}
                  onChange={(e) => setIsFinal(e.target.checked)}
                />
                Status końcowy
              </label>
            </div>
          </div>
          <div className="flex gap-8" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={saving || !label.trim()}
              onClick={() =>
                onSave({
                  label: label.trim(),
                  description: description.trim() || undefined,
                  isFinal,
                })
              }
            >
              {saving ? 'Zapisywanie…' : 'Zapisz'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelEdit}>
              Anuluj
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr style={{ opacity: status.active ? 1 : 0.55 }}>
      <td>
        <div className="flex items-center gap-4">
          <span className="mono text-xs">{status.order}</span>
          {canManage && (
            <div className="flex" style={{ flexDirection: 'column' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: '0 4px' }}
                disabled={isFirst}
                onClick={onMoveUp}
                title="Przesuń wyżej"
              >
                ▲
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: '0 4px' }}
                disabled={isLast}
                onClick={onMoveDown}
                title="Przesuń niżej"
              >
                ▼
              </button>
            </div>
          )}
        </div>
      </td>
      <td>
        <strong className="text-sm">{status.label}</strong>
        {status.isSystem && (
          <span className="badge badge-gray" style={{ marginLeft: 8 }}>
            systemowy
          </span>
        )}
      </td>
      <td className="text-sm text-muted">{status.description ?? '—'}</td>
      <td>
        {status.isFinal ? (
          <span className="badge badge-green">Tak</span>
        ) : (
          <span className="badge badge-gray">Nie</span>
        )}
      </td>
      <td>
        {status.active ? (
          <span className="badge badge-green">Aktywny</span>
        ) : (
          <span className="badge badge-gray">Nieaktywny</span>
        )}
      </td>
      <td>
        {canManage && (
          <div className="flex gap-8">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
              Edytuj
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onToggleActive}>
              {status.active ? 'Dezaktywuj' : 'Aktywuj'}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function CaseStatusCreateForm({
  onCancel,
  onSave,
  saving,
}: {
  onCancel: () => void;
  onSave: (payload: CreateCaseStatusPayload) => void;
  saving: boolean;
}) {
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [isFinal, setIsFinal] = useState(false);

  return (
    <div
      className="card card-pad"
      style={{ marginTop: 12, background: 'var(--surface-alt, #f9f9fa)' }}
    >
      <div className="form-grid">
        <div className="field span-2">
          <label htmlFor="cs-new-label">Nazwa nowego statusu</label>
          <input
            id="cs-new-label"
            type="text"
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="field span-2">
          <label htmlFor="cs-new-desc">Opis (opcjonalnie)</label>
          <input
            id="cs-new-desc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={isFinal}
              onChange={(e) => setIsFinal(e.target.checked)}
            />
            Status końcowy
          </label>
        </div>
      </div>
      <div className="flex gap-8" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={saving || !label.trim()}
          onClick={() =>
            onSave({ label: label.trim(), description: description.trim() || undefined, isFinal })
          }
        >
          {saving ? 'Tworzenie…' : 'Utwórz status'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Anuluj
        </button>
      </div>
    </div>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="empty-state">
      <h4>{title}</h4>
      <p>Spróbuj ponownie odświeżyć stronę.</p>
    </div>
  );
}
