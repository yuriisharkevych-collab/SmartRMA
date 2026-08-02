import type { CaseSummary } from '@/api/cases.api';
import { statusMeta } from './case-status-labels';

export { COMPLAINT_TYPE_LABELS, STATUS_META, statusMeta } from './case-status-labels';

export const CLOSED_STATUSES = ['Zamknieta', 'Anulowana', 'Zarchiwizowana'];

export function statusLabel(status: string): string {
  return statusMeta(status).label;
}

export function statusTone(status: string): string {
  return statusMeta(status).tone;
}

export function isOpenCase(c: CaseSummary): boolean {
  return !CLOSED_STATUSES.includes(c.status);
}

/**
 * Liczba dni od DZISIAJ do terminu (ujemna = po terminie). Prototyp miał
 * `TODAY` zamrożone na sztywno (`2026-07-18`), bo pracował na statycznym
 * zbiorze demo — tutaj liczymy od realnej daty, inaczej "przeterminowane"
 * rozjechałoby się z rzeczywistością zaraz po starcie systemu.
 */
export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86_400_000);
}

export function isOverdue(c: CaseSummary): boolean {
  const d = daysUntil(c.nextActionDueDate);
  return isOpenCase(c) && d !== null && d < 0;
}

export function isDueToday(c: CaseSummary): boolean {
  return isOpenCase(c) && daysUntil(c.nextActionDueDate) === 0;
}

export interface CaseFilter {
  key: string;
  label: string;
  match: (c: CaseSummary, currentUserId: string | undefined) => boolean;
}

/**
 * Zakładki filtra nad listą spraw. Pierwsze osiem to 1:1 `FILTERS` z
 * prototypu (`js/cases.js`); trzy ostatnie (`awaiting`, `ready`, `mine`)
 * dołożone, bo Dashboard ma 6 kafelków zamiast 4 z prototypu i każdy z nich
 * musi mieć dokąd linkować — bez nich kliknięcie w "Oczekiwanie na klienta"
 * czy "Moje sprawy" nie miałoby odpowiednika na liście.
 */
export const CASE_FILTERS: CaseFilter[] = [
  { key: 'all', label: 'Wszystkie', match: () => true },
  { key: 'open', label: 'Otwarte', match: (c) => isOpenCase(c) },
  { key: 'new', label: 'Nowe', match: (c) => c.status === 'Nowa' },
  {
    key: 'waiting',
    label: 'Oczekujące na decyzję',
    match: (c) =>
      ['OczekiwanieNaDecyzjeProducenta', 'OczekiwanieNaDecyzjeKierownika'].includes(c.status),
  },
  { key: 'overdue', label: 'Przeterminowane', match: (c) => isOverdue(c) },
  { key: 'today', label: 'Na dziś', match: (c) => isDueToday(c) },
  {
    key: 'monitored',
    label: 'Monitorowane',
    match: (c) => c.submissionMode === 'BezposrednioDoProducenta',
  },
  { key: 'closed', label: 'Zamknięte', match: (c) => CLOSED_STATUSES.includes(c.status) },
  {
    key: 'awaiting',
    label: 'Oczekiwanie na klienta',
    match: (c) => c.status === 'OczekiwanieNaKlienta',
  },
  { key: 'ready', label: 'Gotowe do odbioru', match: (c) => c.status === 'GotowaDoOdbioru' },
  {
    key: 'mine',
    label: 'Moje sprawy',
    match: (c, userId) => Boolean(userId) && c.ownerId === userId,
  },
];

export function findFilter(key: string | null): CaseFilter {
  return CASE_FILTERS.find((f) => f.key === key) ?? CASE_FILTERS[1]; // domyślnie "Otwarte", jak w prototypie
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
