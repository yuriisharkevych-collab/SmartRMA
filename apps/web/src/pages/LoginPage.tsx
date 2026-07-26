import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isApiError } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';

/** Odpowiednik `index.html` (ekran logowania) z prototypu — AUTH-001 przy błędnych danych. */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(isApiError(err) ? err.response?.data.error.message ?? 'Błąd logowania.' : 'Błąd logowania.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Logowanie</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <label className="flex flex-col gap-1 text-sm">
        E-mail
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Hasło
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        {submitting ? 'Logowanie…' : 'Zaloguj się'}
      </button>
    </form>
  );
}
