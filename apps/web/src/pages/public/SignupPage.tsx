import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isPublicApiError } from '@/api/publicClient';
import { companiesApi, type CompanySignupPayload } from '@/api/companies.api';
import { EyeIcon, EyeOffIcon } from '@/components/common/icons';
import { useAuth } from '@/hooks/useAuth';

/**
 * Etap 6 — `/signup`. Odpowiednik `AcceptPartnerInvitePage.tsx`, ale bez
 * zaproszenia z góry: KAŻDY może założyć nową organizację Producent/Dystrybutor
 * i od razu zostaje jej pierwszym (i jedynym) Administratorem — zero SQL, zero
 * skryptu developerskiego, zero pomocy administratora SmartRMA. Marka, katalog,
 * partnerzy i formularz publiczny konfiguruje się PO zalogowaniu, w tych samych
 * ekranach co każda inna firma (Producenci/Produkty/Partnerzy/Ustawienia) —
 * ten formularz zakłada wyłącznie "pustą skorupę" organizacji.
 */
export function SignupPage() {
  const { loginWithTokens } = useAuth();
  const navigate = useNavigate();

  const [companyName, setCompanyName] = useState('');
  const [orgKind, setOrgKind] = useState<CompanySignupPayload['orgKind']>('Producent');
  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminLastName, setAdminLastName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const tokens = await companiesApi.signup({
        companyName: companyName.trim(),
        orgKind,
        adminFirstName: adminFirstName.trim(),
        adminLastName: adminLastName.trim(),
        adminEmail: adminEmail.trim(),
        password,
      });
      loginWithTokens(tokens);
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        isPublicApiError(err)
          ? (err.response?.data.error.message ?? 'Nie udało się założyć firmy.')
          : 'Nie udało się założyć firmy.',
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
            Smart<span>RMA</span> AI
          </div>
        </div>

        <h1 className="login-title">Załóż firmę w SmartRMA</h1>
        <p className="login-subtitle">
          Dla producentów i dystrybutorów. Po założeniu skonfigurujesz markę, produkty i formularz
          reklamacyjny samodzielnie z panelu — bez naszej pomocy.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <p className="field-error" style={{ display: 'block' }}>
              {error}
            </p>
          )}
          <div className="field">
            <label htmlFor="su-company-name">Nazwa firmy</label>
            <input
              id="su-company-name"
              type="text"
              required
              minLength={2}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              autoComplete="organization"
            />
          </div>
          <div className="field">
            <label htmlFor="su-org-kind">Rodzaj działalności</label>
            <select
              id="su-org-kind"
              value={orgKind}
              onChange={(e) => setOrgKind(e.target.value as CompanySignupPayload['orgKind'])}
            >
              <option value="Producent">Producent</option>
              <option value="Dystrybutor">Dystrybutor</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="su-first-name">Imię (Administrator)</label>
            <input
              id="su-first-name"
              type="text"
              required
              value={adminFirstName}
              onChange={(e) => setAdminFirstName(e.target.value)}
              autoComplete="given-name"
            />
          </div>
          <div className="field">
            <label htmlFor="su-last-name">Nazwisko (Administrator)</label>
            <input
              id="su-last-name"
              type="text"
              required
              value={adminLastName}
              onChange={(e) => setAdminLastName(e.target.value)}
              autoComplete="family-name"
            />
          </div>
          <div className="field">
            <label htmlFor="su-email">Adres e-mail</label>
            <input
              id="su-email"
              type="email"
              required
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label htmlFor="su-password">Hasło (min. 8 znaków)</label>
            <div className="password-field">
              <input
                id="su-password"
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
            {submitting ? 'Zakładanie firmy…' : 'Załóż firmę i przejdź do panelu'}
          </button>
        </form>
      </div>
    </div>
  );
}
