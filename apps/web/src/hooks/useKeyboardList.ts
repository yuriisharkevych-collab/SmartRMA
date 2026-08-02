import { type KeyboardEvent, useEffect, useState } from 'react';

/**
 * Obsługa listy podpowiedzi z klawiatury: ↓/↑ przesuwają zaznaczenie, Enter
 * wybiera, Escape zamyka. Bez tego autocomplete dawał się obsłużyć wyłącznie
 * myszą, co przy rejestracji reklamacji „na słuchawce" zmuszało do puszczania
 * klawiatury przy każdym kliencie i produkcie.
 *
 * `itemCount` musi odpowiadać liczbie widocznych pozycji — zaznaczenie
 * resetuje się, gdy lista się zmieni (np. po doprecyzowaniu frazy).
 */
export function useKeyboardList(
  itemCount: number,
  onSelect: (index: number) => void,
  onClose?: () => void,
) {
  const [highlighted, setHighlighted] = useState(-1);

  useEffect(() => {
    setHighlighted(itemCount > 0 ? 0 : -1);
  }, [itemCount]);

  function onKeyDown(event: KeyboardEvent) {
    if (itemCount === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((i) => (i + 1) % itemCount);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((i) => (i - 1 + itemCount) % itemCount);
    } else if (event.key === 'Enter') {
      // Enter na podświetlonej pozycji wybiera ją — i NIE wysyła formularza.
      if (highlighted >= 0) {
        event.preventDefault();
        event.stopPropagation();
        onSelect(highlighted);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose?.();
    }
  }

  return { highlighted, setHighlighted, onKeyDown };
}
