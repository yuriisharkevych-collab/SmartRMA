/**
 * Etap 3 (Marki i konfiguracja procesu reklamacyjnego Producenta/Dystrybutora)
 * — JEDYNY punkt w całej aplikacji, który wie, JAK połączyć wymagania/SLA
 * producenta z opcjonalnym nadpisaniem marki. Zasada właściciela: "Brand
 * override → jeśli brak, dziedziczenie z Manufacturer" — `Manufacturer`
 * pozostaje źródłem WARTOŚCI DOMYŚLNYCH, `Brand` może nadpisać KONKRETNE pola,
 * nigdy odwrotnie.
 *
 * Czyste funkcje (bez dostępu do bazy) — dane pobiera wołający
 * (`ManufacturersService`), łączenie robi WYŁĄCZNIE ten plik. Każde miejsce w
 * kodzie, które kiedykolwiek sprawdza wymagania reklamacyjne albo próg
 * "przypomnienia o reakcji", MUSI przejść przez `resolveRequirements`/
 * `resolveAttentionSla` — nigdy nie czytać `manufacturer.requiresX`/
 * `brand.requiresX` bezpośrednio. Bez tego dwa miejsca w kodzie mogłyby się
 * po cichu rozjechać (dokładnie ten problem, który ten resolver eliminuje).
 */

export interface RequirementProfile {
  requiresSerialNumber: boolean;
  requiresFrameNumber: boolean;
  requiresProofOfPurchase: boolean;
  minPhotos: number;
  requiresVideo: boolean;
  maxPhotos: number;
  maxAttachmentSizeMb: number;
}

/** Kształt `Brand` po stronie wymagań — WSZYSTKIE pola nullable (`null` = "ta marka nie nadpisuje tego pola"). */
export type RequirementOverride = Partial<
  Record<keyof RequirementProfile, boolean | number | null>
>;

export function resolveRequirements(
  manufacturer: RequirementProfile,
  brandOverride?: RequirementOverride | null,
): RequirementProfile {
  return {
    requiresSerialNumber:
      (brandOverride?.requiresSerialNumber as boolean | null | undefined) ??
      manufacturer.requiresSerialNumber,
    requiresFrameNumber:
      (brandOverride?.requiresFrameNumber as boolean | null | undefined) ??
      manufacturer.requiresFrameNumber,
    requiresProofOfPurchase:
      (brandOverride?.requiresProofOfPurchase as boolean | null | undefined) ??
      manufacturer.requiresProofOfPurchase,
    minPhotos: (brandOverride?.minPhotos as number | null | undefined) ?? manufacturer.minPhotos,
    requiresVideo:
      (brandOverride?.requiresVideo as boolean | null | undefined) ?? manufacturer.requiresVideo,
    maxPhotos: (brandOverride?.maxPhotos as number | null | undefined) ?? manufacturer.maxPhotos,
    maxAttachmentSizeMb:
      (brandOverride?.maxAttachmentSizeMb as number | null | undefined) ??
      manufacturer.maxAttachmentSizeMb,
  };
}

export interface AttentionSlaProfile {
  statusStaleDaysOverride: number | null;
  caseAgeStaleDaysOverride: number | null;
}

/**
 * Dwa poziomy nadpisania: marka > producent > (dalej, poza tym resolverem)
 * domyślne wartości firmy — `computeCaseAttention` sam sięga po domyślne
 * firmy, gdy dostanie `null` z obu poziomów tutaj, więc `null` na końcu
 * łańcucha zachowuje dotychczasowe znaczenie "brak nadpisania producenta ANI
 * marki", nie "wyłączone".
 */
export function resolveAttentionSla(
  manufacturerOverride: AttentionSlaProfile | null | undefined,
  brandOverride?: Partial<AttentionSlaProfile> | null,
): AttentionSlaProfile {
  return {
    statusStaleDaysOverride:
      brandOverride?.statusStaleDaysOverride ??
      manufacturerOverride?.statusStaleDaysOverride ??
      null,
    caseAgeStaleDaysOverride:
      brandOverride?.caseAgeStaleDaysOverride ??
      manufacturerOverride?.caseAgeStaleDaysOverride ??
      null,
  };
}
