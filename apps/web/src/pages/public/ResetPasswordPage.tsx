import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { isPublicApiError } from '@/api/publicClient';
import { authApi } from '@/api/auth.api';
import { EyeIcon, EyeOffIcon } from '@/components/common/icons';

/**
 * `/reset-password?token=...` — Fundament „Fresh Install". Ustawienie nowego
 * hasła (`AccountRecoveryService.resetPassword`) unieważnia bieżącą sesję po
 * stronie backendu — świadomie NIE loguje automatycznie tutaj (użytkownik
 * wraca do `/login` i loguje się nowym hasłem, ten sam wzorzec co
 * `SignupPage.tsx` po Fundamencie „Fresh Install").
 */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(
        isPublicApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się zmienić hasła.')
          : 'Nie udało się zmienić hasła.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-brand">
            <div className="sidebar-brand-mark">R</div>
            <div className="sidebar-brand-text" style={{ fontSize: 16 }}>
              Smart<span>RMA</span> AI
            </div>
          </div>
          <h1 className="login-title">Link resetu hasła jest nieprawidłowy</h1>
          <p className="login-subtitle">
            Ten link wygasł, został już wykorzystany albo jest niepoprawny. Poproś o nowy na ekranie
            „Nie pamiętam hasła”.
          </p>
          <p className="text-sm text-muted" style={{ textAlign: 'center', marginTop: 18 }}>
            <Link to="/forgot-password">Wyślij nowy link</Link>
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-brand">
            <div className="sidebar-brand-mark">R</div>
            <div className="sidebar-brand-text" style={{ fontSize: 16 }}>
              Smart<span>RMA</span> AI
            </div>
          </div>
          <h1 className="login-title">Hasło zmienione</h1>
          <p className="login-subtitle">Zaloguj się nowym hasłem.</p>
          <Link
            to="/login"
            className="btn btn-primary w-full"
            style={{ justifyContent: 'center', padding: 11 }}
          >
            Przejdź do logowania
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="sidebar-brand-mark">R</div>
          <div className="sidebar-brand-text" style={{ fontSize: 16 }}>
            Smart<span>RMA</span> AI
          </div>
        </div>

        <h1 className="login-title">Ustaw nowe hasło</h1>
        <p className="login-subtitle">Wpisz nowe hasło do swojego konta SmartRMA.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <p className="field-error" style={{ display: 'block' }}>
              {error}
            </p>
          )}
          <div className="field">
            <label htmlFor="rp-password">Nowe hasło (min. 8 znaków)</label>
            <div className="password-field">
              <input
                id="rp-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
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
            {submitting ? 'Zapisywanie…' : 'Ustaw nowe hasło'}
          </button>
        </form>
      </div>
    </div>
  );
}
