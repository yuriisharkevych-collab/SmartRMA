import { isValidPolishNip, normalizeNip } from './nip.validator';

/**
 * `5260001246` — powszechnie używany, prawdziwy (poprawny algorytmicznie)
 * testowy NIP; suma kontrolna zweryfikowana ręcznie: wagi [6,5,7,2,3,4,5,6,7]
 * × [5,2,6,0,0,0,1,2,4] = 127, `127 mod 11 = 6` = ostatnia cyfra.
 */
const VALID_NIP = '5260001246';

describe('isValidPolishNip', () => {
  it('akceptuje prawidłowy NIP (same cyfry)', () => {
    expect(isValidPolishNip(VALID_NIP)).toBe(true);
  });

  it('akceptuje prawidłowy NIP z myślnikami', () => {
    expect(isValidPolishNip('526-000-12-46')).toBe(true);
  });

  it('akceptuje prawidłowy NIP ze spacjami', () => {
    expect(isValidPolishNip('526 000 12 46')).toBe(true);
  });

  it('akceptuje prawidłowy NIP z mieszanymi separatorami (spacje i myślniki)', () => {
    expect(isValidPolishNip('526-000 12-46')).toBe(true);
  });

  it('odrzuca za krótki ciąg (9 cyfr)', () => {
    expect(isValidPolishNip('526000124')).toBe(false);
  });

  it('odrzuca za długi ciąg (11 cyfr)', () => {
    expect(isValidPolishNip('52600012467')).toBe(false);
  });

  it('odrzuca litery w środku numeru', () => {
    expect(isValidPolishNip('526000124A')).toBe(false);
  });

  it('odrzuca ciąg złożony wyłącznie z liter', () => {
    expect(isValidPolishNip('ABCDEFGHIJ')).toBe(false);
  });

  it('odrzuca prawidłową długość z błędną sumą kontrolną (ostatnia cyfra zmieniona)', () => {
    expect(isValidPolishNip('5260001247')).toBe(false);
  });

  it('odrzuca przypadek graniczny: suma kontrolna wychodzi na 10 (nie może być cyfrą)', () => {
    // 1,2,3,4,5,6,7,8,9 × wagi [6,5,7,2,3,4,5,6,7] = 230, 230 mod 11 = 10 —
    // z definicji nieprawidłowe, niezależnie od dziesiątej cyfry.
    expect(isValidPolishNip('1234567890')).toBe(false);
  });

  it('odrzuca ciąg z innym niedozwolonym znakiem niż spacja/myślnik (kropki)', () => {
    expect(isValidPolishNip('526.000.12.46')).toBe(false);
  });

  it('puste pole jest dozwolone (NIP jest opcjonalny)', () => {
    expect(isValidPolishNip('')).toBe(true);
  });

  it('brak wartości (undefined) jest dozwolony (NIP jest opcjonalny)', () => {
    expect(isValidPolishNip(undefined)).toBe(true);
  });

  it('null jest dozwolony (NIP jest opcjonalny)', () => {
    expect(isValidPolishNip(null)).toBe(true);
  });

  it('odrzuca wartość niebędącą stringiem (np. liczbę)', () => {
    expect(isValidPolishNip(5260001246)).toBe(false);
  });
});

describe('normalizeNip', () => {
  it('usuwa spacje i myślniki, zostawia same cyfry', () => {
    expect(normalizeNip('526-000 12-46')).toBe('5260001246');
  });

  it('nie usuwa liter ani innych znaków — tylko separatory spacja/myślnik', () => {
    expect(normalizeNip('526A00-12 46')).toBe('526A001246');
  });

  it('zwraca niezmieniony ciąg, gdy nie ma separatorów', () => {
    expect(normalizeNip(VALID_NIP)).toBe(VALID_NIP);
  });
});
