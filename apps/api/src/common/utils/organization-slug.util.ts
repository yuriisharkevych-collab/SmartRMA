/**
 * Przeniesione z `scripts/slugify.ts` (Etap 5) — `PartnershipsService.invitePartner`
 * potrzebuje TEJ SAMEJ logiki co skrypty bootstrapujące (`create-admin.ts`/
 * `create-organization.ts`), żeby nowo zakładana firma partnera (Dystrybutor
 * zaprasza e-mailem) miała slug/prefiks numeracji wyliczony DOKŁADNIE tak samo
 * jak firma zakładana ręcznie przez administratora SmartRMA — jedno źródło
 * prawdy zamiast dwóch kopii tej samej funkcji w dwóch miejscach.
 */
const PL_MAP: Record<string, string> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
};

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => PL_MAP[ch])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Domyślny prefiks numeracji NOWEJ firmy (`CompanySettings.caseNumberPrefix`).
 * MUSI różnić się między firmami — `CasesRepository.findMaxSequenceInYear`
 * celowo liczy maksimum PO PREFIKSIE (nie po `companyId`), bo `Case.caseNumber`
 * jest unikalny GLOBALNIE (Portal Klienta loguje się numerem sprawy bez
 * podawania firmy) i licznik czysto per-firmowy deterministycznie zapętla
 * się w retry, gdy dwie firmy dzielą prefiks (patrz doc-comment przy tej
 * metodzie w `cases.repository.ts`). Pierwsze do 4 znaków alfanumerycznych
 * nazwy, wielkimi literami.
 */
export function deriveCaseNumberPrefix(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => PL_MAP[ch])
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return normalized.slice(0, 4) || 'ORG';
}
