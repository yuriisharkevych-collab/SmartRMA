#!/usr/bin/env node
/**
 * Bootstrap `.env` na pierwsze uruchomienie — uruchamiane automatycznie
 * przez `postinstall` (`npm install`), żeby nikt nie musiał ręcznie
 * kopiować `.env.example`. Czysty Node.js (`fs`/`path`), bez powłoki —
 * działa identycznie na Windows (cmd/PowerShell), macOS i Linux.
 *
 * Kopiuje `.env.example` (jedno źródło z korzenia repo) do DOKŁADNIE
 * TRZECH miejsc — po jednym na KAŻDEGO konsumenta, nigdy dwa pliki dla
 * tego samego konsumenta:
 *  - `.env` (korzeń)     — Docker Compose (auto-load z katalogu projektu)
 *                          ORAZ Prisma CLI, gdy `npx prisma migrate dev`
 *                          jest wołane z korzenia (CWD w chwili wywołania)
 *  - `apps/api/.env`     — @nestjs/config (`ConfigModule.forRoot()` czyta
 *                          `.env` z CWD; `npm run start:dev --workspace
 *                          apps/api` ustawia CWD na `apps/api`)
 *  - `apps/web/.env`     — Vite czyta `.env` WYŁĄCZNIE z własnego katalogu
 *                          (`apps/web`), nie z korzenia monorepo
 *
 * POPRAWKA (błąd wykryty na pierwszym realnym uruchomieniu, Windows 11):
 * wcześniejsza wersja tworzyła DODATKOWO `apps/api/prisma/.env` jako
 * "siatkę bezpieczeństwa" na wypadek, gdyby Prisma CLI nie znalazło `.env`
 * w korzeniu. To był błąd — Prisma CLI, gdy znajdzie `.env` JEDNOCZEŚNIE
 * w CWD i w katalogu obok `schema.prisma`, z NAKŁADAJĄCYMI SIĘ zmiennymi,
 * nie wybiera cicho jednego z nich: rzuca twardy błąd konfliktu
 * ("There is a conflict between env vars in .env and apps/api/prisma/.env")
 * i przerywa migrację. Prisma jest tu CELOWO rygorystyczne (żeby nikt nie
 * polegał przypadkiem na złym pliku w produkcji) — odwrotnie niż zwykły
 * "fallback chain", w którym duplikat byłby nieszkodliwy. Dodanie
 * dodatkowego kandydata "na wszelki wypadek" było więc szkodliwe, nie
 * ostrożne. Naprawa: dokładnie jeden plik `.env` na każdą ścieżkę odczytu,
 * zero nakładających się kandydatów, które Prisma sama przegląda —
 * `apps/api/prisma/.env` nie jest już tworzone.
 *
 * Idempotentne — nie nadpisuje istniejącego `.env` (żeby nie zgubić
 * lokalnych zmian dewelopera przy kolejnym `npm install`).
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const sourceExample = path.join(rootDir, '.env.example');

const targets = [rootDir, path.join(rootDir, 'apps', 'api'), path.join(rootDir, 'apps', 'web')];

function main() {
  if (!fs.existsSync(sourceExample)) {
    console.warn('[setup-env] Brak .env.example w korzeniu repo — pomijam bootstrap .env.');
    return;
  }

  const contents = fs.readFileSync(sourceExample, 'utf8');

  for (const dir of targets) {
    const envPath = path.join(dir, '.env');
    if (fs.existsSync(envPath)) {
      console.log(`[setup-env] ${path.relative(rootDir, envPath) || '.env'} już istnieje — pomijam.`);
      continue;
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(envPath, contents);
    console.log(`[setup-env] Utworzono ${path.relative(rootDir, envPath)}`);
  }
}

main();
