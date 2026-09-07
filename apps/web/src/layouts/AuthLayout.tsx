import { Outlet } from 'react-router-dom';

/**
 * Audyt responsywności (K3) — dawniej owijał `<Outlet/>` we własną
 * wyśrodkowaną kartę, mimo że `LoginPage` (jedyny dotychczasowy konsument)
 * już renderuje pełny, samodzielny, responsywny layout strony logowania
 * (`.login-page` / `.login-card`). Efekt: karta w karcie, na 320px pole
 * e-mail miało 181px szerokości na 320px ekranu. `SignupPage` z tego samego
 * powodu celowo nie używa `AuthLayout` (patrz `router.tsx`) — ten layout
 * teraz robi to samo: nic nie dokłada, decyzję o wyglądzie strony zostawia
 * w całości stronie.
 */
export function AuthLayout() {
  return <Outlet />;
}
