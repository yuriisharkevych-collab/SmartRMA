/** Współdzielone przez `create-admin.ts`/`create-organization.ts` — Publiczny Formularz Reklamacyjny (`/reklamacja/:orgSlug`) potrzebuje sluga dla KAŻDEJ nowo tworzonej firmy. Zamiana polskich znaków jest celowo prosta (bootstrap script) — dla nazw z niestandardowymi znakami warto nadpisać wynik ręcznie przez zmienną środowiskową. */
const PL_MAP: Record<string, string> = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };

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
 * metodzie w `cases.repository.ts`). Każda firma bez WŁASNEGO prefiksu
 * dostawała ten sam hardcoded "RMA" (`company-settings.service.ts`), więc jej
 * numeracja w praktyce dzieliła sekwencję z każdą inną firmą korzystającą z
 * tego samego domyślnego — stąd ta funkcja, wołana raz przy zakładaniu firmy.
 * Pierwsze do 4 znaków alfanumerycznych nazwy, wielkimi literami.
 */
export function deriveCaseNumberPrefix(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => PL_MAP[ch])
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return normalized.slice(0, 4) || 'ORG';
}
