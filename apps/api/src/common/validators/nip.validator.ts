import { ValidationOptions, registerDecorator } from 'class-validator';

/** Wagi sumy kontrolnej NIP (ustawowe, GUS) — `suma = Σ cyfra[i] * WEIGHTS[i]` dla 9 pierwszych cyfr, cyfra kontrolna = `suma mod 11`. */
const NIP_CHECKSUM_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

/**
 * Usuwa WYŁĄCZNIE spacje i myślniki (dozwolone separatory, np. „123-456-78-90”
 * albo „123 456 78 90”) — celowo NIE każdy nie-cyfrowy znak: gdyby usuwać też
 * litery, „12A345678B” stałoby się poprawnym „12345678” zamiast zostać
 * odrzucone. Reszta (litery, kropki, cokolwiek innego) zostaje w stringu i
 * naturalnie nie przejdzie testu `/^\d{10}$/` w `isValidPolishNip` niżej.
 */
export function normalizeNip(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

/**
 * Waliduje polski NIP: dokładnie 10 cyfr PO normalizacji (separatory
 * spacja/myślnik dozwolone, każdy inny znak — w tym litery — odrzucony) +
 * prawidłowa suma kontrolna. Pusty/`null`/`undefined` przechodzi jako
 * WAŻNY — pole `Company.nip` jest opcjonalne (`@IsOptional()` w
 * `UpdateCompanyDto` odpowiada za to, czy pole w ogóle musi być podane; ten
 * walidator odpowiada wyłącznie za to, czy PODANA wartość ma sensowny
 * kształt). Eksportowana jako czysta funkcja (nie tylko dekorator) — łatwo
 * testowalna w izolacji i reużywalna poza `class-validator` (np. gdyby
 * kiedyś była potrzebna w innym miejscu niż DTO).
 */
export function isValidPolishNip(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value !== 'string') return false;

  const normalized = normalizeNip(value);
  if (!/^\d{10}$/.test(normalized)) return false;

  const digits = normalized.split('').map(Number);
  const sum = NIP_CHECKSUM_WEIGHTS.reduce((acc, weight, i) => acc + weight * digits[i], 0);
  const checkDigit = sum % 11;
  // `checkDigit === 10` nie może być prawidłową cyfrą kontrolną (jedna cyfra,
  // 0-9) — NIP z takim wynikiem sumy jest z definicji nieprawidłowy, nie
  // "brzegowym przypadkiem 10".
  if (checkDigit === 10) return false;

  return checkDigit === digits[9];
}

/**
 * Dekorator `class-validator` — wzorzec identyczny jak wbudowane
 * `@IsEmail`/`@IsUrl` używane gdzie indziej w tym repo: wołający przekazuje
 * `{ message: 'VALIDATION-006' }` (kod z `ERROR_CODES.md`, nie gotowy
 * tekst — patrz `to-validation-exception.ts`, który podmienia kod na
 * prawdziwą treść PL). Sama logika w `isValidPolishNip` wyżej.
 */
export function IsPolishNip(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPolishNip',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return isValidPolishNip(value);
        },
        defaultMessage(): string {
          return 'VALIDATION-006';
        },
      },
    });
  };
}
