import { type ReactNode, useEffect } from 'react';
import { XIcon } from './icons';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}

/** Odpowiednik `openModal()`/`closeModal()` + `.modal-overlay`/`.modal` z prototypu (`app.js` + `design-system.css`). Zamknięcie klawiszem Escape i kliknięciem tła — obu prototyp nie miał, ale są darmowe i oczekiwane w dialogu. */
export function Modal({ open, title, onClose, footer, children, wide = false }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div
        className={`modal ${wide ? 'modal-wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
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
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
