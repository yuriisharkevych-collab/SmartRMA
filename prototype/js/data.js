/* ============================================================================
   SmartRMA AI — Prototyp UI — dane przykładowe
   Struktura pól odzwierciedla zatwierdzony schema.prisma (patrz docs/source
   i docs/DECISIONS.md w repozytorium głównym) — to ułatwi późniejsze
   przeniesienie 1:1 do React + realnego API.

   UWAGA (poprawka UX — Iteracja 1): to jest aplikacja wielostronicowa
   (osobny plik .html na ekran), więc każde przejście między ekranami to
   PEŁNE przeładowanie dokumentu — bez trwałości danych, cała ta tablica
   resetowałaby się do stanu początkowego przy każdej nawigacji. To była
   faktyczna przyczyna zgłoszonych błędów „nowa sprawa znika” i
   „wyszukiwarka nie znajduje nowo dodanych danych”. Rozwiązanie: stan
   mutowalny (users/manufacturers/customers/cases) jest teraz
   odczytywany/zapisywany w localStorage - patrz loadState()/persist()
   poniżej. Dane początkowe (BASE_*) są używane tylko przy pierwszym
   uruchomieniu lub po jawnym resecie.
   ========================================================================= */

const SMARTRMA_STORAGE_KEY = 'smartrma_prototype_state_v1';

