import { formatCaseNumber } from './case-numbering.util';

describe('formatCaseNumber', () => {
  it('formats with year and zero-padded sequence when reset yearly is on (matches legacy hardcoded format)', () => {
    expect(
      formatCaseNumber(
        { caseNumberPrefix: 'RMA', caseNumberPadding: 5, caseNumberResetYearly: true },
        2026,
        7,
      ),
    ).toBe('RMA/2026/00007');
  });

  it('omits the year when reset yearly is off', () => {
    expect(
      formatCaseNumber(
        { caseNumberPrefix: 'RMA', caseNumberPadding: 5, caseNumberResetYearly: false },
        2026,
        7,
      ),
    ).toBe('RMA/00007');
  });

  it('respects a custom prefix and padding width', () => {
    expect(
      formatCaseNumber(
        { caseNumberPrefix: 'REK', caseNumberPadding: 3, caseNumberResetYearly: true },
        2026,
        42,
      ),
    ).toBe('REK/2026/042');
  });

  it('does not truncate a sequence wider than the configured padding', () => {
    expect(
      formatCaseNumber(
        { caseNumberPrefix: 'RMA', caseNumberPadding: 3, caseNumberResetYearly: true },
        2026,
        123456,
      ),
    ).toBe('RMA/2026/123456');
  });
});
