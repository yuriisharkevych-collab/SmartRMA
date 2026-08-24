import { validatePasswordPolicy } from './password-policy.util';

const LENIENT_POLICY = {
  passwordMinLength: 8,
  passwordRequireUppercase: false,
  passwordRequireNumber: false,
  passwordRequireSymbol: false,
};

describe('validatePasswordPolicy', () => {
  it('accepts a password meeting all requirements', () => {
    expect(
      validatePasswordPolicy('Abcdef1!', {
        passwordMinLength: 8,
        passwordRequireUppercase: true,
        passwordRequireNumber: true,
        passwordRequireSymbol: true,
      }),
    ).toEqual([]);
  });

  it('flags a too-short password', () => {
    expect(validatePasswordPolicy('Ab1', { ...LENIENT_POLICY, passwordMinLength: 8 })).toHaveLength(
      1,
    );
  });

  it('flags a missing uppercase letter', () => {
    const violations = validatePasswordPolicy('abcdefgh', {
      ...LENIENT_POLICY,
      passwordRequireUppercase: true,
    });
    expect(violations).toHaveLength(1);
  });

  it('flags a missing digit', () => {
    const violations = validatePasswordPolicy('Abcdefgh', {
      ...LENIENT_POLICY,
      passwordRequireNumber: true,
    });
    expect(violations).toHaveLength(1);
  });

  it('flags a missing symbol', () => {
    const violations = validatePasswordPolicy('Abcdefg1', {
      ...LENIENT_POLICY,
      passwordRequireSymbol: true,
    });
    expect(violations).toHaveLength(1);
  });

  it('accepts Polish diacritics as letters, not symbols', () => {
    expect(validatePasswordPolicy('Żółwik1', { ...LENIENT_POLICY, passwordMinLength: 7 })).toEqual(
      [],
    );
  });

  it('reports every violation at once, not just the first', () => {
    const violations = validatePasswordPolicy('ab', {
      passwordMinLength: 8,
      passwordRequireUppercase: true,
      passwordRequireNumber: true,
      passwordRequireSymbol: true,
    });
    expect(violations).toHaveLength(4);
  });
});
