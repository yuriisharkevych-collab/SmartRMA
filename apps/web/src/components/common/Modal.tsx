import { type ReactNode } from 'react';
import { XIcon } from './icons';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  /** Błąd z ostatniej akcji w tym modalu — bez tego renderował się tylko na stronie POD nakładką `.modal-overlay`, więc był niewidoczny dopóki modal jest otwarty (użytkownik klikał "Wyślij" i wyglądało, jakby nic się nie stało). */
  error?: string | null;
}

/**
 * Odpowiednik `openModal()`/`closeModal()` + `.modal-overlay`/`.modal` z
 * prototypu (`app.js` + `design-system.css`). Świadomie BEZ zamykania przez
 * kliknięcie w tło i klawisz Escape — użytkownik zgłosił, że przypadkowe
 * kliknięcie obok okienka podczas wypełniania formularza (np. edycja
 * producenta/użytkownika) kasowało niezapisane dane. Zamknięcie wyłącznie
 * przez świadome akcje: X, "Anuluj" albo zapis (każdy z nich woła `onClose`
 * z poziomu strony, po swojej stronie logiki).
 */
export function Modal({ open, title, onClose, footer, children, wide = false, error }: ModalProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay open">
      <div
        className={`modal ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <div
            className="close-x"
            onClick={onClose}
            role="button"
            tabIndex={0}
            aria-label="Zamknij"
          >
            <XIcon />
          </div>
        </div>
        <div className="modal-body">
          {error && (
            <p className="field-error" style={{ display: 'block', marginBottom: 12 }}>
              {error}
            </p>
          )}
          {children}
        </div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
