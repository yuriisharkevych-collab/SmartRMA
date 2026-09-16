/**
 * Bootstrap pierwszego konta Administratora — celowo POZA `prisma/seed.ts`
 * (ten plik jest środowiskowy: katalog `Permission` + role systemowe,
 * "NIE tworzy `Company`/`User` demo", patrz komentarz na górze `seed.ts`).
 *
 * Bez tego skryptu nie da się zalogować do świeżo postawionej instancji:
 * `POST /companies` nie istnieje (BR-086 — MVP ma dokładnie jedną `Company`,
 * `CompaniesService` jej nie tworzy), a `POST /users` wymaga już
 * zalogowanego aktora z uprawnieniem `users.create` — klasyczny problem
 * "jajko i kura" przy pierwszym uruchomieniu.
 *
 * Idempotentny: jeśli `Company` o podanej nazwie już istnieje, nie tworzy
 * duplikatu; jeśli `User` o podanym e-mailu już istnieje, kończy bez zmian
 * (nie nadpisuje hasła) — bezpieczny do wielokrotnego uruchamiania.
 *
 * Uruchomienie: `npm run seed:admin --workspace apps/api` (albo z katalogu
 * `apps/api`: `npm run seed:admin`). Wymaga wcześniejszego
 * `npx prisma migrate dev` (seeduje rolę systemową "Administrator", od
 * której ten skrypt zależy).
 *
 * Dane logowania — domyślne poniżej, nadpisywalne zmiennymi środowiskowymi
 * `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_COMPANY_NAME` (z `.env`, tak
 * samo jak reszta konfiguracji `apps/api`):
 *   e-mail: admin@smartrma.local
 *   hasło:  ChangeMe123!
 * Zmień hasło po pierwszym logowaniu (self-service change-password to
 * osobna, jeszcze nieistniejąca funkcja — na razie przez
 * `PATCH /users/:id` z uprawnieniem `users.edit`, jeśli takie ma).
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_STATUS_CATALOG } from '../src/modules/case-statuses/case-statuses.service';
import { SYSTEM_ROLE_CODES } from '../src/rbac/constants/roles.const';
import { deriveCaseNumberPrefix, slugify } from '../src/common/utils/organization-slug.util';

/**
 * Ten skrypt jest wywoływany bezpośrednio przez `ts-node`, NIE przez CLI
 * Prisma (które samo ładuje `.env` przed uruchomieniem `seed.ts`, patrz
 * `scripts/setup-env.js`/raport gotowości) — więc `.env` trzeba wczytać
 * ręcznie. Zamiast dodawać zależność `dotenv` (nieużywaną nigdzie indziej
 * w `apps/api` bezpośrednio — `@nestjs/config` ją opakowuje), minimalny
 * parser tej samej klasy co `scripts/setup-env.js` w korzeniu repo.
 */
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

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@smartrma.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';
const COMPANY_NAME = process.env.ADMIN_COMPANY_NAME ?? 'SmartRMA';
const COMPANY_SLUG = process.env.ADMIN_COMPANY_SLUG ?? slugify(COMPANY_NAME);

async function main(): Promise<void> {
  const role = await prisma.role.findFirst({ where: { companyId: null, code: SYSTEM_ROLE_CODES.ADMINISTRATOR } });
  if (!role) {
    throw new Error(
      'Rola systemowa "Administrator" nie istnieje w bazie. Uruchom najpierw `npx prisma migrate dev` ' +
        '(automatycznie odpala `prisma/seed.ts`, który zasiewa katalog Permission/Role), potem ponownie ten skrypt.',
    );
  }

  let company = await prisma.company.findFirst({ where: { name: COMPANY_NAME } });
  if (company) {
    console.log(`Firma "${company.name}" (${company.id}) już istnieje — pomijam tworzenie.`);
    if (!company.slug) {
      company = await prisma.company.update({ where: { id: company.id }, data: { slug: COMPANY_SLUG } });
      console.log(`Uzupełniono brakujący slug: "${company.slug}" (/reklamacja/${company.slug}).`);
    }
  } else {
    company = await prisma.company.create({ data: { name: COMPANY_NAME, slug: COMPANY_SLUG } });
    console.log(`Utworzono firmę "${company.name}" (${company.id}), slug "${company.slug}".`);

    // Własny prefiks numeracji OD RAZU — inaczej firma dostaje domyślne "RMA"
    // (`company-settings.service.ts`) i dzieli sekwencję numerów spraw z każdą
    // inną firmą bez własnego ustawienia, patrz doc-comment `deriveCaseNumberPrefix`.
    const caseNumberPrefix = deriveCaseNumberPrefix(company.name);
    await prisma.companySettings.create({ data: { companyId: company.id, caseNumberPrefix } });
    console.log(`  Prefiks numeracji spraw: "${caseNumberPrefix}" (Ustawienia → Numeracja, można zmienić).`);
  }

  // Status Workflow Refactor — bez tego wiersza `CasesService.create` rzuca
  // gołym 500 przy PIERWSZEJ próbie założenia sprawy w tej firmie (brak
  // statusu `isDefaultForNew`). Ten skrypt powstał PRZED tym refactorem i
  // nigdy nie został dopisany — `create-organization.ts` (ścieżka
  // Producent/Dystrybutor) już to robi poprawnie, ta linia to parytet z tamtym
  // skryptem. Idempotentne — jak `CaseStatusesService.seedDefaultCatalog`,
  // pomija, jeśli firma ma już jakikolwiek status (nie nadpisuje ręcznych
  // zmian admina przy ponownym uruchomieniu na istniejącej firmie).
  const existingStatuses = await prisma.caseStatusDefinition.findFirst({ where: { companyId: company.id } });
  if (!existingStatuses) {
    await prisma.caseStatusDefinition.createMany({
      data: DEFAULT_STATUS_CATALOG.map((row) => ({ ...row, companyId: company!.id })),
    });
    console.log(`  Katalog statusów: ${DEFAULT_STATUS_CATALOG.length} wierszy.`);
  }

  // `email` nie jest już globalnie unikalny (patrz `User.loginMethod=Pin` —
  // wiele kont może dzielić e-mail), więc `findFirst` zamiast `findUnique`;
  // ten skrypt tworzy wyłącznie konta Password, więc sprawdzamy kolizję
  // tylko wśród nich.
  const existingUser = await prisma.user.findFirst({ where: { email: ADMIN_EMAIL, loginMethod: 'Password' } });
  if (existingUser) {
    console.log(`Użytkownik ${ADMIN_EMAIL} już istnieje — pomijam tworzenie (hasło NIE jest resetowane).`);
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, Number(process.env.BCRYPT_ROUNDS ?? 10));
  const user = await prisma.user.create({
    data: {
      companyId: company.id,
      firstName: 'Admin',
      lastName: 'SmartRMA',
      email: ADMIN_EMAIL,
      passwordHash,
      emailVerifiedAt: new Date(),
      roles: { create: [{ roleId: role.id }] },
    },
  });

  console.log('');
  console.log('Utworzono konto Administratora:');
  console.log(`  e-mail: ${user.email}`);
  console.log(`  hasło:  ${ADMIN_PASSWORD}`);
  console.log('Zmień hasło po pierwszym logowaniu.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
