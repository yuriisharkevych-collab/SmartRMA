/**
 * Producent/Dystrybutor + Partnerzy B2B — Faza 2. Zakłada NOWĄ organizację typu
 * `ManufacturerDistributor` (peer wobec Sklepu, TEN SAM panel/workflow, nie
 * osobna aplikacja) tym samym mechanizmem co `create-admin.ts` zakłada Sklep:
 * bezpośrednio przez `PrismaClient`, poza NestJS DI (skrypty bootstrapujące w
 * tym repo świadomie NIE uruchamiają aplikacji — patrz `create-admin.ts`).
 *
 * Zakłada w jednej transakcji:
 *  - `Company` (type=ManufacturerDistributor, orgKind, slug — Publiczny
 *    Formularz Reklamacyjny tej organizacji będzie pod `/reklamacja/:slug`),
 *  - siedzibę (`Shop`) — jak każda firma, do przypisania `User.shopId`,
 *  - własny, SAMOOPISANY profil (`Contractor`+`Manufacturer`+`Brand`) —
 *    "self-owned" oznacza WYŁĄCZNIE to, że właścicielem katalogowego rekordu
 *    jest TA SAMA firma, nie inny mechanizm; panel `ManufacturersPage.tsx`
 *    edytuje ten profil bez żadnych zmian w kodzie (Faza 3),
 *  - domyślny katalog statusów (`CaseStatusesService.DEFAULT_STATUS_CATALOG`
 *    — bez tego `CasesService.create` nie miałby wybrać statusu początkowego),
 *  - pierwszego Administratora.
 *
 * Idempotentny po nazwie firmy — jak `create-admin.ts`.
 *
 * Uruchomienie (z `apps/api`):
 *   ORG_NAME="Firma testowa" ORG_KIND=Producent \
 *   ORG_ADMIN_EMAIL=admin@firma-testowa.local ORG_ADMIN_PASSWORD=ChangeMe123! \
 *   npx ts-node scripts/create-organization.ts
 */
import { OrganizationKind, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_STATUS_CATALOG } from '../src/modules/case-statuses/case-statuses.service';
import { SYSTEM_ROLE_CODES } from '../src/rbac/constants/roles.const';
import { deriveCaseNumberPrefix, slugify } from '../src/common/utils/organization-slug.util';

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

const ORG_NAME = process.env.ORG_NAME;
const ORG_KIND = process.env.ORG_KIND as OrganizationKind | undefined;
const ORG_SLUG = process.env.ORG_SLUG ?? (ORG_NAME ? slugify(ORG_NAME) : undefined);
const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL;
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD;
const ORG_BRAND_NAME = process.env.ORG_BRAND_NAME ?? ORG_NAME;

async function main(): Promise<void> {
  if (!ORG_NAME || !ORG_ADMIN_EMAIL || !ORG_ADMIN_PASSWORD) {
    throw new Error('Wymagane zmienne: ORG_NAME, ORG_ADMIN_EMAIL, ORG_ADMIN_PASSWORD.');
  }
  if (ORG_KIND !== 'Producent' && ORG_KIND !== 'Dystrybutor') {
    throw new Error('ORG_KIND musi być "Producent" albo "Dystrybutor".');
  }

  const role = await prisma.role.findFirst({ where: { companyId: null, code: SYSTEM_ROLE_CODES.ADMINISTRATOR } });
  if (!role) {
    throw new Error('Rola systemowa "Administrator" nie istnieje — uruchom najpierw `npx prisma migrate dev`.');
  }

  let company = await prisma.company.findFirst({ where: { name: ORG_NAME } });
  if (company) {
    console.log(`Firma "${company.name}" (${company.id}) już istnieje — pomijam zakładanie.`);
  } else {
    company = await prisma.company.create({
      data: { name: ORG_NAME, slug: ORG_SLUG, type: 'ManufacturerDistributor', orgKind: ORG_KIND },
    });
    console.log(`Utworzono organizację "${company.name}" (${company.id}), typ=ManufacturerDistributor/${ORG_KIND}, slug="${company.slug}".`);

    // Własny prefiks numeracji OD RAZU — patrz doc-comment `deriveCaseNumberPrefix`
    // (bez tego organizacja dzieli sekwencję numerów spraw z każdą inną firmą
    // bez własnego ustawienia, np. z DAWIDAM).
    const caseNumberPrefix = deriveCaseNumberPrefix(company.name);
    await prisma.companySettings.create({ data: { companyId: company.id, caseNumberPrefix } });
    console.log(`  Prefiks numeracji spraw: "${caseNumberPrefix}" (Ustawienia → Numeracja, można zmienić).`);

    const shop = await prisma.shop.create({ data: { companyId: company.id, name: `${ORG_NAME} — siedziba` } });
    console.log(`  Siedziba (Shop): ${shop.id}`);

    // Self-owned: Contractor/Manufacturer/Brand należą do TEJ SAMEJ firmy —
    // to jest cały mechanizm "samoopisu", żaden nowy model nie jest potrzebny
    // (patrz doc-comment na górze pliku).
    const contractor = await prisma.contractor.create({
      data: { companyId: company.id, name: ORG_NAME, category: 'Manufacturer' },
    });
    const manufacturer = await prisma.manufacturer.create({
      data: { companyId: company.id, contractorId: contractor.id, submissionMethod: 'FormularzWWW' },
    });
    console.log(`  Własny profil (Contractor/Manufacturer): ${contractor.id} / ${manufacturer.id}`);

    if (ORG_BRAND_NAME) {
      const brand = await prisma.brand.create({
        data: { companyId: company.id, manufacturerId: manufacturer.id, name: ORG_BRAND_NAME },
      });
      console.log(`  Domyślna marka: "${brand.name}" (${brand.id}) — kolejne można dodać w panelu (Faza 3).`);
    }

    await prisma.caseStatusDefinition.createMany({
      data: DEFAULT_STATUS_CATALOG.map((row) => ({ ...row, companyId: company!.id })),
    });
    console.log(`  Katalog statusów: ${DEFAULT_STATUS_CATALOG.length} wierszy.`);
  }

  const existingUser = await prisma.user.findFirst({ where: { email: ORG_ADMIN_EMAIL, loginMethod: 'Password' } });
  if (existingUser) {
    console.log(`Użytkownik ${ORG_ADMIN_EMAIL} już istnieje — pomijam tworzenie (hasło NIE jest resetowane).`);
    return;
  }

  const passwordHash = await bcrypt.hash(ORG_ADMIN_PASSWORD, Number(process.env.BCRYPT_ROUNDS ?? 10));
  const user = await prisma.user.create({
    data: {
      companyId: company.id,
      firstName: 'Admin',
      lastName: ORG_NAME,
      email: ORG_ADMIN_EMAIL,
      passwordHash,
      roles: { create: [{ roleId: role.id }] },
    },
  });

  console.log('');
  console.log(`Utworzono konto Administratora organizacji "${ORG_NAME}":`);
  console.log(`  e-mail: ${user.email}`);
  console.log(`  hasło:  ${ORG_ADMIN_PASSWORD}`);
  console.log(`  Publiczny formularz: /reklamacja/${company.slug}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
