/**
 * Formularz rozgałęziony marki — zakłada markę "Veres Meble" pod ISTNIEJĄCĄ
 * firmą DAWIDAM (ten sam NIP/tenant, patrz `Manufacturer.publicFormSlug` w
 * schemacie — NIE nowa `Company`) + kilku testowych partnerów B2B
 * (`Contractor`, category=Distributor) do testowania ścieżki B2B formularza.
 *
 * Idempotentny po nazwie (jak `create-admin.ts`/`create-organization.ts`).
 *
 * Uruchomienie (z `apps/api`):
 *   COMPANY_NAME="DAWIDAM" npx ts-node scripts/seed-veres-meble.ts
 */
import { PrismaClient } from '@prisma/client';
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

const COMPANY_NAME = process.env.COMPANY_NAME ?? 'DAWIDAM';
const BRAND_SLUG = process.env.BRAND_SLUG ?? 'veresmeble';
const BRAND_NAME = process.env.BRAND_NAME ?? 'Veres Meble';

const TEST_PARTNERS = ['Sklep Meblowy Kraina Malucha', 'Baby Room Sp. z o.o.'];

async function main(): Promise<void> {
  const company = await prisma.company.findFirst({ where: { name: COMPANY_NAME } });
  if (!company) throw new Error(`Firma "${COMPANY_NAME}" nie istnieje.`);

  const existingContractor = await prisma.contractor.findFirst({
    where: { companyId: company.id, name: BRAND_NAME },
    include: { manufacturerProfile: true },
  });

  let manufacturerId: string;
  if (existingContractor?.manufacturerProfile) {
    manufacturerId = existingContractor.manufacturerProfile.id;
    await prisma.manufacturer.update({
      where: { id: manufacturerId },
      data: { publicFormSlug: BRAND_SLUG, publicFormDisplayName: BRAND_NAME, minPhotos: 2, requiresProofOfPurchase: true },
    });
    console.log(`Marka "${BRAND_NAME}" już istniała (${manufacturerId}) — zaktualizowano publicFormSlug/wymagania.`);
  } else {
    const contractor = await prisma.contractor.create({
      data: { companyId: company.id, name: BRAND_NAME, category: 'Manufacturer' },
    });
    const manufacturer = await prisma.manufacturer.create({
      data: {
        companyId: company.id,
        contractorId: contractor.id,
        submissionMethod: 'FormularzWWW',
        publicFormSlug: BRAND_SLUG,
        publicFormDisplayName: BRAND_NAME,
        // WORKFLOW.md-owy wymóg właściciela dla tej marki — "minimum 2 zdjęcia".
        minPhotos: 2,
        maxPhotos: 8,
        requiresProofOfPurchase: true,
        requiresSerialNumber: false,
        requiresFrameNumber: false,
        requiresVideo: false,
      },
    });
    manufacturerId = manufacturer.id;
    console.log(`Utworzono markę "${BRAND_NAME}" (${manufacturerId}), formularz: /reklamacja-marka/${BRAND_SLUG}`);
  }

  for (const name of TEST_PARTNERS) {
    const existing = await prisma.contractor.findFirst({ where: { companyId: company.id, name } });
    if (existing) {
      console.log(`Partner testowy "${name}" już istnieje — pomijam.`);
      continue;
    }
    await prisma.contractor.create({
      data: { companyId: company.id, name, category: 'Distributor', active: true },
    });
    console.log(`Utworzono testowego partnera B2B: "${name}"`);
  }

  console.log('');
  console.log('Gotowe. Formularz marki dostępny pod:');
  console.log(`  /reklamacja-marka/${BRAND_SLUG}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
