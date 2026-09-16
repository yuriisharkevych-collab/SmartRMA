import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '@/api/auth.api';

/**
 * `/verify-email?token=...` — Fundament „Fresh Install". Odpowiednik
 * `AcceptPartnerInvitePage.tsx` w tym, że wywołuje API automatycznie przy
 * wejściu na stronę (nie czeka na formularz — nie ma czego wypełniać, sam
 * token wystarcza), ale NIE loguje: konto po potwierdzeniu wymaga osobnego
 * `POST /auth/login` z hasłem (AUTH-007 przestaje blokować dopiero teraz).
 */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const { isLoading, isError } = useQuery({
    queryKey: ['verify-email', token],
    queryFn: () => authApi.verifyEmail(token!),
    enabled: Boolean(token),
    retry: false,
  });

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
          <h1 className="login-title">Link potwierdzający jest nieprawidłowy</h1>
          <p className="login-subtitle">
            Ten link wygasł, został już wykorzystany albo jest niepoprawny. Zaloguj się hasłem —
            jeśli konto nadal czeka na potwierdzenie, będzie można wysłać nowy link.
          </p>
          <p className="text-sm text-muted" style={{ textAlign: 'center', marginTop: 18 }}>
            <Link to="/login">Wróć do logowania</Link>
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p className="login-subtitle">Potwierdzanie adresu e-mail…</p>
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
        <h1 className="login-title">Adres e-mail potwierdzony</h1>
        <p className="login-subtitle">Możesz się teraz zalogować.</p>
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
