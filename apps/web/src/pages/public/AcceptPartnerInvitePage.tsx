import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { isApiError } from '@/api/client';
import { partnershipsApi } from '@/api/partnerships.api';
import { EyeIcon, EyeOffIcon } from '@/components/common/icons';
import { useAuth } from '@/hooks/useAuth';

/**
 * Etap 5 — `/partner-invite/:token`. Odpowiednik `LoginPage.tsx`, ale zamiast
 * logowania ZAKŁADA pierwsze konto Administratora nowo zaproszonej firmy
 * partnerskiej (`Partnership.inviteEmail`/`inviteTokenHash`) i od razu loguje
 * przez `loginWithTokens` — zaproszony NIGDY nie widzi ekranu logowania,
 * zaproszenie → aktywne konto → panel w jednym kroku, zgodnie z "nie chcę
 * ręcznego tworzenia kont przez administratora SmartRMA".
 */
export function AcceptPartnerInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { loginWithTokens } = useAuth();
  const navigate = useNavigate();

  const {
    data: info,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['partner-invite', token],
    queryFn: () => partnershipsApi.getInviteInfo(token!),
    enabled: Boolean(token),
    retry: false,
  });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const tokens = await partnershipsApi.acceptInvite(token, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
      });
      loginWithTokens(tokens);
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        isApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się założyć konta.')
          : 'Nie udało się założyć konta.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!token || isError) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-brand">
            <div className="sidebar-brand-mark">R</div>
            <div className="sidebar-brand-text" style={{ fontSize: 16 }}>
              Smart<span>RMA</span> AI
            </div>
          </div>
          <h1 className="login-title">Link zaproszenia jest nieprawidłowy</h1>
          <p className="login-subtitle">
            Ten link wygasł, został już wykorzystany albo jest niepoprawny. Poproś dystrybutora o
            wysłanie nowego zaproszenia.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || !info) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p className="login-subtitle">Wczytywanie zaproszenia…</p>
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

        <h1 className="login-title">Dołącz do SmartRMA</h1>
        <p className="login-subtitle">
          <strong>{info.distributorName}</strong> zaprasza firmę <strong>{info.companyName}</strong>{' '}
          do współpracy jako partner B2B w zakresie marek: {info.brandNames.join(', ')}. Załóż
          pierwsze konto Administratora dla adresu <strong>{info.email}</strong>, aby zaakceptować
          zaproszenie.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <p className="field-error" style={{ display: 'block' }}>
              {error}
            </p>
          )}
          <div className="field">
            <label htmlFor="pi-first-name">Imię</label>
            <input
              id="pi-first-name"
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
          </div>
          <div className="field">
            <label htmlFor="pi-last-name">Nazwisko</label>
            <input
              id="pi-last-name"
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </div>
          <div className="field">
            <label htmlFor="pi-password">Hasło (min. 8 znaków)</label>
            <div className="password-field">
              <input
                id="pi-password"
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
            {submitting ? 'Zakładanie konta…' : 'Załóż konto i dołącz'}
          </button>
        </form>
      </div>
    </div>
  );
}
