/**
 * Globalny, statyczny limit rozmiaru załącznika sprawy (zdjęcia/wideo/PDF, pracownik
 * i Portal Klienta). Poprawka bezpieczeństwa — audyt gotowości SmartRMA 1.0 wykazał
 * brak JAKIEGOKOLWIEK limitu na `FileInterceptor`, przez co dowolnie duży plik trafiał
 * w całości do pamięci procesu przed zapisem (DoS przez wyczerpanie RAM), w
 * przeciwieństwie do uploadu logo firmy, które limit miało od początku.
 *
 * 50 MB — wystarcza na typowe wideo z telefonu (kilkanaście-kilkadziesiąt sekund w
 * rozsądnej jakości) bez wymuszania kompresji po stronie klienta. Statyczny (nie per
 * `Manufacturer.maxAttachmentSizeMb`) celowo — `FileInterceptor` ustawia limit w
 * momencie deklaracji endpointu, zanim zna się kontekst sprawy/producenta; ograniczenie
 * SPECYFICZNE dla producenta pozostaje osobną, biznesową walidacją (FILE-002) do
 * ewentualnego domknięcia później, nie zastępuje tego globalnego bezpiecznika.
 */
export const DOCUMENT_MAX_SIZE_BYTES = 50 * 1024 * 1024;
