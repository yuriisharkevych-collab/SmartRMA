export interface CaseNumberingConfig {
  caseNumberPrefix: string;
  caseNumberPadding: number;
  caseNumberResetYearly: boolean;
}

/**
 * Kształt numeru sprawy DOWOLNEJ organizacji — `{prefix}/{rok}/{sekwencja}`
 * albo (gdy `caseNumberResetYearly=false`) `{prefix}/{sekwencja}`, patrz
 * `formatCaseNumber`. Prefiks jest per-firma (`CompanySettings.caseNumberPrefix`,
 * `UpdateNumberingDto` — 1–10 znaków, bez ograniczenia na "/"), więc walidacja
 * wejścia (np. logowanie do Portalu Klienta) NIE MOŻE zakładać jednego stałego
 * prefiksu (dawny bug: `portal-login.dto.ts` miał zaszyte na sztywno "RMA",
 * co blokowało Portal dla każdej firmy z innym prefiksem, np. "VERE"). Właściwą
 * autoryzację i tak wykonuje `CasesRepository.findByCaseNumber` (numer jest
 * globalnie unikalny) + kod dostępu — ten wzorzec to tylko wstępna walidacja
 * kształtu, nie kontrola dostępu.
 */
export const CASE_NUMBER_PATTERN = /^[^/]{1,10}\/(?:\d{4}\/)?\d+$/;

/**
 * Format domyślny (`resetYearly=true`): `{prefix}/{rok}/{sekwencja}`,
 * zgodny z dotychczasowym hardcoded "RMA/{rok}/{seq}". Gdy admin wyłączy
 * reset roczny, rok znika z numeru — sekwencja jest wtedy liczona
 * "na całe życie" firmy (patrz `countCreatedTotal` w CasesRepository),
 * więc umieszczanie roku w numerze byłoby mylące (sugerowałoby reset, którego
 * nie ma).
 */
export function formatCaseNumber(
  config: CaseNumberingConfig,
  year: number,
  sequence: number,
): string {
  const paddedSequence = String(sequence).padStart(config.caseNumberPadding, '0');
  return config.caseNumberResetYearly
    ? `${config.caseNumberPrefix}/${year}/${paddedSequence}`
    : `${config.caseNumberPrefix}/${paddedSequence}`;
}
