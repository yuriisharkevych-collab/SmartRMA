import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '@/api/auth.api';

/**
 * `/verify-email?token=...` — Fundament „Fresh Install". Odpowiednik
 * `AcceptPartnerInvitePage.tsx` w tym, że wywołuje API automatycznie przy
 * wejściu na stronę (nie czeka na formularz — nie ma czego wypełniać, sam
 * token wystarcza), ale NIE loguje: konto po potwierdzeniu wymaga osobnego
 * `POST /auth/login` z hasłem (AUTH-007 przestaje blokować dopiero teraz).
 *
 * CELOWO `useMutation`, NIE `useQuery` — token jest jednorazowy (zużywa się
 * po stronie backendu przy pierwszym `POST /auth/verify-email`), a
 * `useQuery` ma domyślnie `refetchOnWindowFocus: true` (nigdzie w tym
 * projekcie globalnie wyłączone, patrz `QueryProvider.tsx`) — powrót fokusu
 * okna (np. przełączenie się z powrotem z klienta poczty) wywoływał CICHY
 * drugi `POST` z TYM SAMYM, już zużytym tokenem, kończący się `401 AUTH-008`
 * — dokładnie zaobserwowany błąd produkcyjny. `useMutation` nigdy nie
 * odpala się automatycznie przy fokusie/montowaniu — start wyłącznie przez
 * jawne `mutate()` w `useEffect`, dodatkowo zabezpieczony `hasFiredRef`, żeby
 * nawet podwójne wywołanie efektu (React 18 StrictMode w dev) nie wysłało
 * drugiego żądania.
 */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const hasFiredRef = useRef(false);

  const { mutate, isPending, isError, isIdle } = useMutation({
    mutationFn: (t: string) => authApi.verifyEmail(t),
  });

  useEffect(() => {
    if (!token || hasFiredRef.current) return;
    hasFiredRef.current = true;
    mutate(token);
  }, [token, mutate]);

  if (!token || isError) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-brand">
            <div className="sidebar-brand-mark">R</div>
            <div className="sidebar-brand-text" style={{ fontSize: 16 }}>
              Smart<span>RMA</span>
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

  if (isPending || isIdle) {
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
            Smart<span>RMA</span>
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
