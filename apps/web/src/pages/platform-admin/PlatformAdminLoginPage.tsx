import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isPlatformAdminApiError } from '@/api/platformAdminClient';
import { platformAdminApi } from '@/api/platform-admin.api';
import { setPlatformAdminSession } from '@/api/platform-admin-token-storage';
import { EyeIcon, EyeOffIcon } from '@/components/common/icons';

/**
 * `/platform-admin/login` — logowanie administratora PLATFORMY, celowo POZA
 * `AuthLayout`/`ProtectedRoute` (pracownicy) i POZA `PortalLayout` (klienci):
 * `PlatformAdmin` to trzeci, całkowicie rozłączny mechanizm uwierzytelniania
 * (`POST /platform-auth/login`, osobny sekret JWT, zero relacji do
 * `Company`/`User` — patrz `PlatformAdmin` w schema.prisma). Zwykły ekran
 * `/login` NIGDY nie zaloguje tego konta — sprawdza tabelę `User`.
 */
export function PlatformAdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const tokens = await platformAdminApi.login(email.trim(), password);
      setPlatformAdminSession(tokens);
      navigate('/platform-admin', { replace: true });
    } catch (err) {
      setError(
        isPlatformAdminApiError(err)
          ? (err.response?.data.error.message ?? 'Błąd logowania.')
          : 'Błąd logowania.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="sidebar-brand-mark">R</div>
          <div className="sidebar-brand-text" style={{ fontSize: 16 }}>
            Smart<span>RMA</span>
          </div>
        </div>

        <h1 className="login-title">Administrator platformy</h1>
        <p className="login-subtitle">
          Osobne logowanie, niezależne od kont pracowników poszczególnych firm.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <p className="field-error" style={{ display: 'block' }}>
              {error}
            </p>
          )}
          <div className="field">
            <label htmlFor="pa-email">Adres e-mail</label>
            <input
              id="pa-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label htmlFor="pa-password">Hasło</label>
            <div className="password-field">
              <input
                id="pa-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOffIcon width={17} height={17} />
                ) : (
                  <EyeIcon width={17} height={17} />
                )}
              </button>
            </div>
          </div>
          <button
            type="submit"
            className="btn btn-primary w-full"
            style={{ justifyContent: 'center', padding: 11 }}
            disabled={submitting}
          >
            {submitting ? 'Logowanie…' : 'Zaloguj się'}
          </button>
        </form>
      </div>
    </div>
  );
}
