import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '@/api/auth.api';

/**
 * `/forgot-password` — Fundament „Fresh Install". Odpowiedź jest ZAWSZE ta
 * sama, niezależnie od tego, czy podany e-mail istnieje (`AccountRecoveryService.
 * forgotPassword` odpowiada 204 tak samo w obu przypadkach) — formularz musi
 * więc pokazywać JEDEN neutralny komunikat sukcesu, nigdy "nie znaleziono
 * konta", inaczej cała ochrona przed enumeracją kont traci sens na warstwie UI.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email.trim());
    } finally {
      // Celowo BEZ catch osobno rozróżniającego błąd — nawet awaria sieci nie
      // powinna ujawnić więcej niż neutralny komunikat; jedyny wyjątek to
      // walidacja formatu e-maila, którą przechwytuje `required`/`type="email"`.
      setSubmitting(false);
      setSubmitted(true);
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

        {submitted ? (
          <>
            <h1 className="login-title">Sprawdź skrzynkę e-mail</h1>
            <p className="login-subtitle">
              Jeśli konto o podanym adresie istnieje, wysłaliśmy na nie link do ustawienia nowego
              hasła. Link jest ważny 60 minut.
            </p>
          </>
        ) : (
          <>
            <h1 className="login-title">Nie pamiętam hasła</h1>
            <p className="login-subtitle">
              Podaj adres e-mail, na który wyślemy link do resetu hasła.
            </p>
            <form className="login-form" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="fp-email">Adres e-mail</label>
                <input
                  id="fp-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary w-full"
                style={{ justifyContent: 'center', padding: 11 }}
                disabled={submitting}
              >
                {submitting ? 'Wysyłanie…' : 'Wyślij link resetu hasła'}
              </button>
            </form>
          </>
        )}

        <p className="text-sm text-muted" style={{ textAlign: 'center', marginTop: 18 }}>
          <Link to="/login">Wróć do logowania</Link>
        </p>
      </div>
    </div>
  );
}
