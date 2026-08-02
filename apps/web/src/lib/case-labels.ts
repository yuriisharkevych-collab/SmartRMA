/** Etykiety PL dla `CaseHistoryAction` (`schema.prisma`) — transkrypcja `HISTORY_ACTION_LABEL` z prototypu, uzupełniona o wartości enuma, których prototyp nie znał (`NoteAdded`, `MessageSent`, `LogisticsStatusChanged`, `PriorityChanged`). */
export const HISTORY_ACTION_LABELS: Record<string, string> = {
  CaseCreated: 'Utworzono sprawę',
  StatusChanged: 'Zmieniono status',
  DocumentAdded: 'Dodano dokument',
  DocumentMarkedInvalid: 'Oznaczono dokument jako błędny',
  ManufacturerAssigned: 'Przypisano producenta',
  OwnerChanged: 'Zmieniono właściciela sprawy',
  DecisionSet: 'Ustawiono decyzję',
  NextActionUpdated: 'Zaktualizowano Next Action',
  ReplacementProductIssued: 'Wydano produkt zastępczy',
  ReplacementProductReturned: 'Zwrócono produkt zastępczy',
  InfoRequested: 'Poproszono klienta o uzupełnienie danych',
  PortalEnabled: 'Włączono portal klienta',
  PortalDisabled: 'Wyłączono portal klienta',
  NoteAdded: 'Dodano notatkę',
  MessageSent: 'Wysłano wiadomość',
  CaseClosed: 'Zamknięto sprawę',
  CaseCancelled: 'Anulowano sprawę',
  CaseArchived: 'Zarchiwizowano sprawę',
  LogisticsStatusChanged: 'Zmieniono status logistyki',
  PriorityChanged: 'Zmieniono priorytet',
};

export const DECISION_LABELS: Record<string, string> = {
  Naprawa: 'Naprawa',
  WymianaCzesci: 'Wymiana części',
  WymianaProduktu: 'Wymiana produktu',
  ZwrotSrodkow: 'Zwrot środków',
  Odrzucenie: 'Odrzucenie',
};

export const SOURCE_LABELS: Record<string, string> = {
  SklepStacjonarny: 'Sklep stacjonarny',
  Email: 'E-mail',
  Telefon: 'Telefon',
  FormularzWWW: 'Formularz WWW',
  Marketplace: 'Marketplace',
  Inne: 'Inne',
};

export const CHANNEL_LABELS: Record<string, string> = {
  Email: 'E-mail',
  SMS: 'SMS',
  Portal: 'Portal Klienta',
  Telefon: 'Telefon',
};

export const PRIORITY_TONES: Record<string, string> = {
  Niski: 'gray',
  Normalny: 'blue',
  Wysoki: 'red',
};

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  Confirmation: 'Potwierdzenie',
  Photo: 'Zdjęcie',
  PurchaseProof: 'Dowód zakupu',
  Manufacturer: 'Od producenta',
  Protocol: 'Protokół',
  Decision: 'Decyzja',
  Video: 'Film',
  Other: 'Inny',
};

/**
 * Domyślna treść Next Action po zmianie statusu — transkrypcja
 * `NEXT_ACTION_BY_STATUS` z prototypu. Backend ustawia własną wartość przy
 * przejściu (`DEFAULT_NEXT_ACTION` w `cases.service.ts`); ta mapa służy
 * WYŁĄCZNIE do podpowiedzi w modalu, żeby pracownik widział, co się stanie.
 */
export const NEXT_ACTION_BY_STATUS: Record<string, string | null> = {
  Nowa: 'Zweryfikuj kompletność zgłoszenia i przyjmij produkt od klienta.',
  Przyjeta: 'Sprawdź stan produktu i udokumentuj zdjęciami.',
  Weryfikacja: 'Zweryfikuj kompletność dokumentacji przed dalszym procesowaniem.',
  WeryfikacjaWewnetrzna: 'Przygotuj wewnętrzną ocenę sprawy (rękojmia).',
  GotowaDoWysylki: 'Przekaż produkt do wysyłki / kuriera.',
  OczekiwanieNaKuriera: 'Oczekiwanie na odbiór produktu przez kuriera.',
  WyslanaDoProducenta: 'Monitoruj odpowiedź producenta.',
  OczekiwanieNaDecyzjeProducenta: 'Oczekiwanie na decyzję producenta — sprawdź termin SLA.',
  OczekiwanieNaKlienta: 'Oczekiwanie na uzupełnienie danych przez klienta.',
  OczekiwanieNaDecyzjeKierownika: 'Kierownik: podejmij decyzję w sprawie.',
  RealizacjaDecyzji: 'Zrealizuj podjętą decyzję (naprawa / wymiana / zwrot).',
  GotowaDoOdbioru: 'Powiadom klienta, że produkt jest gotowy do odbioru.',
  Zamknieta: null,
  Anulowana: null,
  Zarchiwizowana: null,
};

export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Zaokrąglenie jak w prototypie (`SMARTRMA_DATA.formatFileSize`): KB bez części dziesiętnej, MB z jedną. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Ikona wpisu osi czasu — port `SMARTRMA_DATA.getHistoryIcon()` z prototypu.
 * Prototyp renderował emoji zamiast jednolitej kropki, żeby typ zdarzenia
 * dało się rozpoznać jednym spojrzeniem przy przewijaniu długiej historii.
 */
export function historyIcon(action: string, newValue: string | null): string {
  if (action === 'CaseCreated') return '📥';
  if (action === 'CaseCancelled') return '❌';
  if (action === 'CaseClosed') return '📦';
  if (action === 'CaseArchived') return '🗄️';
  if (action === 'ReplacementProductIssued' || action === 'ReplacementProductReturned') return '🔁';
  if (action === 'InfoRequested') return '❓';
  if (action === 'DocumentAdded') return '📎';
  if (action === 'DocumentMarkedInvalid') return '🚫';
  if (action === 'NoteAdded') return '📝';
  if (action === 'MessageSent') return '✉️';
  if (action === 'OwnerChanged') return '👤';
  if (action === 'PortalEnabled' || action === 'PortalDisabled') return '🔑';
  if (action === 'DecisionSet') {
    const icons: Record<string, string> = {
      Naprawa: '🔧',
      WymianaCzesci: '🔧',
      WymianaProduktu: '📦',
      ZwrotSrodkow: '💰',
      Odrzucenie: '⚠️',
    };
    return (newValue && icons[newValue]) || '✅';
  }
  if (action === 'StatusChanged') {
    const shipping = ['GotowaDoWysylki', 'OczekiwanieNaKuriera', 'WyslanaDoProducenta'];
    const analysis = [
      'Weryfikacja',
      'WeryfikacjaWewnetrzna',
      'OczekiwanieNaDecyzjeProducenta',
      'OczekiwanieNaDecyzjeKierownika',
    ];
    const done = ['GotowaDoOdbioru', 'Zamknieta'];
    if (newValue && shipping.includes(newValue)) return '🚚';
    if (newValue && analysis.includes(newValue)) return '🔍';
    if (newValue && done.includes(newValue)) return '📦';
    return '🔄';
  }
  return '•';
}

/** Ikona pliku wg `DocumentType` — mapowanie na komponenty z `icons.tsx` (prototyp: `DOC_TYPE_ICON`). */
export function documentIconKind(fileType: string): 'image' | 'video' | 'doc' {
  if (fileType === 'JPG' || fileType === 'PNG' || fileType === 'HEIC') return 'image';
  if (fileType === 'MP4') return 'video';
  return 'doc';
}
