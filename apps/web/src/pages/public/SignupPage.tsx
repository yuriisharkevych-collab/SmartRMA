import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { isPublicApiError } from '@/api/publicClient';
import { companiesApi, type CompanySignupPayload } from '@/api/companies.api';
import { EyeIcon, EyeOffIcon } from '@/components/common/icons';

/**
 * `/signup` — onboarding samoobsługowy. Fundament „Fresh Install" rozszerza
 * Etap 6 (Producent/Dystrybutor) o `Shop` i dokłada wymagany NIP; USUWA
 * auto-login (breaking change) — konto czeka na potwierdzenie e-maila
 * (AUTH-007), więc po sukcesie pokazujemy ekran "sprawdź skrzynkę" zamiast
 * przekierowywać od razu do panelu.
 */
export function SignupPage() {
  const [companyName, setCompanyName] = useState('');
  const [orgType, setOrgType] = useState<CompanySignupPayload['orgType']>('Shop');
  const [nip, setNip] = useState('');
  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminLastName, setAdminLastName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await companiesApi.signup({
        companyName: companyName.trim(),
        orgType,
        nip: nip.trim(),
        adminFirstName: adminFirstName.trim(),
        adminLastName: adminLastName.trim(),
        adminEmail: adminEmail.trim(),
        password,
      });
      setSubmittedEmail(result.email);
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

  if (submittedEmail) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-brand">
            <div className="sidebar-brand-mark">R</div>
            <div className="sidebar-brand-text" style={{ fontSize: 16 }}>
              Smart<span>RMA</span> AI
            </div>
          </div>
          <h1 className="login-title">Sprawdź skrzynkę e-mail</h1>
          <p className="login-subtitle">
            Wysłaliśmy link potwierdzający na adres <strong>{submittedEmail}</strong>. Kliknij go,
            aby aktywować konto — dopiero wtedy będzie można się zalogować.
          </p>
          <p className="text-sm text-muted" style={{ textAlign: 'center', marginTop: 18 }}>
            Nie widzisz wiadomości? Sprawdź folder Spam albo{' '}
            <Link to="/login">wróć do logowania</Link>, żeby wysłać link ponownie.
          </p>
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

        <h1 className="login-title">Załóż firmę w SmartRMA</h1>
        <p className="login-subtitle">
          Dla sklepów, producentów i dystrybutorów. Po potwierdzeniu e-maila skonfigurujesz markę,
          produkty i formularz reklamacyjny samodzielnie z panelu — bez naszej pomocy.
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
            <label htmlFor="su-org-type">Rodzaj działalności</label>
            <select
              id="su-org-type"
              value={orgType}
              onChange={(e) => setOrgType(e.target.value as CompanySignupPayload['orgType'])}
            >
              <option value="Shop">Sklep</option>
              <option value="Producent">Producent</option>
              <option value="Dystrybutor">Dystrybutor</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="su-nip">NIP</label>
            <input
              id="su-nip"
              type="text"
              required
              placeholder="np. 123-456-32-18"
              value={nip}
              onChange={(e) => setNip(e.target.value)}
              autoComplete="off"
            />
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
            {submitting ? 'Zakładanie firmy…' : 'Załóż firmę'}
          </button>
        </form>

        <p className="text-sm text-muted" style={{ textAlign: 'center', marginTop: 18 }}>
          Masz już konto? <Link to="/login">Zaloguj się</Link>
        </p>
      </div>
    </div>
  );
}
