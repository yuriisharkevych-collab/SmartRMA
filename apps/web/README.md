# apps/web — SmartRMA frontend (React + Vite)

Szkielet aplikacji — routing, layouty, autoryzacja, klient API. Ekrany biznesowe
(`pages/*`) są placeholderami wskazującymi odpowiednik 1:1 w `prototype/`
(patrz `PlaceholderPage`), do przeniesienia w kolejnym kroku.

## Start

Uruchamiane zwykle z korzenia monorepo (`../../README.md`) — sekcja poniżej to
odpowiednik dla pracy WYŁĄCZNIE w tym katalogu (np. bez backendu lokalnie):

```bash
cd ../..                 # do korzenia repo — postinstall tworzy .env tutaj i w apps/web
npm install
cd apps/web
npm run dev              # http://localhost:5173, oczekuje apps/api na :3000
```

`.env` w tym katalogu (`apps/web/.env`, `VITE_API_BASE_URL`) jest tworzony
automatycznie przez `postinstall` przy `npm install` uruchomionym z korzenia
repo (`scripts/setup-env.js`) — Vite czyta `.env` wyłącznie z własnego
katalogu, nie z korzenia monorepo, więc kopiowanie ręczne do korzenia (jak w
poprzedniej wersji tej instrukcji) nie miało żadnego efektu.

## Struktura

```
src/
  api/          klient axios (JWT + refresh), moduły *.api.ts per zasób
  providers/    AuthProvider, QueryProvider
  hooks/        useAuth
  routes/       konfiguracja react-router (powłoka pracownika vs. /portal)
  layouts/      AppLayout (pracownik), PortalLayout (klient), AuthLayout
  components/common/  ProtectedRoute, PermissionGate, ErrorBoundary, ...
  pages/        ekrany — biznesowe jako placeholder, patrz wyżej
  types/        typy współdzielone z kształtem API (ręcznie synchronizowane, nie generowane)
```
