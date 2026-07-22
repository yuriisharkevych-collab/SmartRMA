/* ============================================================================
   Client Labels — centralny słownik WSZYSTKICH tekstów widocznych dla
   klienta w Portalu Klienta (statusy, komunikaty, błędy, opisy, przyciski).

   Code Review (Finalizacja modułu), pkt 2: "Przygotowanie pod
   wielojęzyczność [...] Chciałbym jedynie uniknąć twardo wpisanych
   tekstów rozproszonych po wielu plikach."

   Na tym etapie NIE implementujemy i18n (brak przełącznika języka, brak
   wykrywania locale) - to świadomie poza zakresem. Ten plik to wyłącznie
   przygotowanie architektury: jeden obiekt z kluczami zamiast tekstu
   wpisanego wprost w client-login.js / client-portal.js / *.html. Dodanie
   drugiego języka w przyszłości będzie oznaczało dodanie drugiego obiektu
   (np. CLIENT_LABELS_EN) i przełącznika w t(), a nie przeszukiwanie
   kilkunastu plików w poszukiwaniu polskiego tekstu.

   Statusy klienta (dawniej część data.js) też tu mieszkają - to jeden z
   rodzajów tekstu widocznego dla klienta, nie osobna kategoria. Faktyczne
   MAPOWANIE status wewnętrzny -> klucz tekstu żyje w
   public-status-mapper.js (Code Review pkt 1) - ten plik dostarcza tylko
   treść, nie wie nic o CaseStatus.
   ========================================================================= */

