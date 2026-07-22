/* ============================================================================
   Public Status Mapper — JEDYNE miejsce tłumaczące status wewnętrzny
   (CaseStatus) na reprezentację pokazywaną klientowi.

   Code Review (Finalizacja modułu), pkt 1: "Nie chciałbym, aby Portal
   Klienta w przyszłości znał enumy wykorzystywane przez panel pracownika
   [...] osobny moduł typu public-status.mapper.ts, który będzie jedynym
   miejscem odpowiedzialnym za tłumaczenie statusów."

   Zasada graniczna: TYLKO ten plik zna nazwy wartości CaseStatus
   (Nowa/Przyjeta/Weryfikacja/...). client-portal.js i client-login.js nie
   powinny nigdzie porównywać c.status z literałem statusu wewnętrznego -
   zawsze przez funkcje poniżej. Odpowiednik: w React byłby to samodzielny
   moduł/hook (`usePublicStatus(caseStatus)`), całkowicie niezależny od
   ekranów panelu pracownika.

   Ten plik NIE zawiera treści tekstowych - te żyją w client-labels.js
   (Code Review pkt 2, i18n-readiness). Tutaj jest wyłącznie logika
   mapowania (który status -> który etap, który procent).
   ========================================================================= */

const PUBLIC_STATUS_MAPPER = (() => {
  // Uproszczone etapy pokazywane klientowi (stepper) - 14 wewnętrznych
  // statusów (CaseStatus) to za dużo szczegółów dla klienta detalicznego;
  // mapujemy je na 5 zrozumiałych etapów wspólnych dla obu ścieżek procesu
  // (Gwarancja / Rękojmia).
  const STAGE_ORDER = ['zgloszona', 'przyjeta', 'w_trakcie', 'decyzja', 'zakonczona'];

  // progress: orientacyjny procent postępu - celowo NIE liczony z liczby
  // wewnętrznych statusów (dałoby to nierówne, mylące skoki). Wartości
  // dobrane ręcznie.
  const STAGE_PROGRESS = {
    zgloszona: 10, przyjeta: 30, w_trakcie: 60, decyzja: 85, zakonczona: 100,
  };

  // Jedyne miejsce, gdzie nazwy CaseStatus spotykają się z resztą systemu.
  const STATUS_TO_STAGE = {
    Nowa: 'zgloszona',
    Przyjeta: 'przyjeta',
    Weryfikacja: 'przyjeta',
    WeryfikacjaWewnetrzna: 'przyjeta',
    GotowaDoWysylki: 'w_trakcie',
    OczekiwanieNaKuriera: 'w_trakcie',
    WyslanaDoProducenta: 'w_trakcie',
    OczekiwanieNaDecyzjeProducenta: 'w_trakcie',
    OczekiwanieNaDecyzjeKierownika: 'w_trakcie',
    RealizacjaDecyzji: 'decyzja',
    GotowaDoOdbioru: 'zakonczona',
    Zamknieta: 'zakonczona',
    // Anulowana/Zarchiwizowana obsługiwane osobno (poza głównym stepperem,
    // patrz isSpecialStatus poniżej) - nie mają miejsca w liniowym procesie.
  };

  const SPECIAL_STATUSES = new Set(['Anulowana', 'Zarchiwizowana']);

  // UWAGA (do rozstrzygnięcia przed powrotem do implementacji): review
  // wymienia scenariusz "oczekiwanie na klienta" jako coś, co powinno dać
  // się przetestować. W obecnym enumie CaseStatus (schema.prisma,
  // BUSINESS_RULES.md) NIE MA takiego statusu - jest tylko powiadomienie
  // "prośba o uzupełnienie danych" (BR-060), nie osobny status sprawy. To
  // realny brak w modelu, nie przeoczenie w tym mapperze - patrz
  // docs/DECISIONS.md.

  function getStageKey(internalStatus) {
    return STATUS_TO_STAGE[internalStatus] || null;
  }

  function getStageOrder() {
    return STAGE_ORDER.slice();
  }

  function getStageInfo(stageKey) {
    return {
      key: stageKey,
      label: t(`stage_${stageKey}_label`),
      description: t(`stage_${stageKey}_desc`),
      progress: STAGE_PROGRESS[stageKey],
    };
  }

  function getStatusDetailText(internalStatus) {
    const key = `status_detail_${internalStatus}`;
    const text = t(key);
    return text === key ? '' : text; // brak wpisu w CLIENT_LABELS -> pusty string, nie surowy klucz
  }

  function isSpecialStatus(internalStatus) {
    return SPECIAL_STATUSES.has(internalStatus);
  }

  // Kompletny widok statusu gotowy do wyrenderowania - to jest właściwa
  // "publiczna granica": client-portal.js woła tylko tę jedną funkcję
  // i nie musi znać żadnej z map powyżej.
  function describe(internalStatus) {
    if (isSpecialStatus(internalStatus)) {
      return {
        special: true,
        title: internalStatus === 'Anulowana' ? t('status_cancelled_title') : t('status_archived_title'),
        detail: getStatusDetailText(internalStatus),
      };
    }
    const stageKey = getStageKey(internalStatus);
    const stageIndex = STAGE_ORDER.indexOf(stageKey);
    return {
      special: false,
      stageKey,
      stageIndex,
      stages: STAGE_ORDER.map((key, idx) => ({
        ...getStageInfo(key),
        state: idx < stageIndex ? 'done' : idx === stageIndex ? 'current' : 'future',
      })),
      progress: STAGE_PROGRESS[stageKey],
      detail: getStatusDetailText(internalStatus),
    };
  }

  return { getStageOrder, getStageInfo, getStageKey, getStatusDetailText, isSpecialStatus, describe };
})();
