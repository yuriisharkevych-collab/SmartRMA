import { useEffect, useState } from 'react';

/** Współdzielone przez ekrany z wyszukiwaniem "na żywo" (klient/produkt przy nowej reklamacji, producenci, ...) — nie odpytuje API przy każdym naciśnięciu klawisza. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
