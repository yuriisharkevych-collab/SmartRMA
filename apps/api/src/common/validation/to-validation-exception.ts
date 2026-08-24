import { ValidationError } from 'class-validator';
import { AppException } from '../exceptions/app.exception';
import { findErrorByCode } from '../exceptions/error-codes.const';

/**
 * Zadanie 1 (Auth) — domyka rozjazd między `ValidationPipe` (domyślnie
 * rzuca `BadRequestException`, 400, generyczny tekst class-validator) a
 * `ERROR_CODES.md` (VALIDATION-00x, zawsze 422, treść z katalogu). DTO
 * adnotuje regułę komunikatem-kodem (patrz `LoginDto`) — tu ten kod jest
 * odnajdywany i podmieniany na prawdziwą treść. Reguła bez adnotacji koduje
 * się jako VALIDATION-001 (ogólne "to pole jest wymagane") — bezpieczny,
 * zgodny z katalogiem domyślny wynik, nie błąd.
 *
 * Wyodrębnione z `main.ts` (Faza 7 stabilizacji) — testy e2e budują WŁASNĄ
 * instancję `ValidationPipe` (osobny proces Nest per plik), więc bez importu
 * TEJ SAMEJ fabryki błędów każdy test walidacji dostawał 400 zamiast
 * rzeczywistego zachowania produkcyjnego (422 + kod VALIDATION-00x).
 */
export function toValidationException(errors: ValidationError[]): AppException {
  const first = errors[0];
  const rawMessage = first ? Object.values(first.constraints ?? {})[0] : undefined;
  const known = rawMessage ? findErrorByCode(rawMessage) : undefined;
  const fallback = findErrorByCode('VALIDATION-001')!;
  const resolved = known ?? fallback;
  return new AppException(resolved.code, resolved.message, resolved.status, {
    field: first?.property,
  });
}
