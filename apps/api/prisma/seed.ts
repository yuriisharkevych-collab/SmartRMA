/**
 * Seed danych startowych: katalog `Permission` (RBAC.md §2) + 5 ról
 * systemowych (RBAC.md §1) z przypisaniem uprawnień wg macierzy RBAC.md §3.
 * NIE tworzy `Company`/`User` demo — to świadomie poza zakresem (seed
 * środowiskowy, nie dane demonstracyjne; DECISIONS.md: "seed.ts wymaga
 * przepisania pod aktualny schemat" — ten plik to ten krok, ograniczony do
 * RBAC, żeby nie zgadywać danych biznesowych firmy/reklamacji).
 *
 * Uruchomienie: `npm run prisma:migrate --workspace apps/api` (uruchamia
 * seed automatycznie po migracji, patrz `package.json` -> `prisma.seed`).
 */
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '../src/rbac/constants/permissions.const';
import { SYSTEM_ROLE_CODES } from '../src/rbac/constants/roles.const';

const prisma = new PrismaClient();

const ALL_PERMISSION_CODES = Object.values(PERMISSIONS);

/**
 * Macierz ról × uprawnień — transkrypcja `RBAC.md` §3. `Administrator` i
 * `Kierownik` dostają `cases.decision.*` technicznie (macierz), ale
 * RBAC.md rekomenduje NIE przypisywać `cases.decision.*` Administratorowi
 * w seedzie domyślnym (decyzja konfiguracyjna, nie ograniczenie modelu) —
 * uwzględnione niżej.
 */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  [SYSTEM_ROLE_CODES.ADMINISTRATOR]: ALL_PERMISSION_CODES.filter(
    (code) => !code.startsWith('cases.decision.'),
  ),
  [SYSTEM_ROLE_CODES.KIEROWNIK]: [
    PERMISSIONS.CASES_VIEW,
    PERMISSIONS.CASES_CREATE,
    PERMISSIONS.CASES_EDIT,
    PERMISSIONS.CASES_STATUS_CHANGE,
    PERMISSIONS.CASES_DECISION_SET,
    PERMISSIONS.CASES_DECISION_APPROVE,
    PERMISSIONS.CASES_CANCEL,
    PERMISSIONS.CASES_ARCHIVE,
    PERMISSIONS.CASES_ASSIGN,
    PERMISSIONS.CASES_INFO_REQUEST_SEND,
    PERMISSIONS.CASES_PORTAL_MANAGE,
    PERMISSIONS.CASES_REPLACEMENT_MANAGE,
    PERMISSIONS.DOCUMENTS_UPLOAD,
    PERMISSIONS.DOCUMENTS_VIEW,
    PERMISSIONS.DOCUMENTS_MARK_INVALID,
    PERMISSIONS.NOTES_CREATE,
    PERMISSIONS.NOTES_VIEW,
    PERMISSIONS.MESSAGES_SEND,
    PERMISSIONS.MESSAGES_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_CREATE,
    PERMISSIONS.CUSTOMERS_EDIT,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PRODUCTS_MANAGE,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_MANAGE,
    PERMISSIONS.MANUFACTURERS_VIEW,
    PERMISSIONS.MANUFACTURERS_MANAGE,
    PERMISSIONS.CONTRACTORS_VIEW,
    PERMISSIONS.CONTRACTORS_MANAGE,
    PERMISSIONS.BRANDS_MANAGE,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.NOTIFICATIONS_VIEW,
    PERMISSIONS.REPORTS_VIEW,
  ],
  [SYSTEM_ROLE_CODES.PRACOWNIK]: [
    PERMISSIONS.CASES_VIEW,
    PERMISSIONS.CASES_CREATE,
    PERMISSIONS.CASES_EDIT,
    PERMISSIONS.CASES_STATUS_CHANGE,
    PERMISSIONS.CASES_DECISION_SET,
    PERMISSIONS.CASES_CANCEL,
    PERMISSIONS.CASES_INFO_REQUEST_SEND,
    PERMISSIONS.CASES_PORTAL_MANAGE,
    PERMISSIONS.CASES_REPLACEMENT_MANAGE,
    PERMISSIONS.DOCUMENTS_UPLOAD,
    PERMISSIONS.DOCUMENTS_VIEW,
    PERMISSIONS.DOCUMENTS_MARK_INVALID,
    PERMISSIONS.NOTES_CREATE,
    PERMISSIONS.NOTES_VIEW,
    PERMISSIONS.MESSAGES_SEND,
    PERMISSIONS.MESSAGES_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_CREATE,
    PERMISSIONS.CUSTOMERS_EDIT,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.MANUFACTURERS_VIEW,
    PERMISSIONS.CONTRACTORS_VIEW,
  ],
  [SYSTEM_ROLE_CODES.SERWIS]: [
    PERMISSIONS.CASES_REPLACEMENT_MANAGE,
    PERMISSIONS.DOCUMENTS_UPLOAD,
    PERMISSIONS.DOCUMENTS_VIEW,
    PERMISSIONS.NOTES_CREATE,
    PERMISSIONS.NOTES_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.MANUFACTURERS_VIEW,
    PERMISSIONS.CONTRACTORS_VIEW,
    // `cases.view`/`cases.status.change` u Serwisu są warunkowe w RBAC.md §3
    // ("sprawy przypisane do Serwisu / oddziału") — reguła zakresu, nie
    // pokrywana samym przypisaniem uprawnienia; do egzekwowania w serwisie.
    PERMISSIONS.CASES_VIEW,
    PERMISSIONS.CASES_STATUS_CHANGE,
  ],
  [SYSTEM_ROLE_CODES.ODCZYT]: [
    PERMISSIONS.CASES_VIEW,
    PERMISSIONS.DOCUMENTS_VIEW,
    PERMISSIONS.NOTES_VIEW,
    PERMISSIONS.MESSAGES_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.MANUFACTURERS_VIEW,
    PERMISSIONS.CONTRACTORS_VIEW,
    PERMISSIONS.REPORTS_VIEW,
  ],
};

async function main(): Promise<void> {
  console.log('Seed: Permission...');
  for (const code of ALL_PERMISSION_CODES) {
    await prisma.permission.upsert({
      where: { code },
      create: { code, module: code.split('.')[0], description: code },
      update: {},
    });
  }

  console.log('Seed: role systemowe...');
  for (const [code, permissionCodes] of Object.entries(ROLE_PERMISSIONS)) {
    // `findFirst`+`create` zamiast `upsert` na kluczu złożonym
    // `[companyId, code]` celowo — `companyId` jest tu zawsze `null`, a
    // `@@unique([companyId, code])` z nullable kolumną ma znaną lukę
    // (Postgres nie traktuje NULL=NULL w indeksie unikalnym, patrz raport
    // gotowości Zadanie 7, finding Medium) — seed nie polega na tym
    // ograniczeniu bazy, sam pilnuje idempotencji.
    let role = await prisma.role.findFirst({ where: { companyId: null, code } });
    role ??= await prisma.role.create({ data: { code, name: code, isSystem: true, companyId: null } });

    for (const permissionCode of permissionCodes) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { code: permissionCode } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }

  console.log('Seed zakończony.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
