import type { KeyboardEvent } from 'react';

const FOCUSABLE =
  'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])';

/**
 * Enter przenosi fokus do kolejnego pola zamiast wysyłać formularz —
 * standard w systemach do szybkiego wprowadzania danych (pracownik
 * rejestruje reklamację, nie odrywając rąk od klawiatury).
 *
 * Świadome wyjątki:
 *  - `textarea` — tam Enter musi robić nową linię;
 *  - pola oznaczone `data-keyboard-list` (autocomplete) — tam Enter wybiera
 *    podpowiedź, obsługiwane przez `useKeyboardList`;
 *  - ostatnie pole formularza — Enter przechodzi na przycisk zapisu, więc
 *    kolejny Enter faktycznie wysyła (nie zabieramy możliwości wysłania).
 */
export function focusNextOnEnter(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== 'Enter') return;

  const target = event.target as HTMLElement;
  if (target.tagName === 'TEXTAREA') return;
  if (target.closest('[data-keyboard-list]')) return;
  if (target.tagName === 'BUTTON') return;

  const form = event.currentTarget;
  const fields = Array.from(form.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null, // pomija pola ukryte (np. input[type=file] za dropzone)
  );
  const index = fields.indexOf(target);
  if (index === -1) return;

  event.preventDefault();
  const next = fields[index + 1];
  if (next) {
    next.focus();
    if (next instanceof HTMLInputElement && next.type !== 'date') next.select();
  } else {
    form.querySelector<HTMLButtonElement>('button[type=submit]')?.focus();
  }
}