const SMARTRMA_DATA = (() => {
  // Role systemowe (Zadanie: Zarządzanie pracownikami) - 'Pracownik' i
  // 'Administrator'/'Kierownik' to wartości używane w całym kodzie od
  // początku projektu (RBAC, gating nawigacji) - celowo NIE zmieniamy tych
  // wartości przy dodawaniu nowych ról, żeby nie łamać istniejącej logiki
  // w dziesiątkach miejsc. ROLE_LABELS niżej to wyłącznie etykiety
  // wyświetlane (np. "Pracownik" -> "Pracownik Działu Reklamacji").
  const ROLE_LABELS = {
    Administrator: 'Administrator',
    Kierownik: 'Kierownik',
    Pracownik: 'Pracownik Działu Reklamacji',
    Serwis: 'Serwis',
    Odczyt: 'Odczyt (tylko podgląd)',
  };
  const ALL_ROLES = Object.keys(ROLE_LABELS);

  // Oddziały/sklepy - minimalny model wspierający "przypisanie pracownika
  // do sklepu lub oddziału". SmartRMA było modelowane jako jeden sklep;
  // to pierwszy krok w stronę wielooddziałowości - patrz uwaga w
  // docs/DECISIONS.md o tym, że pełna obsługa multi-tenant/multi-branch
  // to osobna, większa decyzja architektoniczna, nie tylko dodanie pola.
  const BASE_BRANCHES = [
    { id: 'b1', name: 'Sklep Warszawa Centrum', city: 'Warszawa' },
    { id: 'b2', name: 'Sklep Kraków Podgórze', city: 'Kraków' },
    { id: 'b3', name: 'Magazyn centralny / serwis', city: 'Łódź' },
  ];

  const BASE_USERS = [
    { id: 'u1', firstName: 'Anna', lastName: 'Kowalska', email: 'pracownik@smartrma.test', role: 'Pracownik', active: true, branchId: 'b1',
      loginHistory: [
        { at: '2026-07-18T08:02:00', ip: '89.64.12.201' },
        { at: '2026-07-17T07:55:00', ip: '89.64.12.201' },
        { at: '2026-07-16T08:10:00', ip: '89.64.12.201' },
      ], passwordResetAt: null },
    { id: 'u2', firstName: 'Marek', lastName: 'Nowak', email: 'kierownik@smartrma.test', role: 'Kierownik', active: true, branchId: 'b1',
      loginHistory: [
        { at: '2026-07-18T07:40:00', ip: '89.64.12.5' },
        { at: '2026-07-15T09:12:00', ip: '89.64.12.5' },
      ], passwordResetAt: null },
    { id: 'u3', firstName: 'Ewa', lastName: 'Wiśniewska', email: 'admin@smartrma.test', role: 'Administrator', active: true, branchId: 'b1',
      loginHistory: [
        { at: '2026-07-19T06:58:00', ip: '89.64.12.1' },
      ], passwordResetAt: null },
    { id: 'u4', firstName: 'Piotr', lastName: 'Zieliński', email: 'piotr.zielinski@smartrma.test', role: 'Pracownik', active: true, branchId: 'b2',
      loginHistory: [
        { at: '2026-07-18T08:30:00', ip: '156.17.4.90' },
        { at: '2026-07-14T08:22:00', ip: '156.17.4.90' },
      ], passwordResetAt: null },
    { id: 'u5', firstName: 'Karolina', lastName: 'Lewandowska', email: 'karolina.lewandowska@smartrma.test', role: 'Pracownik', active: false, branchId: 'b2',
      loginHistory: [], passwordResetAt: '2026-05-02T10:00:00' },
    { id: 'u6', firstName: 'Tomasz', lastName: 'Serwisant', email: 'serwis@smartrma.test', role: 'Serwis', active: true, branchId: 'b3',
      loginHistory: [{ at: '2026-07-17T13:00:00', ip: '77.10.2.44' }], passwordResetAt: null },
    { id: 'u7', firstName: 'Beata', lastName: 'Obserwator', email: 'odczyt@smartrma.test', role: 'Odczyt', active: true, branchId: 'b1',
      loginHistory: [], passwordResetAt: null },
  ];

  const BASE_MANUFACTURERS = [
    {
      id: 'm1',
      name: 'BabyComfort Sp. z o.o.',
      country: 'Polska',
      nip: '5261234567',
      address: 'ul. Fabryczna 12, 05-200 Wołomin',
      contactEmail: 'reklamacje@babycomfort.example',
      contactPhone: '22 555 10 20',
      contactPerson: 'Agnieszka Duda',
      submissionMethod: 'E-mail',
      portalUrl: '', portalLogin: '', portalPassword: '',
      complaintProcedure: 'Zgłoszenie mailowe wraz ze zdjęciami wady i numerem seryjnym.',
      requiredDocumentsNote: 'Dowód zakupu, zdjęcia wady (min. 3 ujęcia).',
      requiredPhotosNote: 'Zdjęcie całości produktu, zbliżenie wady, numer seryjny.',
      requiredVideosNote: '',
      requiresSerialNumber: true, requiresFrameNumber: false, requiresProofOfPurchase: true,
      maxPhotos: 6, maxAttachmentSizeMb: 15,
      logistics: {
        returnAddress: 'BabyComfort Sp. z o.o., ul. Fabryczna 12, 05-200 Wołomin',
        transportOrganizer: 'Klient',
        manufacturerProvidesLabel: false,
        shopCanOrderCourier: true, shopCourierCost: 20,
        originalPackagingRequired: true, substitutePackagingAllowed: true,
        transportProtectionNote: 'Owinąć folią bąbelkową, unikać kontaktu elementów metalowych.',
        productConditionNote: 'Produkt czysty, suchy, przygotowany do oględzin serwisowych.',
      },
      automation: { autoEmailEnabled: true, autoReminders: true, autoEscalation: false, autoCloseEnabled: false, autoCloseDays: 30 },
      brandIds: ['br1', 'br2'],
      active: true,
    },
    {
      id: 'm2',
      name: 'KidsTech S.A.',
      country: 'Polska',
      nip: '7010987654',
      address: 'ul. Przemysłowa 8, 61-016 Poznań',
      contactEmail: 'rma@kidstech.example',
      contactPhone: '61 444 90 10',
      contactPerson: 'Michał Sobczak',
      submissionMethod: 'Portal B2B',
      portalUrl: 'https://portal.kidstech.example', portalLogin: 'smartrma_sklep', portalPassword: 'DEMO-nieprawdziwe-haslo', // DEMO: w produkcji sekret przechowywany zaszyfrowany po stronie backendu
      complaintProcedure: 'Zgłoszenie przez portal producenta, wymagany numer ramy.',
      requiredDocumentsNote: 'Dowód zakupu, karta gwarancyjna.',
      requiredPhotosNote: 'Zdjęcie tabliczki znamionowej / numeru ramy.',
      requiredVideosNote: 'Film pokazujący usterkę mechanizmu (do 15 sekund).',
      requiresSerialNumber: true, requiresFrameNumber: true, requiresProofOfPurchase: true,
      maxPhotos: 8, maxAttachmentSizeMb: 25,
      logistics: {
        returnAddress: 'KidsTech S.A., ul. Przemysłowa 8, 61-016 Poznań',
        transportOrganizer: 'Producent',
        manufacturerProvidesLabel: true,
        shopCanOrderCourier: false, shopCourierCost: 0,
        originalPackagingRequired: true, substitutePackagingAllowed: true,
        transportProtectionNote: 'Zabezpieczyć elementy ruchome taśmą, oryginalne piankowe wkładki jeśli dostępne.',
        productConditionNote: 'Produkt czysty, suchy, przygotowany do oględzin serwisowych.',
      },
      automation: { autoEmailEnabled: true, autoReminders: true, autoEscalation: true, autoCloseEnabled: true, autoCloseDays: 21 },
      brandIds: ['br3', 'br4', 'br5', 'br6', 'br7', 'br8'],
      active: true,
    },
    {
      id: 'm3',
      name: 'Wózkomania Polska',
      country: 'Polska',
      nip: '8992345671',
      address: 'ul. Logistyczna 3, 90-001 Łódź',
      contactEmail: 'serwis@wozkomania.example',
      contactPhone: '42 333 20 15',
      contactPerson: 'Rafał Krupa',
      submissionMethod: 'Formularz WWW',
      portalUrl: '', portalLogin: '', portalPassword: '',
      complaintProcedure: 'Zgłoszenie przez formularz WWW producenta, produkt wysyłany kurierem na adres serwisu centralnego.',
      requiredDocumentsNote: 'Dowód zakupu.',
      requiredPhotosNote: '',
      requiredVideosNote: '',
      requiresSerialNumber: false, requiresFrameNumber: true, requiresProofOfPurchase: true,
      maxPhotos: 4, maxAttachmentSizeMb: 10,
      logistics: {
        returnAddress: 'Wózkomania Polska - Serwis Centralny, ul. Logistyczna 3, 90-001 Łódź',
        transportOrganizer: 'Sklep',
        manufacturerProvidesLabel: false,
        shopCanOrderCourier: true, shopCourierCost: 20,
        originalPackagingRequired: false, substitutePackagingAllowed: true,
        transportProtectionNote: 'Zabezpieczyć koła i elementy składane taśmą transportową.',
        productConditionNote: 'Produkt czysty, suchy, przygotowany do oględzin serwisowych.',
      },
      automation: { autoEmailEnabled: true, autoReminders: false, autoEscalation: false, autoCloseEnabled: false, autoCloseDays: 30 },
      brandIds: ['br9'],
      active: true,
    },
    {
      id: 'm4',
      name: 'Fotelik Plus',
      country: 'Czechy',
      nip: 'CZ27182736',
      address: 'Průmyslová 22, 100 00 Praha',
      contactEmail: 'kontakt@fotelikplus.example',
      contactPhone: '+420 222 333 444',
      contactPerson: 'Petra Nováková',
      submissionMethod: 'E-mail',
      portalUrl: '', portalLogin: '', portalPassword: '',
      complaintProcedure: 'Zgłoszenie mailowe, odpowiedź w ciągu 5 dni roboczych.',
      requiredDocumentsNote: 'Dowód zakupu, opis usterki.',
      requiredPhotosNote: 'Zdjęcie usterki.',
      requiredVideosNote: '',
      requiresSerialNumber: false, requiresFrameNumber: false, requiresProofOfPurchase: true,
      maxPhotos: 4, maxAttachmentSizeMb: 10,
      logistics: {
        returnAddress: 'Fotelik Plus, Průmyslová 22, 100 00 Praha, Czechy',
        transportOrganizer: 'Klient',
        manufacturerProvidesLabel: false,
        shopCanOrderCourier: false, shopCourierCost: 0,
        originalPackagingRequired: true, substitutePackagingAllowed: false,
        transportProtectionNote: 'Wymagane oryginalne opakowanie - producent nie akceptuje zastępczego.',
        productConditionNote: 'Produkt czysty, suchy, przygotowany do oględzin serwisowych.',
      },
      automation: { autoEmailEnabled: false, autoReminders: false, autoEscalation: false, autoCloseEnabled: false, autoCloseDays: 30 },
      brandIds: [],
      active: false,
    },
  ];

  // Marki (Brand) - relacja jeden-do-wielu z Manufacturer (jeden
  // producent/dystrybutor obsługuje wiele marek; w tym modelu marka należy
  // do dokładnie jednego producenta - upraszcza UI, wystarczające dla
  // przykładu z zadania: "Dystrybutor XYZ obsługuje: Cybex, Joie...").
  // Używane do automatycznego rozpoznawania producenta po marce produktu
  // przy rejestracji reklamacji (case-new.js, client-new-case.js).
  const BASE_BRANDS = [
    { id: 'br1', name: 'BabyComfort', manufacturerId: 'm1' },
    { id: 'br2', name: 'ComfyLine', manufacturerId: 'm1' },
    { id: 'br3', name: 'Cybex', manufacturerId: 'm2' },
    { id: 'br4', name: 'Joie', manufacturerId: 'm2' },
    { id: 'br5', name: 'Britax Römer', manufacturerId: 'm2' },
    { id: 'br6', name: 'Maxi-Cosi', manufacturerId: 'm2' },
    { id: 'br7', name: 'Kinderkraft', manufacturerId: 'm2' },
    { id: 'br8', name: 'Espiro', manufacturerId: 'm2' },
    { id: 'br9', name: 'Wózkomania', manufacturerId: 'm3' },
  ];

  function findBrand(id) { return brands.find((b) => b.id === id); }
  function findBranch(id) { return BASE_BRANCHES.find((b) => b.id === id); }
  function getBrandsForManufacturer(manufacturerId) {
    return brands.filter((b) => b.manufacturerId === manufacturerId);
  }
  function getManufacturerByBrandId(brandId) {
    const brand = findBrand(brandId);
    return brand ? manufacturers.find((m) => m.id === brand.manufacturerId) : null;
  }

  const BASE_CUSTOMERS = [
    { id: 'c1', firstName: 'Katarzyna', lastName: 'Zawadzka', phone: '600 111 222', email: 'k.zawadzka@example.com', address: 'ul. Kwiatowa 12, 00-123 Warszawa' },
    { id: 'c2', firstName: 'Tomasz', lastName: 'Jabłoński', phone: '601 222 333', email: 't.jablonski@example.com', address: 'ul. Leśna 4, 30-001 Kraków' },
    { id: 'c3', firstName: 'Magdalena', lastName: 'Krawczyk', phone: '602 333 444', email: 'm.krawczyk@example.com', address: 'ul. Polna 8, 61-002 Poznań' },
    { id: 'c4', firstName: 'Adam', lastName: 'Sikora', phone: '603 444 555', email: 'a.sikora@example.com', address: 'ul. Ogrodowa 2, 80-100 Gdańsk' },
    { id: 'c5', firstName: 'Natalia', lastName: 'Kaczmarek', phone: '604 555 666', email: 'n.kaczmarek@example.com', address: 'ul. Krótka 9, 50-002 Wrocław' },
    { id: 'c6', firstName: 'Michał', lastName: 'Wozniak', phone: '605 666 777', email: 'm.wozniak@example.com', address: 'ul. Słoneczna 15, 40-003 Katowice' },
    { id: 'c7', firstName: 'Aleksandra', lastName: 'Dąbrowska', phone: '606 777 888', email: 'a.dabrowska@example.com', address: 'ul. Spokojna 6, 20-004 Lublin' },
    { id: 'c8', firstName: 'Jakub', lastName: 'Piotrowski', phone: '607 888 999', email: 'j.piotrowski@example.com', address: 'ul. Górna 11, 70-005 Szczecin' },
    { id: 'c9', firstName: 'Aleksandra-Weronika', lastName: 'Świętosławska-Wojciechowska-Kowalczyk', phone: '608 999 000', email: 'aleksandra.weronika.swietoslawska-wojciechowska@bardzodlugadomenapocztowa-testowa.example.com', address: 'ul. Bardzo Długiej Nazwy Ulicy imienia Testowego Scenariusza Responsywności 128/45B, 00-999 Warszawa' }, // DEMO: celowo bardzo długie dane - test responsywności (Code Review pkt 5)
  ];

  // ---------------------------------------------------------------------
  // Wizard zgłoszenia reklamacyjnego (SmartRMA - Zadanie techniczne) —
  // mock "bazy zamówień sklepu". W produkcji numer zamówienia byłby
  // wyszukiwany w systemie sprzedażowym (osobna integracja, poza zakresem
  // schema.prisma) - tu to płaska tablica, żeby zademonstrować UX
  // "wpisz numer -> pola się same uzupełniają".
  // ---------------------------------------------------------------------
  const MOCK_ORDERS = [
    { orderNumber: 'ZAM/2026/10021', manufacturerId: 'm1', productModel: 'Wózek spacerowy Comfy 3.0', serialNumber: 'BC-2025-55210', purchaseDate: '2026-05-12', invoiceNumber: 'FV/2026/05/210' },
    { orderNumber: 'ZAM/2026/10088', manufacturerId: 'm2', productModel: 'Fotelik samochodowy SafeRide Pro', serialNumber: 'KT-991900', purchaseDate: '2026-04-02', invoiceNumber: 'PAR/2026/04/88' },
    { orderNumber: 'ZAM/2026/10134', manufacturerId: 'm3', productModel: 'Wózek głęboki Classic Line', serialNumber: 'WM-330800', purchaseDate: '2026-06-19', invoiceNumber: 'FV/2026/06/134' },
    { orderNumber: 'ZAM/2026/09950', manufacturerId: 'm1', productModel: 'Nosidełko ergonomiczne CloseHug', serialNumber: 'BC-2025-99500', purchaseDate: '2026-01-28', invoiceNumber: 'FV/2026/01/95' },
  ];

  function findOrder(orderNumber) {
    const q = (orderNumber || '').trim().toLowerCase();
    return MOCK_ORDERS.find((o) => o.orderNumber.toLowerCase() === q) || null;
  }

  // Format: RMA/{rok}/{sekwencja 4-cyfrowa}. Współdzielone przez rejestrację
  // pracowniczą (case-new.js) i kreator klienta (client-new-case.js) - wcześniej
  // zduplikowane w case-new.js, scalone tutaj żeby uniknąć dwóch niezależnych
  // liczników mogących wygenerować ten sam numer.
  function generateCaseNumber(now = new Date('2026-07-18')) {
    const prefix = `RMA/${now.getFullYear()}/`;
    const count = cases.filter((c) => c.caseNumber.startsWith(prefix)).length;
    return `${prefix}${String(count + 1).padStart(4, '0')}`;
  }

  // Statusy zgodne z enumem CaseStatus (schema.prisma) - etykiety PL + kategoria
  // koloru używana do badge'y w tabelach/kartach.
  const STATUS_META = {
    Nowa: { label: 'Nowa', tone: 'blue' },
    Przyjeta: { label: 'Przyjęta', tone: 'blue' },
    Weryfikacja: { label: 'Weryfikacja', tone: 'amber' },
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

  const COMPLAINT_TYPE_META = {
    Warranty: { label: 'Gwarancja', hint: 'Decyzję podejmuje producent' },
    StatutoryWarranty: { label: 'Rękojmia', hint: 'Decyzję podejmuje Kierownik (sklep)' },
  };

  // Kolejność statusów w jednym miejscu (STATUS_META zachowuje kolejność
  // wstawiania kluczy) - używane przez pełny pasek filtrów na Dashboardzie
  // i przez modal zmiany statusu w szczegółach sprawy, żeby nie utrzymywać
  // tej samej listy w dwóch plikach.
  const ALL_STATUSES = Object.keys(STATUS_META);

  const SOURCE_OPTIONS = ['Sklep stacjonarny', 'E-mail', 'Telefon', 'Formularz WWW', 'Marketplace', 'Inne'];

  // ---------------------------------------------------------------------
  // Portal Klienta (CLIENT_PORTAL*.md) — przesunięty z kategorii "Future"
  // do bieżącego etapu na wyraźną decyzję (patrz docs/DECISIONS.md).
  //
  // Mapowanie statusów wewnętrznych -> publicznych żyje wyłącznie w
  // public-status-mapper.js (Code Review, Finalizacja modułu, pkt 1).
  // Teksty widoczne dla klienta żyją wyłącznie w client-labels.js (pkt 2).
  // Ten plik (data.js) trzyma tylko dane i logikę niezwiązaną z tekstem/
  // tłumaczeniem statusów: kto widzi który wpis historii, jak grupować
  // wpisy wg daty, jakie ikony pokazać.
  // ---------------------------------------------------------------------

  // CLIENT_PORTAL_DATABASE.md: CaseHistory.visibleForCustomer - które
  // zdarzenia z wewnętrznej historii sprawy trafiają do publicznej osi
  // czasu klienta. Wpisy techniczne/wewnętrzne (przypisanie producenta,
  // zmiana właściciela sprawy, aktualizacja Next Action) zostają ukryte.
  const CUSTOMER_VISIBLE_ACTIONS = new Set([
    'CaseCreated', 'StatusChanged', 'DecisionSet', 'CaseClosed', 'CaseCancelled',
    'ReplacementProductIssued', 'ReplacementProductReturned', 'InfoRequested',
  ]);

  function getCustomerVisibleHistory(c) {
    return c.history.filter((h) => h.visibleForCustomer);
  }

  // Code Review (Finalizacja modułu), pkt 4: grupowanie historii wg daty
  // ("Dzisiaj" / "Wczoraj" / DD.MM.RRRR). Zwraca tablicę grup zamiast
  // płaskiej listy - client-portal.js tylko renderuje, nie liczy dat.
  function groupHistoryByDate(entries) {
    const groups = [];
    const todayStr = TODAY.toDateString();
    const yesterday = new Date(TODAY);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    entries.forEach((entry) => {
      const entryDate = new Date(entry.createdAt);
      const dayStr = entryDate.toDateString();
      const label = dayStr === todayStr
        ? t('history_group_today')
        : dayStr === yesterdayStr
          ? t('history_group_yesterday')
          : formatDate(entry.createdAt);

      let group = groups.find((g) => g.label === label);
      if (!group) {
        group = { label, entries: [] };
        groups.push(group);
      }
      group.entries.push(entry);
    });

    return groups;
  }

  // Code Review pkt 5: ikonografia historii. Wyznaczana na podstawie
  // action + (newValue lub decision) - jedna funkcja, używana zarówno
  // przez oś czasu klienta (client-portal.js), jak i historię pracownika
  // (case-detail.js), żeby nie mieć dwóch niezależnych mapowań.
  function getHistoryIcon(entry) {
    if (entry.action === 'CaseCreated') return '📥';
    if (entry.action === 'CaseCancelled') return '❌';
    if (entry.action === 'CaseClosed') return '📦';
    if (entry.action === 'ReplacementProductIssued' || entry.action === 'ReplacementProductReturned') return '🔁';
    if (entry.action === 'InfoRequested') return '❓';
    if (entry.action === 'DecisionSet') {
      const icons = { Naprawa: '🔧', ZwrotSrodkow: '💰', WymianaProduktu: '📦', WymianaCzesci: '🔧', Odrzucenie: '⚠️' };
      return icons[entry.newValue] || '✅';
    }
    if (entry.action === 'StatusChanged') {
      const shipping = ['GotowaDoWysylki', 'OczekiwanieNaKuriera', 'WyslanaDoProducenta'];
      const analysis = ['Weryfikacja', 'WeryfikacjaWewnetrzna', 'OczekiwanieNaDecyzjeProducenta', 'OczekiwanieNaDecyzjeKierownika'];
      const done = ['GotowaDoOdbioru', 'Zamknieta'];
      if (shipping.includes(entry.newValue)) return '🚚';
      if (analysis.includes(entry.newValue)) return '🔍';
      if (done.includes(entry.newValue)) return '📦';
      return '🔄';
    }
    return '•';
  }

  function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const DECISION_META = {
    Naprawa: 'Naprawa',
    WymianaCzesci: 'Wymiana części',
    WymianaProduktu: 'Wymiana produktu',
    ZwrotSrodkow: 'Zwrot środków',
    Odrzucenie: 'Odrzucenie',
  };

  const BASE_CASES = [
    {
      id: 'case1',
      caseNumber: 'RMA/2026/0001',
      customerId: 'c1',
      product: { manufacturerId: 'm1', model: 'Wózek spacerowy Comfy 3.0', serialNumber: 'BC-2025-88213', frameNumber: '', purchaseDate: '2025-11-02', purchaseProofNumber: 'FV/2025/11/8821' },
      complaintType: 'Warranty',
      source: 'Sklep stacjonarny',
      clientPortalEnabled: true,
      clientAccessCode: 'RM4-8821', // DEMO: w produkcji tylko hash (clientAccessCodeHash) - patrz verifyAccessCode()
      clientLastLogin: '2026-07-17T18:40:00',
      clientAccessToken: null, // DEMO: token bezpiecznego linku (jednorazowy) - patrz generateSecureToken()/validateToken()
      clientAccessTokenUsed: false,
      documents: [
        { id: 'case1-doc1', fileName: 'Potwierdzenie przyjęcia reklamacji', fileType: 'PDF', mimeType: 'application/pdf', fileSize: 118500, category: 'confirmation' },
        { id: 'case1-doc2', fileName: 'zdjecie_wady_kolo.jpg', fileType: 'JPG', mimeType: 'image/jpeg', fileSize: 2340000, category: 'photo' },
      ],
      description: 'Zacinające się koło przednie po lewej stronie, słychać zgrzyt podczas skrętu.',
      customerStatement: 'Koło z przodu po lewej zacina się przy skręcaniu, słychać wyraźny zgrzyt od około tygodnia.',
      requestedResolution: 'Naprawa lub wymiana koła',
      status: 'Nowa',
      priority: 'Normalny',
      decision: null,
      decisionAt: null,
      nextAction: 'Zweryfikuj kompletność zgłoszenia i przyjmij produkt od klienta.',
      nextActionDueDate: '2026-07-21',
      requiresManagerApproval: false,
      isException: false,
      ownerId: 'u1',
      createdAt: '2026-07-17T09:14:00',
      history: [
        { action: 'CaseCreated', newValue: 'Nowa', userId: 'u1', createdAt: '2026-07-17T09:14:00' },
      ],
    },
    {
      id: 'case2',
      caseNumber: 'RMA/2026/0002',
      customerId: 'c2',
      product: { manufacturerId: 'm2', model: 'Fotelik samochodowy SafeRide Pro', serialNumber: 'KT-991823', frameNumber: 'FR-KT-4471', purchaseDate: '2025-09-15', purchaseProofNumber: 'PAR/2025/09/442' },
      complaintType: 'Warranty',
      source: 'E-mail',
      clientPortalEnabled: true,
      clientAccessCode: 'RM4-4471', // DEMO: w produkcji tylko hash (clientAccessCodeHash) - patrz verifyAccessCode()
      clientLastLogin: null,
      clientAccessToken: null, // DEMO: token bezpiecznego linku (jednorazowy) - patrz generateSecureToken()/validateToken()
      clientAccessTokenUsed: false,
      documents: [
        { id: 'case2-doc1', fileName: 'Potwierdzenie przyjęcia reklamacji', fileType: 'PDF', mimeType: 'application/pdf', fileSize: 121200, category: 'confirmation' },
        { id: 'case2-doc2', fileName: 'zdjecie_sprzaczki.jpg', fileType: 'JPG', mimeType: 'image/jpeg', fileSize: 1870000, category: 'photo' },
        { id: 'case2-doc3', fileName: 'karta_gwarancyjna.pdf', fileType: 'PDF', mimeType: 'application/pdf', fileSize: 340000, category: 'manufacturer' },
      ],
      description: 'Uszkodzona sprzączka pasa bezpieczeństwa - nie blokuje się prawidłowo.',
      customerStatement: 'Sprzączka czasami się nie zatrzaskuje, musiałem próbować kilka razy.',
      requestedResolution: 'Wymiana produktu - kwestia bezpieczeństwa',
      status: 'WyslanaDoProducenta',
      priority: 'Wysoki',
      decision: null,
      decisionAt: null,
      nextAction: 'Monitoruj odpowiedź producenta (KidsTech S.A.) - termin SLA za 3 dni.',
      nextActionDueDate: '2026-07-20',
      requiresManagerApproval: false,
      isException: false,
      ownerId: 'u1',
      createdAt: '2026-07-10T11:02:00',
      history: [
        { action: 'CaseCreated', newValue: 'Nowa', userId: 'u1', createdAt: '2026-07-10T11:02:00' },
        { action: 'StatusChanged', previousValue: 'Nowa', newValue: 'Przyjeta', userId: 'u1', createdAt: '2026-07-10T14:20:00' },
        { action: 'DocumentAdded', newValue: 'zdjecia_sprzaczki.jpg', userId: 'u1', createdAt: '2026-07-11T08:40:00' },
        { action: 'ManufacturerAssigned', newValue: 'KidsTech S.A.', userId: 'u1', createdAt: '2026-07-11T08:41:00' },
        { action: 'StatusChanged', previousValue: 'GotowaDoWysylki', newValue: 'WyslanaDoProducenta', userId: 'u1', createdAt: '2026-07-12T10:00:00' },
      ],
    },
    {
      id: 'case3',
      caseNumber: 'RMA/2026/0003',
      customerId: 'c3',
      product: { manufacturerId: 'm3', model: 'Wózek głęboki Classic Line', serialNumber: 'WM-330912', frameNumber: 'FR-WM-9012', purchaseDate: '2025-06-20', purchaseProofNumber: 'FV/2025/06/119' },
      complaintType: 'StatutoryWarranty',
      source: 'Telefon',
      clientPortalEnabled: true,
      clientAccessCode: 'RM4-9012', // DEMO: w produkcji tylko hash (clientAccessCodeHash) - patrz verifyAccessCode()
      clientLastLogin: '2026-07-14T09:12:00',
      clientAccessToken: null, // DEMO: token bezpiecznego linku (jednorazowy) - patrz generateSecureToken()/validateToken()
      clientAccessTokenUsed: false,
      documents: [
        { id: 'case3-doc1', fileName: 'Potwierdzenie przyjęcia reklamacji', fileType: 'PDF', mimeType: 'application/pdf', fileSize: 119800, category: 'confirmation' },
        { id: 'case3-doc2', fileName: 'zdjecie_pekniecia_ramy.jpg', fileType: 'JPG', mimeType: 'image/jpeg', fileSize: 2910000, category: 'photo' },
      ],
      description: 'Pęknięcie ramy w miejscu mocowania gondoli po 4 miesiącach użytkowania.',
      customerStatement: 'Rama pękła w miejscu mocowania gondoli, produkt był używany zgodnie z instrukcją.',
      requestedResolution: 'Zwrot pieniędzy',
      status: 'OczekiwanieNaDecyzjeKierownika',
      priority: 'Wysoki',
      decision: null,
      decisionAt: null,
      nextAction: 'Kierownik: podejmij decyzję ws. zwrotu środków (rękojmia, wada istotna).',
      nextActionDueDate: '2026-07-19',
      requiresManagerApproval: true,
      isException: true,
      ownerId: 'u4',
      createdAt: '2026-07-08T13:45:00',
      history: [
        { action: 'CaseCreated', newValue: 'Nowa', userId: 'u4', createdAt: '2026-07-08T13:45:00' },
        { action: 'StatusChanged', previousValue: 'Nowa', newValue: 'Przyjeta', userId: 'u4', createdAt: '2026-07-08T15:10:00' },
        { action: 'StatusChanged', previousValue: 'Weryfikacja', newValue: 'WeryfikacjaWewnetrzna', userId: 'u4', createdAt: '2026-07-09T09:00:00' },
        { action: 'StatusChanged', previousValue: 'WeryfikacjaWewnetrzna', newValue: 'OczekiwanieNaDecyzjeKierownika', userId: 'u4', createdAt: '2026-07-14T12:00:00' },
      ],
    },
    {
      id: 'case4',
      caseNumber: 'RMA/2026/0004',
      customerId: 'c4',
      product: { manufacturerId: 'm1', model: 'Chusta do noszenia ErgoWrap', serialNumber: '', frameNumber: '', purchaseDate: '2025-12-01', purchaseProofNumber: 'FV/2025/12/33' },
      complaintType: 'Warranty',
      source: 'Formularz WWW',
      clientPortalEnabled: true,
      clientAccessCode: 'RM4-3305', // DEMO: w produkcji tylko hash (clientAccessCodeHash) - patrz verifyAccessCode()
      clientLastLogin: null,
      clientAccessToken: null, // DEMO: token bezpiecznego linku (jednorazowy) - patrz generateSecureToken()/validateToken()
      clientAccessTokenUsed: false,
      documents: [
        { id: 'case4-doc1', fileName: 'Potwierdzenie przyjęcia reklamacji', fileType: 'PDF', mimeType: 'application/pdf', fileSize: 117400, category: 'confirmation' },
      ],
      description: 'Rozerwany szew przy jednym z zapięć.',
      customerStatement: 'Szew przy zapięciu rozerwał się po kilku praniach zgodnych z instrukcją.',
      requestedResolution: 'Naprawa lub wymiana',
      status: 'RealizacjaDecyzji',
      priority: 'Niski',
      decision: 'WymianaProduktu',
      decisionAt: '2026-07-15T10:00:00',
      nextAction: 'Wyślij nowy produkt do klienta i zaktualizuj status po nadaniu przesyłki.',
      nextActionDueDate: '2026-07-19',
      requiresManagerApproval: false,
      isException: false,
      ownerId: 'u1',
      createdAt: '2026-07-05T10:20:00',
      history: [
        { action: 'CaseCreated', newValue: 'Nowa', userId: 'u1', createdAt: '2026-07-05T10:20:00' },
        { action: 'StatusChanged', previousValue: 'OczekiwanieNaDecyzjeProducenta', newValue: 'RealizacjaDecyzji', userId: 'u1', createdAt: '2026-07-15T10:00:00' },
        { action: 'DecisionSet', newValue: 'WymianaProduktu', userId: 'u1', createdAt: '2026-07-15T10:00:00' },
      ],
    },
    {
      id: 'case5',
      caseNumber: 'RMA/2026/0005',
      customerId: 'c5',
      product: { manufacturerId: 'm2', model: 'Kojec turystyczny FoldEasy', serialNumber: 'KT-771029', frameNumber: 'FR-KT-2291', purchaseDate: '2025-08-11', purchaseProofNumber: 'FV/2025/08/771' },
      complaintType: 'Warranty',
      source: 'Marketplace',
      clientPortalEnabled: true,
      clientAccessCode: 'RM4-2291', // DEMO: w produkcji tylko hash (clientAccessCodeHash) - patrz verifyAccessCode()
      clientLastLogin: null,
      clientAccessToken: null, // DEMO: token bezpiecznego linku (jednorazowy) - patrz generateSecureToken()/validateToken()
      clientAccessTokenUsed: false,
      documents: [
        { id: 'case5-doc1', fileName: 'Potwierdzenie przyjęcia reklamacji', fileType: 'PDF', mimeType: 'application/pdf', fileSize: 120100, category: 'confirmation' },
        { id: 'case5-doc2', fileName: 'protokol_naprawy.pdf', fileType: 'PDF', mimeType: 'application/pdf', fileSize: 205000, category: 'protocol' },
      ],
      description: 'Zapadający się mechanizm blokujący nóżki w rozłożonej pozycji.',
      customerStatement: 'Nóżki same się składają, mechanizm blokujący nie trzyma.',
      requestedResolution: 'Naprawa',
      status: 'GotowaDoOdbioru',
      priority: 'Normalny',
      decision: 'Naprawa',
      decisionAt: '2026-07-12T09:30:00',
      nextAction: 'Powiadom klienta, że produkt jest gotowy do odbioru w sklepie.',
      nextActionDueDate: '2026-07-18',
      requiresManagerApproval: false,
      isException: false,
      ownerId: 'u4',
      createdAt: '2026-06-28T08:00:00',
      history: [
        { action: 'CaseCreated', newValue: 'Nowa', userId: 'u4', createdAt: '2026-06-28T08:00:00' },
        { action: 'DecisionSet', newValue: 'Naprawa', userId: 'u4', createdAt: '2026-07-12T09:30:00' },
        { action: 'StatusChanged', previousValue: 'RealizacjaDecyzji', newValue: 'GotowaDoOdbioru', userId: 'u4', createdAt: '2026-07-16T15:00:00' },
      ],
    },
    {
      id: 'case6',
      caseNumber: 'RMA/2026/0006',
      customerId: 'c6',
      product: { manufacturerId: 'm3', model: 'Wózek spacerowy UrbanGo', serialNumber: 'WM-118820', frameNumber: 'FR-WM-5541', purchaseDate: '2025-05-19', purchaseProofNumber: 'FV/2025/05/220' },
      complaintType: 'StatutoryWarranty',
      source: 'Sklep stacjonarny',
      clientPortalEnabled: true,
      clientAccessCode: 'RM4-6650', // DEMO: w produkcji tylko hash (clientAccessCodeHash) - patrz verifyAccessCode()
      clientLastLogin: '2026-07-02T08:15:00',
      clientAccessToken: null, // DEMO: token bezpiecznego linku (jednorazowy) - patrz generateSecureToken()/validateToken()
      clientAccessTokenUsed: false,
      documents: [
        { id: 'case6-doc1', fileName: 'Potwierdzenie przyjęcia reklamacji', fileType: 'PDF', mimeType: 'application/pdf', fileSize: 118900, category: 'confirmation' },
        { id: 'case6-doc2', fileName: 'zdjecie_tapicerki.jpg', fileType: 'JPG', mimeType: 'image/jpeg', fileSize: 2105000, category: 'photo' },
        { id: 'case6-doc3', fileName: 'decyzja_odrzucenie.pdf', fileType: 'PDF', mimeType: 'application/pdf', fileSize: 98000, category: 'decision' },
      ],
      description: 'Odbarwienie tapicerki po kontakcie z deszczem mimo osłony przeciwdeszczowej.',
      customerStatement: 'Tapicerka odbarwiła się mimo używania osłony przeciwdeszczowej producenta.',
      requestedResolution: 'Wymiana tapicerki',
      status: 'Zamknieta',
      priority: 'Niski',
      decision: 'Odrzucenie',
      decisionAt: '2026-07-01T12:00:00',
      nextAction: null,
      nextActionDueDate: null,
      requiresManagerApproval: true,
      isException: false,
      ownerId: 'u2',
      createdAt: '2026-06-20T09:10:00',
      closedAt: '2026-07-02T09:00:00',
      history: [
        { action: 'CaseCreated', newValue: 'Nowa', userId: 'u2', createdAt: '2026-06-20T09:10:00' },
        { action: 'DecisionSet', newValue: 'Odrzucenie', userId: 'u2', createdAt: '2026-07-01T12:00:00' },
        { action: 'CaseClosed', newValue: 'Zamknieta', userId: 'u2', createdAt: '2026-07-02T09:00:00' },
      ],
    },
    {
      id: 'case7',
      caseNumber: 'RMA/2026/0007',
      customerId: 'c9', // DEMO: celowo bardzo długie dane klienta - test responsywności
      product: { manufacturerId: 'm1', model: 'Nosidełko ergonomiczne CloseHug', serialNumber: 'BC-2025-99012', frameNumber: '', purchaseDate: '2026-01-05', purchaseProofNumber: 'FV/2026/01/91' },
      complaintType: 'Warranty',
      source: 'E-mail',
      clientPortalEnabled: true,
      clientAccessCode: 'RM4-1187', // DEMO: w produkcji tylko hash (clientAccessCodeHash) - patrz verifyAccessCode()
      clientLastLogin: null,
      clientAccessToken: null, // DEMO: token bezpiecznego linku (jednorazowy) - patrz generateSecureToken()/validateToken()
      clientAccessTokenUsed: false,
      documents: [
        { id: 'case7-doc1', fileName: 'Potwierdzenie przyjęcia reklamacji', fileType: 'PDF', mimeType: 'application/pdf', fileSize: 116700, category: 'confirmation' },
        { id: 'case7-doc2', fileName: 'protokol_szczegolowej_diagnostyki_technicznej_zamka_blyskawicznego_i_kieszeni_bocznej.pdf', fileType: 'PDF', mimeType: 'application/pdf', fileSize: 245000, category: 'protocol' } // DEMO: celowo bardzo długa nazwa pliku,
      ],
      description: 'Uszkodzony zamek błyskawiczny w kieszeni bocznej.',
      customerStatement: '',
      requestedResolution: 'Naprawa',
      status: 'Przyjeta',
      priority: 'Niski',
      decision: null,
      decisionAt: null,
      nextAction: 'Przygotuj zgłoszenie do producenta (BabyComfort) zgodnie z wymaganymi dokumentami.',
      nextActionDueDate: '2026-07-22',
      requiresManagerApproval: false,
      isException: false,
      ownerId: 'u1',
      createdAt: '2026-07-16T14:30:00',
      history: [
        { action: 'CaseCreated', newValue: 'Nowa', userId: 'u1', createdAt: '2026-07-16T14:30:00' },
        { action: 'StatusChanged', previousValue: 'Nowa', newValue: 'Przyjeta', userId: 'u1', createdAt: '2026-07-16T15:50:00' },
      ],
    },
    {
      id: 'case8',
      caseNumber: 'RMA/2026/0008',
      customerId: 'c8',
      product: { manufacturerId: 'm2', model: 'Fotelik samochodowy SafeRide Mini', serialNumber: 'KT-220145', frameNumber: 'FR-KT-8890', purchaseDate: '2025-10-30', purchaseProofNumber: 'FV/2025/10/551' },
      complaintType: 'Warranty',
      source: 'Telefon',
      clientPortalEnabled: true,
      clientAccessCode: 'RM4-7743', // DEMO: w produkcji tylko hash (clientAccessCodeHash) - patrz verifyAccessCode()
      clientLastLogin: null,
      clientAccessToken: null, // DEMO: token bezpiecznego linku (jednorazowy) - patrz generateSecureToken()/validateToken()
      clientAccessTokenUsed: false,
      documents: [
        { id: 'case8-doc1', fileName: 'Potwierdzenie przyjęcia reklamacji', fileType: 'PDF', mimeType: 'application/pdf', fileSize: 119300, category: 'confirmation' },
        { id: 'case8-doc2', fileName: 'zdjecie_zaglowka.jpg', fileType: 'JPG', mimeType: 'image/jpeg', fileSize: 1654000, category: 'photo' },
      ],
      description: 'Głośny trzask przy regulacji zagłówka.',
      customerStatement: 'Podczas regulacji wysokości zagłówka słychać głośny, nietypowy trzask.',
      requestedResolution: 'Diagnoza / naprawa',
      status: 'OczekiwanieNaKuriera',
      priority: 'Normalny',
      decision: null,
      decisionAt: null,
      nextAction: 'Oczekiwanie na odbiór produktu przez kuriera - sprawdź status przesyłki.',
      nextActionDueDate: '2026-07-18',
      requiresManagerApproval: false,
      isException: false,
      ownerId: 'u1',
      createdAt: '2026-07-13T09:00:00',
      history: [
        { action: 'CaseCreated', newValue: 'Nowa', userId: 'u1', createdAt: '2026-07-13T09:00:00' },
        { action: 'StatusChanged', previousValue: 'GotowaDoWysylki', newValue: 'OczekiwanieNaKuriera', userId: 'u1', createdAt: '2026-07-15T11:00:00' },
      ],
    },
    {
      id: 'case9',
      caseNumber: 'RMA/2025/0184',
      customerId: 'c1',
      product: { manufacturerId: 'm3', model: 'Wózek 3w1 TravelSet', serialNumber: 'WM-004471', frameNumber: 'FR-WM-1102', purchaseDate: '2025-03-02', purchaseProofNumber: 'FV/2025/03/44' },
      complaintType: 'Warranty',
      source: 'Formularz WWW',
      clientPortalEnabled: true,
      clientAccessCode: 'RM4-5528', // DEMO: w produkcji tylko hash (clientAccessCodeHash) - patrz verifyAccessCode()
      clientLastLogin: '2025-12-21T11:00:00',
      clientAccessToken: null, // DEMO: token bezpiecznego linku (jednorazowy) - patrz generateSecureToken()/validateToken()
      clientAccessTokenUsed: false,
      documents: [
        { id: 'case9-doc1', fileName: 'Potwierdzenie przyjęcia reklamacji', fileType: 'PDF', mimeType: 'application/pdf', fileSize: 120600, category: 'confirmation' },
        { id: 'case9-doc2', fileName: 'protokol_wymiany_kola.pdf', fileType: 'PDF', mimeType: 'application/pdf', fileSize: 187000, category: 'protocol' },
      ],
      description: 'Wyciek amortyzatora tylnego koła.',
      customerStatement: 'Pod kołem tylnym pojawia się plama oleju, koło mniej amortyzuje.',
      requestedResolution: 'Wymiana koła',
      status: 'Zamknieta',
      priority: 'Normalny',
      decision: 'WymianaCzesci',
      decisionAt: '2025-12-18T10:00:00',
      nextAction: null,
      nextActionDueDate: null,
      requiresManagerApproval: false,
      isException: false,
      ownerId: 'u4',
      createdAt: '2025-12-01T10:00:00',
      closedAt: '2025-12-20T10:00:00',
      history: [
        { action: 'CaseCreated', newValue: 'Nowa', userId: 'u4', createdAt: '2025-12-01T10:00:00' },
        { action: 'DecisionSet', newValue: 'WymianaCzesci', userId: 'u4', createdAt: '2025-12-18T10:00:00' },
        { action: 'CaseClosed', newValue: 'Zamknieta', userId: 'u4', createdAt: '2025-12-20T10:00:00' },
      ],
    },
    {
      id: 'case10',
      caseNumber: 'RMA/2026/0009',
      customerId: 'c2',
      product: { manufacturerId: 'm1', model: 'Wózek spacerowy Comfy 3.0', serialNumber: 'BC-2025-77120', frameNumber: '', purchaseDate: '2025-11-28', purchaseProofNumber: 'FV/2025/11/902' },
      complaintType: 'StatutoryWarranty',
      source: 'Sklep stacjonarny',
      clientPortalEnabled: true,
      clientAccessCode: 'RM4-9964', // DEMO: w produkcji tylko hash (clientAccessCodeHash) - patrz verifyAccessCode()
      clientLastLogin: null,
      clientAccessToken: null, // DEMO: token bezpiecznego linku (jednorazowy) - patrz generateSecureToken()/validateToken()
      clientAccessTokenUsed: false,
      documents: [
        { id: 'case10-doc1', fileName: 'Potwierdzenie przyjęcia reklamacji', fileType: 'PDF', mimeType: 'application/pdf', fileSize: 115900, category: 'confirmation' },
      ],
      description: 'Klient zgłasza chęć anulowania reklamacji - problem ustąpił po regulacji przez klienta.',
      customerStatement: '',
      requestedResolution: 'Naprawa',
      status: 'Anulowana',
      priority: 'Niski',
      decision: null,
      decisionAt: null,
      nextAction: null,
      nextActionDueDate: null,
      requiresManagerApproval: false,
      isException: false,
      ownerId: 'u1',
      createdAt: '2026-07-06T09:00:00',
      cancelledAt: '2026-07-07T10:00:00',
      history: [
        { action: 'CaseCreated', newValue: 'Nowa', userId: 'u1', createdAt: '2026-07-06T09:00:00' },
        { action: 'CaseCancelled', newValue: 'Anulowana', userId: 'u1', createdAt: '2026-07-07T10:00:00' },
      ],
    },
    {
      id: 'case11',
      caseNumber: 'RMA/2026/0010',
      customerId: 'c3',
      product: { manufacturerId: 'm2', model: 'Bujaczek elektroniczny SoftSway', serialNumber: 'KT-556012', frameNumber: '', purchaseDate: '2026-02-14', purchaseProofNumber: 'FV/2026/02/76' },
      complaintType: 'StatutoryWarranty',
      source: 'Marketplace',
      clientPortalEnabled: true,
      clientAccessCode: 'RM4-2217', // DEMO: w produkcji tylko hash (clientAccessCodeHash) - patrz verifyAccessCode()
      clientLastLogin: null,
      clientAccessToken: null, // DEMO: token bezpiecznego linku (jednorazowy) - patrz generateSecureToken()/validateToken()
      clientAccessTokenUsed: false,
      documents: [
        { id: 'case11-doc1', fileName: 'Potwierdzenie przyjęcia reklamacji', fileType: 'PDF', mimeType: 'application/pdf', fileSize: 118200, category: 'confirmation' },
        { id: 'case11-doc2', fileName: 'zdjecie_bujaczka.jpg', fileType: 'JPG', mimeType: 'image/jpeg', fileSize: 2240000, category: 'photo' },
        { id: 'case11-doc3', fileName: 'decyzja_zwrot_srodkow.pdf', fileType: 'PDF', mimeType: 'application/pdf', fileSize: 102000, category: 'decision' },
      ],
      description: 'Silnik bujania nie uruchamia się mimo naładowanej baterii.',
      customerStatement: 'Bujaczek w ogóle nie reaguje na włącznik, bateria jest naładowana (sprawdzone na innym urządzeniu).',
      requestedResolution: 'Zwrot środków',
      status: 'Zamknieta',
      priority: 'Wysoki',
      decision: 'ZwrotSrodkow',
      decisionAt: '2026-06-30T10:00:00',
      nextAction: null,
      nextActionDueDate: null,
      requiresManagerApproval: true,
      isException: false,
      ownerId: 'u4',
      createdAt: '2026-06-20T16:00:00',
      closedAt: '2026-07-01T09:00:00',
      history: [
        { action: 'CaseCreated', newValue: 'Nowa', userId: 'u4', createdAt: '2026-06-20T16:00:00' },
        { action: 'StatusChanged', previousValue: 'Nowa', newValue: 'Przyjeta', userId: 'u4', createdAt: '2026-06-21T09:00:00' },
        { action: 'StatusChanged', previousValue: 'Weryfikacja', newValue: 'WeryfikacjaWewnetrzna', userId: 'u4', createdAt: '2026-06-23T11:00:00' },
        { action: 'StatusChanged', previousValue: 'WeryfikacjaWewnetrzna', newValue: 'OczekiwanieNaDecyzjeKierownika', userId: 'u4', createdAt: '2026-06-27T10:00:00' },
        { action: 'DecisionSet', newValue: 'ZwrotSrodkow', userId: 'u2', createdAt: '2026-06-30T10:00:00' },
        { action: 'CaseClosed', newValue: 'Zamknieta', userId: 'u2', createdAt: '2026-07-01T09:00:00' },
      ],
    },
    {
      id: 'case12',
      caseNumber: 'RMA/2026/0011',
      customerId: 'c5',
      product: { manufacturerId: 'm3', model: 'Wózek głęboki Classic Line', serialNumber: 'WM-990211', frameNumber: 'FR-WM-3390', purchaseDate: '2025-07-07', purchaseProofNumber: 'FV/2025/07/318' },
      complaintType: 'Warranty',
      source: 'E-mail',
      clientPortalEnabled: true,
      clientAccessCode: 'RM4-8390', // DEMO: w produkcji tylko hash (clientAccessCodeHash) - patrz verifyAccessCode()
      clientLastLogin: null,
      clientAccessToken: null, // DEMO: token bezpiecznego linku (jednorazowy) - patrz generateSecureToken()/validateToken()
      clientAccessTokenUsed: false,
      documents: [
        { id: 'case12-doc1', fileName: 'Potwierdzenie przyjęcia reklamacji', fileType: 'PDF', mimeType: 'application/pdf', fileSize: 117900, category: 'confirmation' },
        { id: 'case12-doc2', fileName: 'nagranie_skrzypienia.mp4', fileType: 'MP4', mimeType: 'video/mp4', fileSize: 8420000, category: 'photo' },
      ],
      description: 'Skrzypiące zawieszenie przy przejeżdżaniu przez nierówności.',
      customerStatement: 'Głośne skrzypienie zawieszenia, nasila się przy nierównej nawierzchni.',
      requestedResolution: 'Naprawa',
      status: 'OczekiwanieNaDecyzjeProducenta',
      priority: 'Normalny',
      decision: null,
      decisionAt: null,
      nextAction: 'Termin SLA producenta (Wózkomania Polska) upływa za 2 dni - jeśli brak odpowiedzi, wyślij przypomnienie.',
      nextActionDueDate: '2026-07-18',
      requiresManagerApproval: false,
      isException: false,
      ownerId: 'u1',
      createdAt: '2026-07-04T10:15:00',
      history: [
        { action: 'CaseCreated', newValue: 'Nowa', userId: 'u1', createdAt: '2026-07-04T10:15:00' },
        { action: 'StatusChanged', previousValue: 'WyslanaDoProducenta', newValue: 'OczekiwanieNaDecyzjeProducenta', userId: 'u1', createdAt: '2026-07-09T10:00:00' },
      ],
    },
  ];

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function storageAvailable() {
    try {
      const testKey = '__smartrma_storage_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  // POPRAWKA KRYTYCZNA (UX Review Iteracja 2, punkt 2): zgłoszenie "nowa
  // reklamacja nadal nie zapisuje sprawy" najprawdopodobniej nie jest błędem
  // logiki (ta sama ścieżka kodu działała w testach), tylko efektem tego, że
  // przeglądarka blokuje localStorage w danym kontekście (otwarcie pliku
  // bezpośrednio przez file://, tryb prywatny z zablokowanym storage, albo
  // podgląd w piaskownicy o innym originie niż lokalny serwer). W takiej
  // sytuacji poprzednia wersja failowała CICHO (try/catch + console.warn) -
  // sprawa "zapisywała się" tylko do najbliższej nawigacji, dokładnie jak
  // opisano w zgłoszeniu. Teraz: wykrywamy to jawnie i informujemy w UI
  // (patrz app.js: renderStorageWarningIfNeeded) zamiast dawać fałszywy
  // komunikat sukcesu.
  const STORAGE_OK = storageAvailable();

  function loadState() {
    if (!STORAGE_OK) return null;
    try {
      const raw = localStorage.getItem(SMARTRMA_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.users && parsed.manufacturers && parsed.customers && parsed.cases) {
        return parsed;
      }
    } catch (e) {
      console.warn('Nie udało się odczytać zapisanego stanu prototypu, wracam do danych początkowych.', e);
    }
    return null;
  }

  const persisted = loadState();
  const users = persisted ? persisted.users : deepClone(BASE_USERS);
  const manufacturers = persisted ? persisted.manufacturers : deepClone(BASE_MANUFACTURERS);
  const customers = persisted ? persisted.customers : deepClone(BASE_CUSTOMERS);
  const cases = persisted ? persisted.cases : deepClone(BASE_CASES);
  const brands = persisted && persisted.brands ? persisted.brands : deepClone(BASE_BRANDS);

  // Domyślna widoczność wpisu historii dla klienta - stosowana też do
  // danych wczytanych wcześniej z localStorage (sprzed dodania Portalu
  // Klienta), żeby nie wymagać ręcznego resetu danych demo po aktualizacji.
  cases.forEach((c) => {
    c.history.forEach((h) => {
      if (h.visibleForCustomer === undefined) {
        h.visibleForCustomer = CUSTOMER_VISIBLE_ACTIONS.has(h.action);
      }
    });
    (c.documents || []).forEach((d) => {
      if (!d.uploadedAt) d.uploadedAt = c.createdAt;
    });
  });

  // Kompatybilność wsteczna: dane zapisane w localStorage przed rozbudową
  // panelu administracyjnego (pracownicy/producenci) nie mają nowych pól.
  users.forEach((u) => {
    if (u.branchId === undefined) u.branchId = BASE_BRANCHES[0]?.id || null;
    if (u.loginHistory === undefined) u.loginHistory = [];
    if (u.passwordResetAt === undefined) u.passwordResetAt = null;
  });
  manufacturers.forEach((m) => {
    if (m.logistics === undefined) {
      m.logistics = {
        returnAddress: m.address || '', transportOrganizer: 'Klient', manufacturerProvidesLabel: false,
        shopCanOrderCourier: false, shopCourierCost: 0, originalPackagingRequired: true,
        substitutePackagingAllowed: true, transportProtectionNote: '', productConditionNote: '',
      };
    }
    if (m.automation === undefined) {
      m.automation = { autoEmailEnabled: false, autoReminders: false, autoEscalation: false, autoCloseEnabled: false, autoCloseDays: 30 };
    }
    if (m.brandIds === undefined) m.brandIds = [];
    if (m.country === undefined) m.country = 'Polska';
    if (m.nip === undefined) m.nip = '';
    if (m.contactPhone === undefined) m.contactPhone = '';
    if (m.contactPerson === undefined) m.contactPerson = '';
    if (m.portalLogin === undefined) m.portalLogin = '';
    if (m.portalPassword === undefined) m.portalPassword = '';
    if (m.requiredVideosNote === undefined) m.requiredVideosNote = '';
    if (m.requiresSerialNumber === undefined) m.requiresSerialNumber = false;
    if (m.requiresFrameNumber === undefined) m.requiresFrameNumber = false;
    if (m.requiresProofOfPurchase === undefined) m.requiresProofOfPurchase = true;
    if (m.maxPhotos === undefined) m.maxPhotos = 6;
    if (m.maxAttachmentSizeMb === undefined) m.maxAttachmentSizeMb = 15;
    // "Kurier" istniało jako wartość submissionMethod przed rozdzieleniem
    // "sposobu zgłoszenia" od logistyki transportu - migrujemy na jedną
    // z trzech aktualnych wartości (E-mail/Portal B2B/Formularz WWW).
    if (m.submissionMethod === 'Kurier') m.submissionMethod = 'E-mail';
  });

  // Wywołuj po KAŻDEJ mutacji users/manufacturers/customers/cases/brands
  // (push, splice, Object.assign na elemencie itd.), inaczej zmiana
  // przetrwa tylko do najbliższej nawigacji między ekranami (patrz uwaga
  // na górze pliku). Zwraca false, gdy zapis się nie powiódł (np.
  // STORAGE_OK === false) - wywołujący może wtedy pokazać użytkownikowi
  // ostrzeżenie zamiast milczącej utraty danych.
  function persist() {
    if (!STORAGE_OK) return false;
    try {
      localStorage.setItem(SMARTRMA_STORAGE_KEY, JSON.stringify({ users, manufacturers, customers, cases, brands }));
      return true;
    } catch (e) {
      console.warn('Nie udało się zapisać stanu prototypu.', e);
      return false;
    }
  }

  function resetToSeed() {
    localStorage.removeItem(SMARTRMA_STORAGE_KEY);
    window.location.href = 'dashboard.html';
  }

  // Stała "dzisiejsza data" prototypu - dane przykładowe są tworzone
  // względem tej daty, żeby stany "przeterminowane" / "na dziś" były
  // sensowne niezależnie od rzeczywistej daty otwarcia prototypu. Wspólne
  // dla dashboard.js i cases.js (kafelki dashboardu -> filtry listy muszą
  // liczyć te same rzeczy tak samo).
  const TODAY = new Date('2026-07-18T00:00:00');

  function isOpenCase(c) {
    return !['Zamknieta', 'Anulowana', 'Zarchiwizowana'].includes(c.status);
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    return Math.round((d - TODAY) / 86400000);
  }

  function isOverdue(c) {
    return isOpenCase(c) && c.nextActionDueDate && daysUntil(c.nextActionDueDate) < 0;
  }

  function isDueToday(c) {
    return isOpenCase(c) && c.nextActionDueDate && daysUntil(c.nextActionDueDate) === 0;
  }

  function findUser(id) { return users.find((u) => u.id === id); }
  function findCustomer(id) { return customers.find((c) => c.id === id); }
  function findManufacturer(id) { return manufacturers.find((m) => m.id === id); }
  function findCase(id) { return cases.find((c) => c.id === id); }

  function initials(user) {
    if (!user) return '?';
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ', ' + d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  }

  // Statystyki producenta - liczone z RZECZYWISTYCH danych demo (cases),
  // nie zmyślone liczby. "Historia współpracy" i "średni czas realizacji"
  // mają sens tylko dla spraw zamkniętych.
  function getManufacturerStats(manufacturerId) {
    const related = cases.filter((c) => c.product.manufacturerId === manufacturerId);
    const closed = related.filter((c) => c.status === 'Zamknieta' && c.closedAt);

    const modelCounts = {};
    related.forEach((c) => { modelCounts[c.product.model] = (modelCounts[c.product.model] || 0) + 1; });
    const topModels = Object.entries(modelCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

    const avgResolutionDays = closed.length
      ? Math.round(closed.reduce((sum, c) => sum + (new Date(c.closedAt) - new Date(c.createdAt)) / 86400000, 0) / closed.length)
      : null;

    return {
      totalCases: related.length,
      openCases: related.filter((c) => isOpenCase(c)).length,
      closedCases: closed.length,
      topModels,
      avgResolutionDays,
    };
  }

  // BACKEND TODO: reset hasła to w produkcji wygenerowanie tokenu,
  // wysyłka linku e-mail i faktyczna zmiana hasha w bazie. Tu tylko mock
  // zwracający "tymczasowe hasło" do pokazania administratorowi.
  function generateTempPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let pass = '';
    for (let i = 0; i < 10; i++) pass += chars[Math.floor(Math.random() * chars.length)];
    return pass;
  }

  return {
    users, manufacturers, customers, cases, brands, branches: BASE_BRANCHES,
    ROLE_LABELS, ALL_ROLES,
    STATUS_META, COMPLAINT_TYPE_META, DECISION_META, ALL_STATUSES, SOURCE_OPTIONS,
    getCustomerVisibleHistory, groupHistoryByDate, getHistoryIcon, formatFileSize, findOrder, generateCaseNumber,
    findUser, findCustomer, findManufacturer, findCase, findBrand, findBranch,
    getBrandsForManufacturer, getManufacturerByBrandId, getManufacturerStats, generateTempPassword,
    initials, formatDate, formatDateTime,
    persist, resetToSeed,
    TODAY, isOpenCase, isOverdue, isDueToday, daysUntil,
    storageAvailable: STORAGE_OK,
  };
})();
