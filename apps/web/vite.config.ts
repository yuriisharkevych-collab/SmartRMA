import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // `strictPort` — bez tego Vite po cichu przechodzi na kolejny wolny port
  // (5174, 5175, …), gdy 5173 jest zajęte (np. osierocony proces z
  // poprzedniego `npm run dev` na Windows). To wyglądało jak "WEB się nie
  // uruchamia", choć w rzeczywistości działał pod innym adresem — teraz
  // taki konflikt kończy się głośnym błędem zamiast cichej zmiany portu.
  // `allowedHosts` — Cloudflare Tunnel kieruje smartrma.pl na ten lokalny
  // Vite; bez jawnego wpisu Vite odrzuca żądania z nieznanym nagłówkiem
  // Host jako ochronę przed DNS rebinding. Tylko ten jeden host — celowo
  // NIE `true` (to otworzyłoby serwer na dowolny Host).
  //
  // `proxy` — Tunnel przekierowuje WYŁĄCZNIE na Vite (:5173), nie ma
  // osobnej trasy do backendu (:3000). Bez tego przeglądarka wołałaby
  // `VITE_API_BASE_URL` bezpośrednio (LAN IP po zwykłym HTTP) z poziomu
  // strony HTTPS — mixed content, po cichu blokowane. Ten proxy to ten sam
  // wzorzec co Caddy w produkcji (`handle /api/* { reverse_proxy api:3000 }`).
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    allowedHosts: ['smartrma.pl'],
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
  resolve: {
    alias: { '@': '/src' },
  },
});
