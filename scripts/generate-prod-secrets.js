#!/usr/bin/env node
/**
 * Etap 7 (audyt gotowości produkcyjnej, punkt 9/20) — wygenerowanie
 * losowych sekretów dla `.env.prod`. Powód istnienia tego skryptu: lokalny
 * `.env` tego repo miał w chwili audytu DOSŁOWNIE `JWT_ACCESS_SECRET=
 * changeme-access-secret` — literalny placeholder z `.env.example`, mimo że
 * to jest "działające" środowisko. Ręczne kopiowanie `.env.example` i
 * "pamiętanie", żeby zmienić cztery konkretne linie, jest dokładnie tym
 * sposobem, w jaki ten błąd powstał. Ten skrypt usuwa ten krok ręczny.
 *
 * Użycie (z korzenia repo):
 *   node scripts/generate-prod-secrets.js
 *     → wypisuje 4 gotowe do wklejenia linie (JWT_... i ENCRYPTION_KEY) plus
 *       osobno POSTGRES_PASSWORD/REDIS_PASSWORD, NIC nie zapisuje na dysk
 *       (żeby nie nadpisać cudzego `.env.prod` po cichu).
 *   node scripts/generate-prod-secrets.js --write .env.prod
 *     → dopisuje/PODMIENIA te same linie WEWNĄTRZ istniejącego pliku
 *       (musi już istnieć — utwórz go najpierw z `.env.prod.example`),
 *       zachowując resztę pliku (DOMAIN, CORS_ORIGIN, itd.) bez zmian.
 *
 * Celowo NIE generuje `POSTGRES_USER`/`POSTGRES_DB`/`DOMAIN`/`CORS_ORIGIN`
 * — to są wartości, które administrator i tak musi świadomie wybrać, nie
 * losowe sekrety.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SECRET_KEYS = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_PORTAL_SECRET',
  'ENCRYPTION_KEY',
  'POSTGRES_PASSWORD',
  'REDIS_PASSWORD',
];

function randomSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function generateAll() {
  return Object.fromEntries(SECRET_KEYS.map((key) => [key, randomSecret()]));
}

function printOnly(secrets) {
  console.log('# Wklej poniższe linie do .env.prod (nadpisz istniejące wartości tych kluczy):\n');
  for (const [key, value] of Object.entries(secrets)) {
    console.log(`${key}=${value}`);
  }
  console.log('\n# Każde uruchomienie tego skryptu daje NOWE wartości — jeśli plik .env.prod już');
  console.log('# istnieje i jest w użyciu, podmiana tych sekretów wyloguje WSZYSTKICH (allowlista');
  console.log('# refresh tokenów w Redis wskazuje na stary, już nieistniejący sekret).');
}

function writeInto(filePath, secrets) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    console.error(`[generate-prod-secrets] Plik ${filePath} nie istnieje — utwórz go najpierw z .env.prod.example.`);
    process.exit(1);
  }
  const lines = fs.readFileSync(absolute, 'utf8').split('\n');
  const remaining = new Set(Object.keys(secrets));

  const updated = lines.map((line) => {
    const match = /^([A-Z_]+)=/.exec(line);
    if (match && remaining.has(match[1])) {
      remaining.delete(match[1]);
      return `${match[1]}=${secrets[match[1]]}`;
    }
    return line;
  });

  // Klucze, których w pliku jeszcze nie było — dopisz na końcu.
  for (const key of remaining) {
    updated.push(`${key}=${secrets[key]}`);
  }

  fs.writeFileSync(absolute, updated.join('\n'));
  console.log(`[generate-prod-secrets] Zaktualizowano ${SECRET_KEYS.length} sekretów w ${filePath}.`);
  console.log('[generate-prod-secrets] Uzupełnij ręcznie: DOMAIN, CORS_ORIGIN, VITE_API_BASE_URL, POSTGRES_USER, POSTGRES_DB.');
}

function main() {
  const args = process.argv.slice(2);
  const writeIndex = args.indexOf('--write');
  const secrets = generateAll();

  if (writeIndex === -1) {
    printOnly(secrets);
    return;
  }
  const target = args[writeIndex + 1];
  if (!target) {
    console.error('[generate-prod-secrets] Użycie: --write <ścieżka-do-.env.prod>');
    process.exit(1);
  }
  writeInto(target, secrets);
}

main();
