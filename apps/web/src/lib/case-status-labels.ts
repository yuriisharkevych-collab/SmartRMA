/**
 * Etykiety PL + kolor badge'a dla `CaseStatus` (`schema.prisma`) — 14
 * wartości enuma, transkrybowane 1:1 z bazą (nie z `prototype/js/data.js`,
 * którego `STATUS_META` pochodzi ze starszej wersji schematu i brakuje mu
 * `OczekiwanieNaKlienta`). `tone` odpowiada klasom `.badge-*` z
 * `design-system.css`.
 */
export const STATUS_META: Record<string, { label: string; tone: string }> = {
  Nowa: { label: 'Nowa', tone: 'blue' },
  Przyjeta: { label: 'Przyjęta', tone: 'blue' },
  Weryfikacja: { label: 'Weryfikacja', tone: 'amber' },
  OczekiwanieNaKlienta: { label: 'Oczekiwanie na klienta', tone: 'amber' },
  GotowaDoWysylki: { label: 'Gotowa do wysyłki', tone: 'amber' },
  OczekiwanieNaKuriera: { label: 'Oczekiwanie na kuriera', tone: 'amber' },
  WyslanaDoProducenta: { label: 'Wysłana do producenta', tone: 'primary' },
  OczekiwanieNaDecyzjeProducenta: { label: 'Oczekiwanie na decyzję producenta', tone: 'amber' },
  WeryfikacjaWewnetrzna: { label: 'Weryfikacja wewnętrzna', tone: 'amber' },
  OczekiwanieNaDecyzjeKierownika: { label: 'Oczekiwanie na decyzję Kierownika', tone: 'amber' },
  RealizacjaDecyzji: { label: 'Realizacja decyzji', tone: 'primary' },
  GotowaDoOdbioru: { label: 'Gotowa do odbioru', tone: 'green' },
  Zamknieta: { label: 'Zamknięta', tone: 'gray' },
  Anulowana: { label: 'Anulowana', tone: 'gray' },
  Zarchiwizowana: { label: 'Zarchiwizowana', tone: 'gray' },
};

export const COMPLAINT_TYPE_LABELS: Record<string, string> = {
  Warranty: 'Gwarancja',
  StatutoryWarranty: 'Rękojmia',
};

export function statusMeta(status: string): { label: string; tone: string } {
  return STATUS_META[status] ?? { label: status, tone: 'gray' };
}
