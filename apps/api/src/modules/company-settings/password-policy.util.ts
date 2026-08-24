export interface PasswordPolicy {
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
}

/**
 * Czysta funkcja (bez DB/HTTP) — łatwa do przetestowania w izolacji.
 * Zwraca listę naruszeń zamiast rzucać wyjątek, żeby wołający (UsersService)
 * mógł je złożyć w jedną wiadomość AUTH-004, zamiast pokazywać użytkownikowi
 * tylko pierwszy napotkany błąd.
 */
export function validatePasswordPolicy(password: string, policy: PasswordPolicy): string[] {
  const violations: string[] = [];

  if (password.length < policy.passwordMinLength) {
    violations.push(`co najmniej ${policy.passwordMinLength} znaków`);
  }
  if (policy.passwordRequireUppercase && !/[A-ZĄĆĘŁŃÓŚŹŻ]/.test(password)) {
    violations.push('co najmniej jedną wielką literę');
  }
  if (policy.passwordRequireNumber && !/[0-9]/.test(password)) {
    violations.push('co najmniej jedną cyfrę');
  }
  if (policy.passwordRequireSymbol && !/[^A-Za-z0-9ĄĆĘŁŃÓŚŹŻąćęłńóśźż]/.test(password)) {
    violations.push('co najmniej jeden znak specjalny');
  }

  return violations;
}
