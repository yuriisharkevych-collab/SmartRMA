/**
 * Narzędzie testowe (nie do środowiska produkcyjnego) — dodaje pracownika o
 * WSKAZANEJ roli systemowej do ISTNIEJĄCEJ organizacji (po `Company.slug`),
 * bez tworzenia nowej firmy (w przeciwieństwie do `create-admin.ts`/
 * `create-organization.ts`). Potrzebne, bo `ROLE_PERMISSIONS[Administrator]`
 * CELOWO wyklucza `cases.decision.*` (RBAC.md §3/seed.ts) — testowanie
 * ścieżki decyzji (Faza 5/6 B2B/B2C) wymaga prawdziwego użytkownika roli
 * Kierownik w każdej testowanej organizacji, nie tylko Administratora.
 *
 * Zmienne środowiskowe: ORG_SLUG, ROLE_NAME (Administrator|Kierownik|
 * Pracownik|Serwis|Odczyt), EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD.
 * Ten sam wzorzec co `create-admin.ts` — surowy `PrismaClient`, bez DI Nest.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const orgSlug = process.env.ORG_SLUG;
  const roleName = process.env.ROLE_NAME;
  const email = process.env.EMPLOYEE_EMAIL;
  const password = process.env.EMPLOYEE_PASSWORD;
  if (!orgSlug || !roleName || !email || !password) {
    throw new Error('Wymagane: ORG_SLUG, ROLE_NAME, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD');
  }

  const company = await prisma.company.findFirst({ where: { slug: orgSlug } });
  if (!company) throw new Error(`Nie znaleziono firmy o slug=${orgSlug}`);

  const role = await prisma.role.findFirst({ where: { name: roleName } });
  if (!role) throw new Error(`Nie znaleziono roli ${roleName}`);

  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) {
    console.log(`Użytkownik ${email} już istnieje (id=${existing.id}) — pomijam.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      companyId: company.id,
      firstName: roleName,
      lastName: 'TEST',
      email,
      passwordHash,
      active: true,
      emailVerifiedAt: new Date(),
      roles: { create: { roleId: role.id } },
    },
  });

  console.log(`Utworzono ${email} (id=${user.id}) w firmie ${company.name} (${company.id}) z rolą ${roleName}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
