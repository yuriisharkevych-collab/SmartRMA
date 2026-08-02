import { createContext, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

export interface ToastContextValue {
  showToast: (message: string) => void;
}

export const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/** Odpowiednik `showToast()` z prototypu (`app.js`) — ten sam `.toast`/`.toast.show` z `design-system.css`, jeden globalny toast zamiast per-ekran alertu. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const showToast = useCallback((text: string) => {
    setMessage(text);
    setVisible(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 3200);
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={`toast ${visible ? 'show' : ''}`} role="status" aria-live="polite">
        <span className="dot" />
        {message}
      </div>
    </ToastContext.Provider>
  );
}