const CLIENT_LABELS = {
  // --- Nawigacja / powłoka ---
  brand_name: 'SmartRMA AI',
  nav_status: 'Status',
  nav_history: 'Historia',
  nav_documents: 'Dokumenty',
  nav_contact: 'Kontakt',
  action_logout: 'Wyloguj',

  // --- Logowanie ---
  login_title: 'Sprawdź status reklamacji',
  login_subtitle: 'Podaj numer reklamacji oraz kod dostępu, który otrzymałeś na potwierdzeniu przyjęcia.',
  login_field_case_number: 'Numer reklamacji',
  login_field_access_code: 'Kod dostępu',
  login_submit: 'Sprawdź status',
  login_token_verifying: 'Weryfikacja bezpiecznego linku…',
  login_reset_attempts: 'Zresetuj licznik prób (demo)',
  login_no_code_hint: 'Nie masz kodu dostępu? Skontaktuj się ze sklepem, w którym złożono reklamację.',
  login_demo_hint_prefix: 'To jest klikalny prototyp UX. Przykładowa aktywna sprawa do przetestowania: numer',
  login_demo_hint_code: 'kod',

  // --- Błędy logowania ---
  error_case_not_found: 'Nie znaleziono reklamacji o podanym numerze.',
  error_portal_disabled: 'Portal klienta nie jest włączony dla tej sprawy. Skontaktuj się ze sklepem.',
  error_invalid_code: 'Nieprawidłowy kod dostępu.',
  error_attempts_left: 'Pozostało prób: {n}.',
  error_token_invalid: 'Link jest nieprawidłowy lub wygasł.',
  error_token_used: 'Ten link został już wykorzystany. Zaloguj się kodem dostępu.',
  lockout_message: 'Zbyt wiele nieudanych prób logowania. Ze względów bezpieczeństwa dostęp został tymczasowo zablokowany. Skontaktuj się ze sklepem, aby otrzymać nowy kod dostępu.',
  toast_attempts_reset: 'Licznik prób logowania zresetowany.',

  // --- Status / stepper ---
  stage_zgloszona_label: 'Zgłoszona',
  stage_zgloszona_desc: 'Otrzymaliśmy Twoje zgłoszenie.',
  stage_przyjeta_label: 'Przyjęta do realizacji',
  stage_przyjeta_desc: 'Produkt został przyjęty i zweryfikowany.',
  stage_w_trakcie_label: 'W trakcie rozpatrywania',
  stage_w_trakcie_desc: 'Sprawa jest procesowana (u nas lub u producenta).',
  stage_decyzja_label: 'Decyzja podjęta',
  stage_decyzja_desc: 'Realizujemy podjętą decyzję.',
  stage_zakonczona_label: 'Zakończona',
  stage_zakonczona_desc: 'Sprawa jest zamknięta.',

  status_panel_title: 'Status Twojego zgłoszenia',
  status_progress_label: 'Postęp realizacji',
  status_details_title: 'Szczegóły zgłoszenia',
  status_field_product: 'Produkt',
  status_field_type: 'Rodzaj reklamacji',
  status_field_resolution: 'Oczekiwane rozwiązanie',
  status_field_decision: 'Decyzja',
  status_cancelled_title: 'Zgłoszenie anulowane',
  status_archived_title: 'Sprawa zarchiwizowana',
  status_special_contact_hint: 'W razie pytań skontaktuj się ze sklepem (zakładka „Kontakt”).',
  aria_stage_done: 'etap zakończony',
  aria_stage_current: 'etap bieżący',
  aria_stage_future: 'etap przyszły',

  // Szczegółowe opisy per status wewnętrzny (patrz public-status-mapper.js)
  status_detail_Nowa: 'Otrzymaliśmy Twoje zgłoszenie i wkrótce się nim zajmiemy.',
  status_detail_Przyjeta: 'Produkt został przyjęty w sklepie.',
  status_detail_Weryfikacja: 'Sprawdzamy zgłoszenie i kompletujemy dokumentację.',
  status_detail_WeryfikacjaWewnetrzna: 'Analizujemy zgłoszenie wewnętrznie.',
  status_detail_GotowaDoWysylki: 'Produkt jest przygotowywany do wysyłki do producenta.',
  status_detail_OczekiwanieNaKuriera: 'Czekamy na odbiór produktu przez kuriera.',
  status_detail_WyslanaDoProducenta: 'Produkt został wysłany do producenta.',
  status_detail_OczekiwanieNaDecyzjeProducenta: 'Oczekujemy na odpowiedź producenta.',
  status_detail_OczekiwanieNaDecyzjeKierownika: 'Trwa podejmowanie decyzji przez kierownika sklepu.',
  status_detail_RealizacjaDecyzji: 'Realizujemy podjętą decyzję.',
  status_detail_GotowaDoOdbioru: 'Produkt jest gotowy do odbioru.',
  status_detail_Zamknieta: 'Sprawa została zakończona.',
  status_detail_Anulowana: 'Zgłoszenie zostało anulowane.',
  status_detail_Zarchiwizowana: 'Sprawa została zarchiwizowana.',

  decision_Naprawa: 'Naprawa',
  decision_WymianaCzesci: 'Wymiana części',
  decision_WymianaProduktu: 'Wymiana produktu',
  decision_ZwrotSrodkow: 'Zwrot środków',
  decision_Odrzucenie: 'Odrzucenie',

  complaint_type_Warranty: 'Gwarancja',
  complaint_type_StatutoryWarranty: 'Rękojmia',

  // --- Historia ---
  history_empty_title: 'Brak zdarzeń do wyświetlenia',
  history_empty_desc: 'Historia pojawi się tutaj, gdy tylko coś się zmieni w Twojej sprawie.',
  history_group_today: 'Dzisiaj',
  history_group_yesterday: 'Wczoraj',
  history_action_CaseCreated: 'Zgłoszenie zostało przyjęte',
  history_action_StatusChanged: 'Status sprawy się zmienił',
  history_action_DecisionSet: 'Podjęto decyzję w sprawie',
  history_action_CaseClosed: 'Sprawa została zakończona',
  history_action_CaseCancelled: 'Zgłoszenie zostało anulowane',
  history_action_ReplacementProductIssued: 'Wydano produkt zastępczy',
  history_action_ReplacementProductReturned: 'Przyjęto zwrot produktu zastępczego',
  history_action_InfoRequested: 'Sklep prosi o dodatkowe informacje',

  // --- Dokumenty ---
  documents_title: 'Twoje dokumenty',
  documents_empty_title: 'Brak dokumentów',
  documents_empty_desc: 'Dokumenty pojawią się tutaj, gdy tylko sklep je udostępni.',
  documents_download: 'Pobierz',
  documents_preview: 'Podgląd',
  documents_preview_unavailable: 'Podgląd będzie dostępny po wdrożeniu backendu.',
  documents_download_mock: 'Pobieranie będzie dostępne po wdrożeniu backendu (plik mockowany w prototypie).',

  // --- Kontakt ---
  contact_owner_title: 'Opiekun Twojej sprawy',
  contact_owner_role: 'Pracownik działu reklamacji',
  contact_shop_title: 'Dane kontaktowe sklepu',
  contact_shop_phone_label: 'Telefon',
  contact_shop_email_label: 'E-mail',
  contact_shop_hours_label: 'Godziny obsługi',
  contact_shop_hours_value: 'pon–pt 9:00–17:00',
  contact_form_title: 'Napisz do nas',
  contact_field_name: 'Imię i nazwisko',
  contact_field_message: 'Wiadomość',
  contact_message_placeholder: 'Twoje pytanie dotyczące sprawy {caseNumber}…',
  contact_submit: 'Wyślij wiadomość',
  contact_success_title: 'Wiadomość została przekazana do opiekuna reklamacji.',
  contact_success_desc: 'Odpowiemy najszybciej jak to możliwe na adres podany przy zgłoszeniu.',
  contact_send_another: 'Wyślij kolejną wiadomość',
  toast_message_sent: 'Wiadomość wysłana.',

  // --- Kreator zgłoszenia (Wizard) ---
  wizard_intro_title: 'Zgłoszenie reklamacyjne',
  wizard_intro_p1: 'Dziękujemy za kontakt.',
  wizard_intro_p2: 'Za pomocą formularza mogą Państwo zgłosić reklamację produktu zakupionego w naszym sklepie.',
  wizard_intro_p3: 'Cały proces został zaprojektowany tak, aby maksymalnie uprościć zgłoszenie oraz umożliwić bieżące śledzenie reklamacji.',
  wizard_intro_time: 'Wypełnienie formularza zajmuje około 3–5 minut.',
  wizard_intro_start: 'Rozpocznij zgłoszenie',
  wizard_step_of: 'Krok {n} z {total}',

  wizard_step_method_title: 'Wybór sposobu zgłoszenia',
  wizard_step_method_desc: 'Wybierz, w jaki sposób chcą Państwo zgłosić reklamację.',
  wizard_method_shop_title: 'Zgłoszenie reklamacji za pośrednictwem sklepu',
  wizard_method_shop_desc: 'Przyjmiemy zgłoszenie, zweryfikujemy dokumenty i przekażemy reklamację do producenta.',
  wizard_method_shop_b1: 'sklep prowadzi zgłoszenie',
  wizard_method_shop_b2: 'kontaktujemy się z producentem',
  wizard_method_shop_b3: 'monitorujemy sprawę',
  wizard_method_shop_b4: 'wszystkie etapy dostępne w Portalu Klienta',
  wizard_method_shop_note: 'Produkt należy dostarczyć do sklepu lub przesłać kurierem.',
  wizard_method_direct_title: 'Zgłoszenie reklamacji bezpośrednio do producenta',
  wizard_method_direct_desc: 'Jeżeli producent umożliwia bezpośrednie zgłoszenia reklamacyjne, mogą Państwo skorzystać z tej możliwości.',
  wizard_method_direct_b1: 'proces może być krótszy średnio o 2–3 dni robocze',
  wizard_method_direct_b2: 'bezpośredni kontakt z producentem',
  wizard_method_direct_b3: 'szybsza komunikacja',
  wizard_method_direct_note: 'Otrzymasz dane kontaktowe producenta oraz instrukcję krok po kroku. Będziesz mógł/mogła zdecydować, czy sklep ma monitorować przebieg tego zgłoszenia.',
  wizard_method_direct_badge: 'Opcjonalnie monitorowana przez sklep',

  wizard_step_producer_title: 'Zgłoszenie bezpośrednio do producenta',
  wizard_step_producer_desc: 'Wybierz producenta, aby zobaczyć jego dane kontaktowe i instrukcję zgłoszenia.',
  wizard_producer_instructions_title: 'jak zgłosić reklamację',
  wizard_producer_step_method: 'Sposób zgłoszenia',
  wizard_producer_step_documents: 'Wymagane dokumenty',
  wizard_producer_step_photos: 'Wymagane zdjęcia',

  wizard_producer_prep_title: 'Przygotowanie produktu do wysyłki',
  wizard_producer_prep_intro: 'Przed zgłoszeniem reklamacji należy odpowiednio przygotować produkt.',
  wizard_producer_prep_b1: 'Produkt powinien zostać zapakowany w oryginalne opakowanie.',
  wizard_producer_prep_b2: 'Jeżeli oryginalne opakowanie nie jest dostępne, należy użyć opakowania zastępczego, które odpowiednio zabezpieczy produkt podczas transportu.',
  wizard_producer_prep_b3_intro: 'Produkt powinien być:',
  wizard_producer_prep_b3_1: 'czysty',
  wizard_producer_prep_b3_2: 'suchy',
  wizard_producer_prep_b3_3: 'przygotowany do oględzin serwisowych',
  wizard_producer_prep_warning: 'Producent może odmówić przyjęcia reklamacji lub rozpoczęcia procesu reklamacyjnego, jeżeli produkt zostanie dostarczony zabrudzony, mokry lub nieodpowiednio zabezpieczony do transportu.',
  wizard_producer_prep_ack: 'Zapoznałem(-am) się z zasadami przygotowania produktu do wysyłki i akceptuję powyższe warunki.',

  wizard_producer_want_instructions: 'Czy chcesz otrzymać instrukcję zgłoszenia reklamacji do producenta?',
  wizard_yes: 'Tak',
  wizard_no: 'Nie',
  wizard_producer_instructions_email_label: 'Adres e-mail, na który wyślemy instrukcję',
  wizard_producer_instructions_sent: 'Instrukcja zostanie wysłana na podany adres e-mail. Wyświetlamy ją też poniżej.',

  wizard_producer_inform_store: 'Chcę, aby sklep monitorował przebieg tego zgłoszenia.',
  wizard_producer_monitored_note: 'Sklep będzie monitorował przebieg reklamacji i w razie potrzeby udzieli Ci pomocy. Po wysłaniu formularza otrzymasz e-mail z potwierdzeniem monitoringu oraz dostęp do Portalu Klienta.',
  wizard_producer_finish: 'Zakończ',
  wizard_producer_only_title: 'Powodzenia ze zgłoszeniem!',
  wizard_producer_only_desc: 'Skorzystaj z podanych danych kontaktowych producenta, aby zgłosić reklamację. Ponieważ nie poprosiłeś/aś o monitoring, nie utworzyliśmy sprawy w naszym systemie — jeśli zmienisz zdanie, możesz wrócić i zaznaczyć tę opcję.',

  wizard_step_info_title: 'Ważne informacje',
  wizard_step_info_desc: 'Prosimy o zapoznanie się z poniższymi informacjami przed przekazaniem produktu.',
  wizard_info_packaging_title: 'Opakowanie',
  wizard_info_packaging_p1: 'Prosimy zachować oryginalne opakowanie produktu — jest ono wymagane do przyjęcia reklamacji.',
  wizard_info_packaging_p2: 'Jeżeli nie jest dostępne, należy przygotować opakowanie zastępcze zapewniające bezpieczny transport.',
  wizard_info_packaging_p3: 'Producent może wymagać odpowiedniego zabezpieczenia produktu przed odbiorem.',
  wizard_info_condition_title: 'Stan produktu',
  wizard_info_condition_p1: 'Produkt przekazywany do reklamacji musi być czysty, suchy i przygotowany do oględzin — w przeciwnym razie reklamacja nie zostanie przyjęta.',
  wizard_info_condition_p2: 'Nie przyjmujemy produktów zabrudzonych, mokrych, zapleśniałych ani posiadających nieprzyjemny zapach.',
  wizard_info_condition_p3: 'Jeżeli nie mają Państwo możliwości przygotowania produktu lub opakowania, sklep może wykonać usługę przygotowania.',
  wizard_info_condition_fee: 'Koszt przygotowania produktu i/lub opakowania: 80,00 zł brutto',
  wizard_info_condition_p4: 'Opłata naliczana jest wyłącznie po wcześniejszej akceptacji Klienta.',
  wizard_info_condition_p5: 'Prosimy również o usunięcie wszystkich rzeczy osobistych z produktu.',
  wizard_info_acknowledge: 'Zapoznałem się z powyższymi informacjami',

  wizard_step_customer_title: 'Dane klienta',
  wizard_step_customer_desc: 'Podaj dane kontaktowe, na które będziemy się z Tobą kontaktować w sprawie zgłoszenia.',
  wizard_field_first_name: 'Imię',
  wizard_field_last_name: 'Nazwisko',
  wizard_field_phone: 'Telefon',
  wizard_field_email: 'E-mail',

  wizard_step_address_title: 'Adres',
  wizard_step_address_desc: 'Adres odbioru oraz ponownej wysyłki produktu.',
  wizard_field_street: 'Ulica',
  wizard_field_street_number: 'Numer',
  wizard_field_postal_code: 'Kod pocztowy',
  wizard_field_city: 'Miejscowość',
  wizard_field_country: 'Kraj',
  wizard_courier_label: 'Chcę skorzystać z odbioru produktu przez kuriera oraz ponownej wysyłki.',
  wizard_courier_price: 'Koszt: 20 zł brutto w jedną stronę (odbiór lub ponowna wysyłka osobno).',
  wizard_courier_alt_note: 'Jeśli nie skorzystasz z tej opcji, dostarcz produkt osobiście do sklepu lub wyślij go na adres sklepu we własnym zakresie.',

  wizard_step_purchase_title: 'Informacje o zakupie',
  wizard_step_purchase_desc: 'Podaj numer zamówienia — spróbujemy automatycznie uzupełnić dane produktu.',
  wizard_field_order_number: 'Numer zamówienia',
  wizard_order_lookup_found: 'Znaleziono zamówienie — dane produktu uzupełnione automatycznie.',
  wizard_order_lookup_not_found: 'Nie znaleziono zamówienia o takim numerze. Uzupełnij dane produktu ręcznie poniżej.',
  wizard_order_change_manually: 'Wprowadź dane ręcznie',
  wizard_field_product_name: 'Nazwa produktu',
  wizard_field_manufacturer: 'Producent',
  wizard_field_purchase_date: 'Data zakupu',
  wizard_field_serial_number: 'Numer seryjny (jeżeli istnieje)',
  wizard_field_invoice_number: 'Numer paragonu lub faktury',
  wizard_invoice_b2b_note: 'W przypadku zakupu produktu na fakturę dla przedsiębiorcy okres gwarancji producenta wynosi 1 rok (12 miesięcy), o ile producent nie określa innych warunków gwarancji.',

  wizard_step_description_title: 'Opis usterki',
  wizard_step_description_desc: 'Opisz możliwie dokładnie, na czym polega usterka.',
  wizard_field_description_placeholder: 'Opisz, co się dzieje z produktem, kiedy zauważono usterkę, w jakich okolicznościach występuje…',

  wizard_step_attachments_title: 'Załączniki',
  wizard_step_attachments_desc: 'Zdjęcia znacznie przyspieszają rozpatrzenie zgłoszenia.',
  wizard_dz_general_photo: 'Zdjęcie ogólne produktu',
  wizard_dz_damage_photos: 'Zdjęcia uszkodzenia (minimum 2)',
  wizard_dz_video: 'Film (do 10 sekund) — opcjonalnie',
  wizard_dz_extra_photos: 'Dodatkowe zdjęcia — opcjonalnie',
  wizard_dz_extra_documents: 'Dodatkowe dokumenty — opcjonalnie',
  wizard_dz_purchase_proof: 'Dowód zakupu (PDF, zdjęcie lub skan)',
  wizard_dz_drop_hint: 'Przeciągnij pliki tutaj lub kliknij, aby wybrać',
  wizard_dz_compressing: 'Kompresowanie…',
  wizard_dz_compressed: 'skompresowano',

  wizard_step_summary_title: 'Podsumowanie i zgody',
  wizard_step_summary_desc: 'Sprawdź poprawność danych przed wysłaniem zgłoszenia.',
  wizard_summary_notice_title: 'Informacja dla Klienta',
  wizard_summary_notice_text: 'Wypełnienie i przesłanie formularza oznacza zgłoszenie reklamacyjne do sklepu. Po weryfikacji kompletności dokumentów zgłoszenie zostanie przekazane do producenta lub gwaranta. Przyjęcie zgłoszenia przez sklep nie oznacza uznania reklamacji. Ostateczna decyzja dotycząca naprawy, wymiany, dostarczenia nowych elementów lub odmowy uznania reklamacji należy do producenta lub gwaranta zgodnie z warunkami gwarancji oraz obowiązującymi przepisami. O wszystkich etapach będą Państwo informowani w Portalu Klienta oraz wiadomościach e-mail.',
  wizard_consent_rules: 'Zapoznałem się z zasadami procesu reklamacyjnego.',
  wizard_consent_fee: 'Potwierdzam, że produkt i opakowanie zostały przygotowane do reklamacji, lub akceptuję możliwość naliczenia opłaty 80 zł za ich przygotowanie.',
  wizard_consent_gdpr: 'Wyrażam zgodę na przetwarzanie danych osobowych.',
  wizard_submit: 'Wyślij zgłoszenie',

  wizard_nav_back: 'Wstecz',
  wizard_nav_next: 'Dalej',
  wizard_autosave_hint: 'Postęp zapisywany automatycznie',
  wizard_completion: 'Kompletność: {pct}%',
  wizard_missing_prefix: 'Brakuje:',
  wizard_complete_message: 'Formularz kompletny.',

  wizard_success_title: 'Zgłoszenie zostało przyjęte',
  wizard_success_rma_label: 'Numer Twojego zgłoszenia',
  wizard_success_code_label: 'Kod dostępu do Portalu Klienta',
  wizard_success_email_note: 'Potwierdzenie zostało wysłane na adres e-mail podany w formularzu.',
  wizard_success_go_to_portal: 'Przejdź do statusu zgłoszenia',
  wizard_success_new_case: 'Zgłoś kolejną reklamację',

  wizard_error_required: 'To pole jest wymagane.',
  wizard_error_email: 'Podaj prawidłowy adres e-mail.',
  wizard_error_phone: 'Podaj prawidłowy numer telefonu.',
  wizard_error_min_damage_photos: 'Dodaj co najmniej 2 zdjęcia uszkodzenia.',
  wizard_error_consents: 'Zaznacz wszystkie wymagane zgody, aby wysłać formularz.',

  wizard_entry_link: 'Nie masz jeszcze zgłoszenia? Zgłoś nową reklamację',
};

// t(key, vars?) - pobiera tekst po kluczu, z prostym podstawianiem
// {placeholder} (bez pluralizacji/formatowania - to już byłby realny i18n,
// poza zakresem tego etapu). Brak klucza -> zwraca sam klucz (widoczne w
// UI jako sygnał brakującego tłumaczenia, nie pusty tekst).
function t(key, vars) {
  let text = CLIENT_LABELS[key] ?? key;
  if (vars) {
    Object.keys(vars).forEach((k) => {
      text = text.replace(`{${k}}`, vars[k]);
    });
  }
  return text;
}

// Statyczny tekst w HTML (nagłówki, etykiety pól, przyciski) też przechodzi
// przez ten sam słownik - atrybut data-i18n zamiast tekstu wpisanego wprost
// w znacznik. Bez tego i18n-readiness obejmowałoby tylko komunikaty
// generowane przez JS, a nie strukturalny tekst stron logowania/portalu.
function applyStaticLabels(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
  });
}

document.addEventListener('DOMContentLoaded', () => applyStaticLabels());
