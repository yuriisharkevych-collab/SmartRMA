#!/usr/bin/env node
/**
 * Bootstrap `.env` na pierwsze uruchomienie — uruchamiane automatycznie
 * przez `postinstall` (`npm install`), żeby nikt nie musiał ręcznie
 * kopiować `.env.example`. Czysty Node.js (`fs`/`path`), bez powłoki —
 * działa identycznie na Windows (cmd/PowerShell), macOS i Linux.
 *
 * Kopiuje `.env.example` (jedno źródło z korzenia repo) do CZTERECH
 * miejsc, bo trzy różne narzędzia czytają `.env` z trzech różnych
 * katalogów roboczych:
 *  - `.env` (korzeń)             — Docker Compose (auto-load .env z katalogu projektu)
 *  - `apps/api/.env`             — @nestjs/config (ConfigModule.forRoot() czyta CWD,
 *                                   a `npm run start:dev --workspace apps/api` ustawia
 *                                   CWD na `apps/api`)
 *  - `apps/api/prisma/.env`      — siatka bezpieczeństwa: Prisma CLI szuka `.env`
 *                                   obok `schema.prisma`, zanim spadnie do CWD/package root
 *  - `apps/web/.env`             — Vite czyta `.env` WYŁĄCZNIE z własnego katalogu
 *                                   (`apps/web`), nie z korzenia monorepo
 *
 * Idempotentne — nie nadpisuje istniejącego `.env` (żeby nie zgubić
 * lokalnych zmian dewelopera przy kolejnym `npm install`).
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const sourceExample = path.join(rootDir, '.env.example');

const targets = [rootDir, path.join(rootDir, 'apps', 'api'), path.join(rootDir, 'apps', 'api', 'prisma'), path.join(rootDir, 'apps', 'web')];

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
