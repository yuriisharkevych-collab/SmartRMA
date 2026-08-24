import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isPortalApiError } from '@/api/portalClient';
import { portalApi } from '@/api/portal.api';
import { setPortalSession } from '@/api/portal-token-storage';

/**
 * Numer sprawy + kod dostępu / bezpieczny link — mechanizm ODRĘBNY od loginu
 * pracownika, brak JWT (RBAC.md §1.2). Dwa warianty linku w URL:
 * - `?case=...&token=...` (bezpieczny, JEDNORAZOWY — generowany w `CaseDetailPage.tsx`)
 *   loguje automatycznie przy wejściu.
 * - `?case=...&code=...` (kod dostępu, WIELOKROTNEGO użytku — wysyłany w e-mailu
 *   potwierdzającym po Publicznym Formularzu Reklamacyjnym) TYLKO wypełnia pola,
 *   klient i tak potwierdza kliknięciem — kod nie jest jednorazowy, więc nie ma
 *   powodu ukrywać przed nim tego kroku jak przy tokenie.
 */
export function ClientLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const linkCaseNumber = searchParams.get('case');
  const linkToken = searchParams.get('token');
  const linkAccessCode = searchParams.get('code');

  const [caseNumber, setCaseNumber] = useState(linkCaseNumber ?? '');
  const [accessCode, setAccessCode] = useState(linkAccessCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [linkAttempted, setLinkAttempted] = useState(false);

  useEffect(() => {
    if (!linkCaseNumber || !linkToken || linkAttempted) return;
    setLinkAttempted(true);
    setSubmitting(true);
    portalApi
      .loginWithToken(linkCaseNumber, linkToken)
      .then((session) => {
        setPortalSession({ ...session, caseNumber: linkCaseNumber });
        navigate('/portal/case', { replace: true });
      })
      .catch((err) => {
        setError(describeError(err));
      })
      .finally(() => setSubmitting(false));
  }, [linkCaseNumber, linkToken, linkAttempted, navigate]);

  function describeError(err: unknown): string {
    if (isPortalApiError(err)) {
      if (err.response?.data.error.code === 'PORTAL-003') setLocked(true);
      return err.response?.data.error.message ?? 'Nie udało się zalogować.';
    }
    return 'Nie udało się zalogować.';
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!caseNumber.trim() || !accessCode.trim()) return;
    setSubmitting(true);
    setError(null);
    setLocked(false);
    try {
      const session = await portalApi.loginWithCode(caseNumber.trim(), accessCode.trim());
      setPortalSession({ ...session, caseNumber: caseNumber.trim() });
      navigate('/portal/case', { replace: true });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (linkCaseNumber && linkToken) {
    return (
      <div className="public-login-page">
        <div className="public-card" style={{ maxWidth: 396, width: '100%', textAlign: 'center' }}>
          <p>{submitting ? 'Logowanie…' : (error ?? 'Przekierowywanie…')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="public-login-page">
      <div className="public-card" style={{ maxWidth: 396, width: '100%' }}>
        <h1 className="login-title">Sprawdź status reklamacji</h1>
        <p className="login-subtitle">
          Podaj numer reklamacji i kod dostępu, który otrzymałeś(-aś) od sklepu.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <p className="field-error" style={{ display: 'block' }}>
              {error}
            </p>
          )}
          {locked && (
            <div className="lockout-banner">
              Zbyt wiele nieudanych prób. Spróbuj ponownie później lub skontaktuj się ze sklepem.
            </div>
          )}
          <div className="field">
            <label htmlFor="caseNumber">Numer reklamacji</label>
            <input
              id="caseNumber"
              type="text"
              required
              placeholder="RMA/2026/00001"
              value={caseNumber}
              onChange={(e) => setCaseNumber(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="accessCode">Kod dostępu</label>
            <input
              id="accessCode"
              type="text"
              required
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary w-full"
            style={{ justifyContent: 'center', padding: 11 }}
            disabled={submitting || locked}
          >
            {submitting ? 'Logowanie…' : 'Sprawdź status'}
          </button>
        </form>
      </div>
    </div>
  );
}
