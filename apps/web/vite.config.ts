import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // `strictPort` — bez tego Vite po cichu przechodzi na kolejny wolny port
  // (5174, 5175, …), gdy 5173 jest zajęte (np. osierocony proces z
  // poprzedniego `npm run dev` na Windows). To wyglądało jak "WEB się nie
  // uruchamia", choć w rzeczywistości działał pod innym adresem — teraz
  // taki konflikt kończy się głośnym błędem zamiast cichej zmiany portu.
  server: { port: 5173, strictPort: true, host: true },
  resolve: {
    alias: { '@': '/src' },
  },
});
