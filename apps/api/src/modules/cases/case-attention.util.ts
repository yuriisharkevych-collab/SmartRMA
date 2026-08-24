export type CaseAttentionReason = 'StatusStale' | 'CaseAgeStale';

export interface CaseAttentionResult {
  needsAttention: boolean;
  reasons: CaseAttentionReason[];
  statusStaleDaysElapsed: number;
  caseAgeDaysElapsed: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysElapsed(since: Date, now: Date): number {
  return Math.floor((now.getTime() - since.getTime()) / MS_PER_DAY);
}

/** Nadpisanie per producent wygrywa, jeśli ustawione (`!= null`); `null`/`undefined` = użyj wartości domyślnej firmy. Wartość domyślna firmy `null` = próg wyłączony (mechanizm nieaktywny dla tej podstawy liczenia). */
function resolveThreshold(
  companyDefault: number | null,
  override: number | null | undefined,
): number | null {
  return override ?? companyDefault;
}

/**
 * Przypomnienia o reakcji ("od X dni status się nie zmienił" / "X dni od
 * zgłoszenia") — dwie NIEZALEŻNE podstawy liczenia dni, każda z osobnym,
 * opcjonalnym progiem (firma domyślnie + nadpisanie per producent, patrz
 * `ManufacturerSLA`/`CompanySettings` w schema.prisma). Sprawa w statusie
 * końcowym (`isFinal`) nigdy nie wymaga reakcji — nie ma już nic do zrobienia.
 * Czysta funkcja (bez zapytań do bazy) — używana identycznie przez listę
 * spraw, licznik na Dashboardzie i harmonogram powiadomień, żeby wszystkie
 * trzy miejsca liczyły "wymaga reakcji" dokładnie tak samo.
 */
export function computeCaseAttention(params: {
  isFinal: boolean;
  statusChangedAt: Date;
  createdAt: Date;
  companyDefaults: {
    defaultStatusStaleDays: number | null;
    defaultCaseAgeStaleDays: number | null;
  };
  manufacturerOverrides?: {
    statusStaleDaysOverride: number | null;
    caseAgeStaleDaysOverride: number | null;
  } | null;
  now?: Date;
}): CaseAttentionResult {
  const now = params.now ?? new Date();
  const statusStaleDaysElapsed = daysElapsed(params.statusChangedAt, now);
  const caseAgeDaysElapsed = daysElapsed(params.createdAt, now);

  if (params.isFinal) {
    return { needsAttention: false, reasons: [], statusStaleDaysElapsed, caseAgeDaysElapsed };
  }

  const statusThreshold = resolveThreshold(
    params.companyDefaults.defaultStatusStaleDays,
    params.manufacturerOverrides?.statusStaleDaysOverride,
  );
  const ageThreshold = resolveThreshold(
    params.companyDefaults.defaultCaseAgeStaleDays,
    params.manufacturerOverrides?.caseAgeStaleDaysOverride,
  );

  const reasons: CaseAttentionReason[] = [];
  if (statusThreshold != null && statusStaleDaysElapsed >= statusThreshold)
    reasons.push('StatusStale');
  if (ageThreshold != null && caseAgeDaysElapsed >= ageThreshold) reasons.push('CaseAgeStale');

  return {
    needsAttention: reasons.length > 0,
    reasons,
    statusStaleDaysElapsed,
    caseAgeDaysElapsed,
  };
}
