/**
 * Bootstrap pierwszego `PlatformAdmin` — mirror `create-admin.ts`, ale dla
 * modelu CAŁKOWICIE oddzielnego od `Company`/`User` (patrz `schema.prisma`,
 * doc-comment `PlatformAdmin`). Fundament „Fresh Install" (zadanie, sekcja 2):
 * "Nie zakładaj jednak tego użytkownika ręcznie w istniejącej bazie na tym
 * etapie" — TEN SKRYPT ISTNIEJE, ALE NIE ZOSTAŁ URUCHOMIONY jako część tego
 * zadania. Uruchomienie jest świadomą, osobną decyzją operatora, PÓŹNIEJ.
 *
 * Idempotentny: jeśli `PlatformAdmin` o podanym e-mailu już istnieje, kończy
 * bez zmian (nie nadpisuje hasła) — bezpieczny do wielokrotnego uruchamiania.
 * Wymaga `PLATFORM_JWT_SECRET` ustawionego w `.env` — bez niego konto by
 * istniało, ale `POST /platform-auth/login` i tak odrzucałby PRÓBĘ logowania
 * (PLATFORM-001, funkcja nieaktywna dopóki sekret nie jest skonfigurowany,
 * patrz `PlatformAuthService`).
 *
 * Uruchomienie (dopiero gdy operator świadomie o to poprosi):
 *   npm run seed:platform-admin --workspace apps/api
 * Dane logowania — nadpisywalne zmiennymi środowiskowymi
 * `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` z `.env`:
 *   e-mail: admin@smartrma.pl (domyślnie — docelowy login z zadania)
 *   hasło:  ZmienMnie123!
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'node:fs';
import * as path from 'node:path';

function loadEnvFile(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = /^\s*([\w.-]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.startsWith('"') && rawValue.endsWith('"') ? rawValue.slice(1, -1) : rawValue;
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '..', '.env'));

const prisma = new PrismaClient();

const PLATFORM_ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@smartrma.pl';
const PLATFORM_ADMIN_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD ?? 'ZmienMnie123!';

async function main(): Promise<void> {
  if (!process.env.PLATFORM_JWT_SECRET) {
    console.warn(
      'UWAGA: PLATFORM_JWT_SECRET nie jest ustawiony w .env — konto zostanie założone, ' +
        'ale logowanie (POST /platform-auth/login) pozostanie nieaktywne, dopóki go nie skonfigurujesz.',
    );
  }

  const existing = await prisma.platformAdmin.findUnique({ where: { email: PLATFORM_ADMIN_EMAIL } });
  if (existing) {
    console.log(`PlatformAdmin ${PLATFORM_ADMIN_EMAIL} już istnieje — pomijam tworzenie (hasło NIE jest resetowane).`);
    return;
  }

  const passwordHash = await bcrypt.hash(PLATFORM_ADMIN_PASSWORD, Number(process.env.BCRYPT_ROUNDS ?? 10));
  const admin = await prisma.platformAdmin.create({
    data: { email: PLATFORM_ADMIN_EMAIL, passwordHash, active: true },
  });

  console.log('');
  console.log('Utworzono konto PlatformAdmin:');
  console.log(`  e-mail: ${admin.email}`);
  console.log(`  hasło:  ${PLATFORM_ADMIN_PASSWORD}`);
  console.log('Zmień hasło po pierwszym logowaniu (self-service zmiana hasła dla PlatformAdmin nie istnieje jeszcze — reset ręczny przez bazę, analogicznie do apps/api/scripts/set-password.ts).');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
