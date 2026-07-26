import { HttpStatus } from '@nestjs/common';

/**
 * Transkrypcja katalogu `docs/architecture/ERROR_CODES.md` — jedno źródło
 * prawdy dla kodu, statusu HTTP i domyślnej treści PL. Serwisy rzucają:
 *
 *   throw new AppException(ERROR_CODES.CASE_004.code, ERROR_CODES.CASE_004.message, ERROR_CODES.CASE_004.status, { field: 'serialNumber' });
 *
 * Zmiana treści/statusu = zmiana w jednym miejscu. Dodanie nowego kodu tutaj
 * wymaga najpierw dopisania go do ERROR_CODES.md (ten plik jest pochodną,
 * nie odwrotnie — patrz "Zasady rozszerzania tego katalogu" w tamtym pliku).
 */
export const ERROR_CODES = {
  // --- CASE ---
  CASE_001: { code: 'CASE-001', status: HttpStatus.CONFLICT, message: 'Nieprawidłowe przejście statusu.' },
  CASE_002: { code: 'CASE-002', status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'Brak wymaganych dokumentów.' },
  CASE_003: { code: 'CASE-003', status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'Wybrana marka nie jest obsługiwana przez wskazanego producenta.' },
  CASE_004: { code: 'CASE-004', status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'Numer seryjny jest wymagany dla wybranego producenta.' },
  CASE_005: { code: 'CASE-005', status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'Numer ramy jest wymagany dla wybranego producenta.' },
  CASE_006: { code: 'CASE-006', status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'Dowód zakupu jest wymagany dla wybranego producenta.' },
  CASE_007: { code: 'CASE-007', status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'Zgłoszenie bezpośrednio do producenta jest dostępne wyłącznie dla reklamacji gwarancyjnych.' },
  CASE_008: { code: 'CASE-008', status: HttpStatus.CONFLICT, message: 'Sprawa jest zamknięta/anulowana/zarchiwizowana i nie może być zmieniana.' },
  CASE_009: { code: 'CASE-009', status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'Nie można zrealizować decyzji — decyzja nie została jeszcze ustawiona.' },
  CASE_010: { code: 'CASE-010', status: HttpStatus.FORBIDDEN, message: 'Ta decyzja wymaga zatwierdzenia przez Kierownika lub Administratora.' },
  CASE_011: { code: 'CASE-011', status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'Podanie powodu jest wymagane przy anulowaniu sprawy.' },
  CASE_012: { code: 'CASE-012', status: HttpStatus.NOT_FOUND, message: 'Nie znaleziono sprawy o podanym identyfikatorze/numerze.' },
  CASE_013: { code: 'CASE-013', status: HttpStatus.CONFLICT, message: 'Numer sprawy już istnieje.' },

  // --- AUTH ---
  AUTH_001: { code: 'AUTH-001', status: HttpStatus.UNAUTHORIZED, message: 'Nieprawidłowy adres e-mail lub hasło.' },
  AUTH_002: { code: 'AUTH-002', status: HttpStatus.FORBIDDEN, message: 'Konto jest nieaktywne.' },
  AUTH_003: { code: 'AUTH-003', status: HttpStatus.UNAUTHORIZED, message: 'Sesja wygasła — zaloguj się ponownie.' },
  AUTH_004: { code: 'AUTH-004', status: HttpStatus.BAD_REQUEST, message: 'Hasło nie spełnia wymagań bezpieczeństwa.' },

  // --- RBAC ---
  RBAC_001: { code: 'RBAC-001', status: HttpStatus.FORBIDDEN, message: 'Brak wymaganego uprawnienia do wykonania tej akcji.' },
  RBAC_002: { code: 'RBAC-002', status: HttpStatus.NOT_FOUND, message: 'Rola nie istnieje.' },
  RBAC_003: { code: 'RBAC-003', status: HttpStatus.FORBIDDEN, message: 'Nie można modyfikować ani usuwać roli systemowej.' },
  RBAC_004: { code: 'RBAC-004', status: HttpStatus.CONFLICT, message: 'Nie można odebrać użytkownikowi ostatniej roli.' },

  // --- FILE ---
  FILE_001: { code: 'FILE-001', status: HttpStatus.PAYLOAD_TOO_LARGE, message: 'Załącznik przekracza dopuszczalny rozmiar.' },
  FILE_002: { code: 'FILE-002', status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'Przekroczono maksymalną liczbę zdjęć.' },
  FILE_003: { code: 'FILE-003', status: HttpStatus.UNSUPPORTED_MEDIA_TYPE, message: 'Nieobsługiwany format pliku.' },
  FILE_004: { code: 'FILE-004', status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'Wymagane minimum 2 zdjęcia uszkodzenia.' },

  // --- SLA (informacyjne / zdarzenia, nie zawsze blokujące) ---
  SLA_002: { code: 'SLA-002', status: HttpStatus.OK, message: 'Ten producent nie ma skonfigurowanego SLA.' },

  // --- PORTAL ---
  PORTAL_001: { code: 'PORTAL-001', status: HttpStatus.UNAUTHORIZED, message: 'Nieprawidłowy numer reklamacji lub kod dostępu.' },
  PORTAL_002: { code: 'PORTAL-002', status: HttpStatus.FORBIDDEN, message: 'Portal klienta nie jest włączony dla tej sprawy.' },
  PORTAL_003: { code: 'PORTAL-003', status: HttpStatus.TOO_MANY_REQUESTS, message: 'Zbyt wiele nieudanych prób logowania. Spróbuj ponownie później lub skontaktuj się ze sklepem.' },
  PORTAL_004: { code: 'PORTAL-004', status: HttpStatus.UNAUTHORIZED, message: 'Link jest nieprawidłowy lub wygasł.' },
  PORTAL_005: { code: 'PORTAL-005', status: HttpStatus.UNAUTHORIZED, message: 'Ten link został już wykorzystany.' },
  // Zadanie 9 — dodany, żeby PortalAccessGuard nie pożyczał AUTH-003 (ERROR_CODES.md opisuje moduł
  // AUTH jako "uwierzytelnianie (pracownicy)" — sesja Portalu to inny mechanizm, RBAC.md §1.2).
  PORTAL_006: { code: 'PORTAL-006', status: HttpStatus.UNAUTHORIZED, message: 'Sesja Portalu wygasła lub jest nieprawidłowa — zaloguj się ponownie.' },

  // --- USER ---
  USER_001: { code: 'USER-001', status: HttpStatus.CONFLICT, message: 'Ten adres e-mail jest już zajęty.' },
  USER_002: { code: 'USER-002', status: HttpStatus.NOT_FOUND, message: 'Nie znaleziono użytkownika.' },
  USER_003: { code: 'USER-003', status: HttpStatus.OK, message: 'Użytkownik jest właścicielem otwartych spraw.' },

  // --- CONTRACTOR / MANUFACTURER ---
  CONTRACTOR_001: { code: 'CONTRACTOR-001', status: HttpStatus.CONFLICT, message: 'Kontrahent o podanym NIP już istnieje w tej firmie.' },
  MANUFACTURER_001: { code: 'MANUFACTURER-001', status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'Ten kontrahent nie ma profilu producenta.' },
  MANUFACTURER_002: { code: 'MANUFACTURER-002', status: HttpStatus.CONFLICT, message: 'Ten kontrahent ma już profil producenta.' },

  // --- ORDER ---
  ORDER_002: { code: 'ORDER-002', status: HttpStatus.CONFLICT, message: 'Numer zamówienia już istnieje w tej firmie.' },

  // --- VALIDATION (ogólne — zwykle generowane przez ValidationPipe, nie ręcznie) ---
  VALIDATION_001: { code: 'VALIDATION-001', status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'To pole jest wymagane.' },
  VALIDATION_002: { code: 'VALIDATION-002', status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'Nieprawidłowy format adresu e-mail.' },
  VALIDATION_003: { code: 'VALIDATION-003', status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'Nieprawidłowy numer telefonu.' },
  VALIDATION_004: { code: 'VALIDATION-004', status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'Wymagane zaznaczenie wszystkich zgód.' },

  // --- NOTIFICATION ---
  NOTIFICATION_001: { code: 'NOTIFICATION-001', status: HttpStatus.BAD_GATEWAY, message: 'Nie udało się wysłać powiadomienia.' },
  NOTIFICATION_002: { code: 'NOTIFICATION-002', status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Brak szablonu powiadomienia dla tego zdarzenia.' },
} as const;

const ERROR_CODES_BY_CODE = new Map(Object.values(ERROR_CODES).map((entry) => [entry.code, entry]));

/**
 * Zadanie 1 (Auth) — most między `class-validator` a `ERROR_CODES.md`:
 * DTO adnotuje regułę walidacji komunikatem będącym KODEM (np.
 * `@IsEmail({}, { message: 'VALIDATION-002' })`), a
 * `ValidationPipe.exceptionFactory` (main.ts) woła tę funkcję, żeby
 * podmienić kod na jego prawdziwą treść z katalogu — jedno źródło prawdy
 * dla treści komunikatu, DTO nigdy nie duplikuje tekstu ręcznie.
 */
export function findErrorByCode(code: string): { code: string; status: HttpStatus; message: string } | undefined {
  return ERROR_CODES_BY_CODE.get(code);
}

/**
 * TODO(TENANT-001): `ERROR_CODES.md` (patrz raport gotowości, Zadanie 7)
 * nie ma jeszcze kodu dla naruszenia izolacji dzierżawy (użytkownik firmy A
 * odwołuje się do zasobu firmy B). Dopisać do ERROR_CODES.md przed
 * implementacją guardów wielooddziałowości, potem tutaj.
 *
 * TODO(CASE-014): brak kodu dla warunku `Logistics(type=ShipToManufacturer)
 * .status=Delivered` wymaganego przy przejściu `OczekiwanieNaKuriera →
 * WyslanaDoProducenta` (STATE_MACHINE.md ma go w tabeli prozy, nie w kodzie
 * błędów) — patrz raport gotowości, Zadanie 7, finding Medium/State Machine.
 */
