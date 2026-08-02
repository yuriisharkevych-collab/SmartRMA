import { useContext } from 'react';
import { ToastContext, type ToastContextValue } from '@/providers/ToastProvider';

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast() musi być użyty wewnątrz <ToastProvider>.');
  return context;
}
