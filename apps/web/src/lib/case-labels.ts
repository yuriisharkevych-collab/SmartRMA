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
  CaseItemUpdated: 'Poprawiono dane pozycji',
  HandoffSent: 'Przekazano sprawę partnerowi B2B',
  HandoffPartnerUpdate: 'Aktualizacja od partnera B2B',
};

export const DECISION_LABELS: Record<string, string> = {
  Naprawa: 'Naprawa',
  WymianaCzesci: 'Wymiana części',
  WymianaProduktu: 'Wymiana produktu',
  ZwrotSrodkow: 'Zwrot środków',
  Odrzucenie: 'Odrzucenie',
};

/** Faza 6 (Producent/Dystrybutor + Partnerzy B2B) — etykiety `Case.originType`, niezależne od `SOURCE_LABELS` (kanał zgłoszenia klienta). */
export const ORIGIN_TYPE_LABELS: Record<string, string> = {
  DirectCustomer: 'Klient bezpośredni',
  PartnerB2B: 'Partner B2B',
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
 * Domyślna treść Next Action po zmianie statusu (Status Workflow Refactor —
 * 9 statusów katalogu). Backend ustawia własną wartość przy przejściu
 * (`CaseStatusDefinition.defaultNextAction`); ta mapa służy WYŁĄCZNIE do
 * podpowiedzi w modalu, żeby pracownik widział, co się prawdopodobnie stanie.
 */
export const NEXT_ACTION_BY_STATUS: Record<string, string | null> = {
  Nowa: 'Zweryfikuj kompletność zgłoszenia i przyjmij produkt od klienta.',
  Przyjeta: 'Sprawdź stan produktu, udokumentuj zdjęciami i skompletuj wymagane dokumenty.',
  PrzekazanaDoProducenta: 'Monitoruj odpowiedź producenta / dystrybutora.',
  DecyzjaPozytywna: 'Zrealizuj podjętą decyzję (naprawa / wymiana / zwrot).',
  TowarWyslanyDoSerwisu: 'Monitoruj status naprawy w serwisie.',
  TowarWrocilZSerwisu: 'Powiadom klienta, że produkt jest gotowy do odbioru.',
  DecyzjaNegatywna: 'Poinformuj klienta o decyzji i uzasadnieniu producenta.',
  Zakonczona: null,
  ReklamacjaPonownie: 'Zweryfikuj ponowne zgłoszenie i ustal dalsze kroki.',
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

/**
 * Adres klienta złożony z 3 osobnych pól (`address`=ulica i numer, `city`,
 * `postalCode`) — formularz publiczny zbiera je osobno (patrz
 * `PublicComplaintFormPage`), starsze rekordy klientów (utworzone ręcznie
 * przez pracownika przed tą zmianą) mogą mieć tylko `address` wypełnione.
 */
export function formatCustomerAddress(
  customer:
    { address: string | null; city: string | null; postalCode: string | null } | null | undefined,
): string {
  if (!customer) return '—';
  const cityLine = [customer.postalCode, customer.city].filter(Boolean).join(' ');
  const parts = [customer.address, cityLine].filter((p) => p && p.trim().length > 0);
  return parts.length > 0 ? parts.join(', ') : '—';
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
    const inTransit = ['PrzekazanaDoProducenta', 'TowarWyslanyDoSerwisu'];
    const decided = ['DecyzjaPozytywna', 'DecyzjaNegatywna'];
    const done = ['TowarWrocilZSerwisu', 'Zakonczona'];
    if (newValue && inTransit.includes(newValue)) return '🚚';
    if (newValue && decided.includes(newValue)) return '⚖️';
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
