import type { CaseSummary } from '@/api/cases.api';

export { COMPLAINT_TYPE_LABELS } from './case-status-labels';

/**
 * Status Workflow Refactor — "zamknięta"/"otwarta" nie jest już hardkodowanym
 * zbiorem 3 nazw enuma, tylko zbiorem kodów `isFinal=true` z katalogu firmy
 * (`useCaseStatuses().finalStatusCodes`) — każda z tych funkcji przyjmuje go
 * jako parametr zamiast odwoływać się do stałej modułu.
 */
export function isOpenCase(c: CaseSummary, finalStatusCodes: ReadonlySet<string>): boolean {
  return !finalStatusCodes.has(c.status);
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

/**
 * Etap 2 (Dashboard Producenta/Dystrybutora) — "B2B" znaczy "sprawę zgłosiła
 * firma, nie klient końcowy", NIEZALEŻNIE od TEGO, którym z dwóch mechanizmów
 * to zrobiła: `originType=PartnerB2B` (przekazanie przez `CaseHandoff`,
 * Sklep→Dystrybutor) LUB `reportedByPartnerCompanyId` (formularz
 * rozgałęziony marki, partner wybrany wprost w kroku "Wybór partnera").
 * Sprawa BEZ żadnego z tych dwóch sygnałów zawsze pozostaje `originType=
 * DirectCustomer` z `reportedByPartnerCompanyId=null` — sama flaga
 * `originType` osobno NIE wystarcza, bo formularz marki nigdy jej nie
 * ustawia (patrz komentarz przy tym polu w `cases.api.ts`).
 */
export function isB2B(c: CaseSummary): boolean {
  return c.originType === 'PartnerB2B' || c.reportedByPartnerCompanyId !== null;
}

export function isOverdue(c: CaseSummary, finalStatusCodes: ReadonlySet<string>): boolean {
  const d = daysUntil(c.nextActionDueDate);
  return isOpenCase(c, finalStatusCodes) && d !== null && d < 0;
}

export function isDueToday(c: CaseSummary, finalStatusCodes: ReadonlySet<string>): boolean {
  return isOpenCase(c, finalStatusCodes) && daysUntil(c.nextActionDueDate) === 0;
}

export interface CaseFilter {
  key: string;
  label: string;
  match: (
    c: CaseSummary,
    currentUserId: string | undefined,
    finalStatusCodes: ReadonlySet<string>,
  ) => boolean;
}

/**
 * Zakładki filtra nad listą spraw — 1:1 `FILTERS` z prototypu (`js/cases.js`)
 * plus `ready`/`mine`/`unread` (Dashboard ma więcej kafelków niż prototyp,
 * każdy musi mieć dokąd linkować). Status Workflow Refactor — zakładki
 * `waiting`/`awaiting` USUNIĘTE: opierały się na statusach
 * (`OczekiwanieNaDecyzjeProducenta`/`Kierownika`/`OczekiwanieNaKlienta`),
 * które nie mają już odpowiednika w nowym, 9-statusowym katalogu (§1 —
 * "oczekiwanie" to teraz po prostu bieżący status widoczny w kolumnie
 * Status, nie osobna zakładka).
 */
export const CASE_FILTERS: CaseFilter[] = [
  { key: 'all', label: 'Wszystkie', match: () => true },
  { key: 'open', label: 'Otwarte', match: (c, _u, finalCodes) => isOpenCase(c, finalCodes) },
  { key: 'new', label: 'Nowe', match: (c) => c.status === 'Nowa' },
  {
    key: 'overdue',
    label: 'Przeterminowane',
    match: (c, _u, finalCodes) => isOverdue(c, finalCodes),
  },
  { key: 'today', label: 'Na dziś', match: (c, _u, finalCodes) => isDueToday(c, finalCodes) },
  {
    key: 'monitored',
    label: 'Monitorowane',
    match: (c) => c.submissionMode === 'BezposrednioDoProducenta',
  },
  { key: 'closed', label: 'Zamknięte', match: (c, _u, finalCodes) => finalCodes.has(c.status) },
  { key: 'ready', label: 'Gotowe do odbioru', match: (c) => c.status === 'TowarWrocilZSerwisu' },
  {
    key: 'mine',
    label: 'Moje sprawy',
    match: (c, userId) => Boolean(userId) && c.ownerId === userId,
  },
  {
    key: 'unread',
    label: 'Nieodczytane wiadomości',
    match: (c) => c.unreadMessagesCount > 0,
  },
  {
    key: 'attention',
    label: 'Wymagają reakcji',
    match: (c) => c.needsAttention,
  },
  // Etap 2 (Dashboard Producenta/Dystrybutora) — patrz `isB2B` wyżej i
  // `Case.notificationSenderName`/`reportedByPartnerCompanyId` w schemacie API.
  { key: 'b2b', label: 'B2B', match: (c) => isB2B(c) },
  { key: 'b2c', label: 'B2C', match: (c) => !isB2B(c) },
  {
    key: 'waitingForPartner',
    label: 'Oczekujące na partnera',
    match: (c) => c.status === 'OczekiwanieNaPartnera',
  },
  {
    key: 'waitingForManufacturer',
    label: 'Oczekujące na producenta',
    match: (c) => c.status === 'PrzekazanaDoProducenta',
  },
  {
    key: 'waitingForCustomer',
    label: 'Oczekujące na klienta',
    match: (c) => c.waitingForCustomer,
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
