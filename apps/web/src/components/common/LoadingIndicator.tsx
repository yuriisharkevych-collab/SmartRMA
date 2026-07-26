export function LoadingIndicator({ label = 'Ładowanie…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center p-8 text-sm text-gray-500" role="status" aria-live="polite">
      {label}
    </div>
  );
}
