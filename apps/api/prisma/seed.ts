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
import { NotificationChannel, PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '../src/rbac/constants/permissions.const';
import { SYSTEM_ROLE_CODES } from '../src/rbac/constants/roles.const';

const prisma = new PrismaClient();

/**
 * Szablony GLOBALNE (`companyId=null`) — bez nich `NotificationsService.
 * createNotificationFromTemplate` zawsze kończy się cichym NOTIFICATION-002
 * (brak szablonu), bo tabela `NotificationTemplate` nie miała żadnego seeda
 * od początku istnienia modułu. Każda firma może nadpisać dowolny z nich
 * (Ustawienia › Szablony wiadomości → tworzy wiersz z jej `companyId`,
 * `resolveTemplate` preferuje nadpisanie nad globalnym).
 */
const DEFAULT_NOTIFICATION_TEMPLATES: Array<{
  code: string;
  channel: NotificationChannel;
  subject?: string;
  bodyTemplate: string;
  variables: string[];
}> = [
  {
    code: 'case.created.customer',
    channel: NotificationChannel.Email,
    subject: 'Potwierdzenie przyjęcia reklamacji {{caseNumber}}',
    bodyTemplate:
      'Dzień dobry {{customerName}},\n\npotwierdzamy przyjęcie zgłoszenia reklamacyjnego {{caseNumber}} dotyczącego produktu: {{productModel}}.\n\nO kolejnych krokach będziemy informować na bieżąco.',
    variables: ['caseNumber', 'customerName', 'productModel'],
  },
  {
    // Publiczny Formularz Reklamacyjny — WYSYŁANY WPROST z `IntakeService` (nie przez
    // uniwersalny handler `case.created.customer`, patrz komentarz tam: ten handler
    // wymaga `clientPortalEnabled=true` JUŻ w momencie zdarzenia `CASE_CREATED`, a tu
    // Portal włącza się chwilę PO utworzeniu sprawy, żeby dopiero wtedy znać kod
    // dostępu do wpisania w treść).
    code: 'case.created.public.customer',
    channel: NotificationChannel.Email,
    subject: 'Potwierdzenie zgłoszenia reklamacji {{caseNumber}}',
    bodyTemplate:
      'Dzień dobry {{customerName}},\n\ndziękujemy za zgłoszenie reklamacji {{caseNumber}}.\n\nPrzyjęliśmy zgłoszenie z następującymi danymi:\nImię i nazwisko: {{customerName}}\nTelefon: {{customerPhone}}\nE-mail: {{customerEmail}}\nAdres: {{customerAddress}}\nProdukt: {{productName}}\nOpis usterki: {{description}}\n\nProsimy o sprawdzenie podanych danych w celu uniknięcia problemów związanych z kontaktem z Państwem. Jeśli którekolwiek z nich są nieprawidłowe, prosimy o kontakt — dane można też poprawić w Portalu Klienta.\n\nDalszy przebieg sprawy (historia, dokumenty, wiadomości, uzupełnianie brakujących danych) można śledzić w Portalu Klienta:\n{{portalUrl}}\n\nJeśli link nie zadziała, zaloguj się ręcznie podając numer reklamacji {{caseNumber}} i kod dostępu: {{accessCode}}\n\n{{companyName}}{{companyContactLine}}',
    variables: [
      'caseNumber',
      'customerName',
      'customerPhone',
      'customerEmail',
      'customerAddress',
      'productName',
      'description',
      'portalUrl',
      'accessCode',
      'companyName',
      'companyContactLine',
    ],
  },
  {
    // Moduł e-mail — wysyłany przez `CasesService.enablePortal` (pracownik generuje
    // kod dostępu dla sprawy założonej innym kanałem niż Publiczny Formularz, gdzie
    // odpowiednik tego e-maila jest już wysyłany bezpośrednio jako `case.created.public.customer`).
    code: 'case.portal_access.customer',
    channel: NotificationChannel.Email,
    subject: 'Dostęp do Portalu Klienta — reklamacja {{caseNumber}}',
    bodyTemplate:
      'Dzień dobry {{customerName}},\n\nwygenerowaliśmy dostęp do Portalu Klienta dla reklamacji {{caseNumber}}.\n\nLink do Portalu: {{portalUrl}}\nKod dostępu: {{accessCode}}\n\nZachowaj tę wiadomość — kod dostępu wysyłamy tylko raz, w momencie jego wygenerowania.\n\n{{companyName}}',
    variables: ['caseNumber', 'customerName', 'portalUrl', 'accessCode', 'companyName'],
  },
  {
    code: 'case.info_requested.customer',
    channel: NotificationChannel.Email,
    subject: 'Reklamacja {{caseNumber}} — prosimy o uzupełnienie danych',
    bodyTemplate:
      'Dzień dobry,\n\nw sprawie reklamacji {{caseNumber}} prosimy o dostarczenie: {{requestedItems}}.\n\n{{messageText}}',
    variables: ['caseNumber', 'requestedItems', 'messageText'],
  },
  {
    code: 'case.sent_to_manufacturer.customer',
    channel: NotificationChannel.Email,
    subject: 'Reklamacja {{caseNumber}} — przekazana do producenta',
    bodyTemplate:
      'Dzień dobry,\n\nreklamacja {{caseNumber}} została przekazana do producenta w celu rozpatrzenia. O decyzji poinformujemy niezwłocznie.',
    variables: ['caseNumber'],
  },
  {
    code: 'case.status_changed.customer',
    channel: NotificationChannel.Email,
    subject: 'Reklamacja {{caseNumber}} — zmiana statusu',
    bodyTemplate: 'Status reklamacji {{caseNumber}} zmienił się na: {{statusLabel}}.',
    variables: ['caseNumber', 'statusLabel'],
  },
  {
    code: 'case.ready_for_pickup.customer',
    channel: NotificationChannel.Email,
    subject: 'Reklamacja {{caseNumber}} — gotowa do odbioru',
    bodyTemplate: 'Dzień dobry,\n\nreklamacja {{caseNumber}} jest gotowa do odbioru. Zapraszamy do sklepu.',
    variables: ['caseNumber'],
  },
  {
    code: 'case.closed.customer',
    channel: NotificationChannel.Email,
    subject: 'Reklamacja {{caseNumber}} — zakończona',
    bodyTemplate: 'Dzień dobry,\n\nreklamacja {{caseNumber}} została zakończona. Dziękujemy za skorzystanie z naszych usług.',
    variables: ['caseNumber'],
  },
  {
    code: 'case.cancelled.customer',
    channel: NotificationChannel.Email,
    subject: 'Reklamacja {{caseNumber}} — anulowana',
    bodyTemplate: 'Reklamacja {{caseNumber}} została anulowana.\n\nPowód: {{reason}}.',
    variables: ['caseNumber', 'reason'],
  },
  {
    // Moduł e-mail — "nowa wiadomość od pracownika" (`CaseMessageAddedNotificationHandler`).
    code: 'case.message_added.customer',
    channel: NotificationChannel.Email,
    subject: 'Nowa wiadomość w sprawie {{caseNumber}}',
    bodyTemplate:
      'Dzień dobry {{customerName}},\n\notrzymałeś/aś nową wiadomość dotyczącą reklamacji {{caseNumber}}:\n\n"{{messagePreview}}"\n\nOdpowiedz w Portalu Klienta: {{portalUrl}}\n\n{{companyName}}',
    variables: ['caseNumber', 'customerName', 'messagePreview', 'portalUrl', 'companyName'],
  },
  {
    code: 'case.owner_changed.employee',
    channel: NotificationChannel.System,
    bodyTemplate: 'Przypisano Ci sprawę {{caseNumber}}.',
    variables: ['caseNumber'],
  },
  {
    code: 'case.attention_required.owner',
    channel: NotificationChannel.System,
    bodyTemplate: 'Sprawa {{caseNumber}} wymaga reakcji: {{reason}}.',
    variables: ['caseNumber', 'reason'],
  },
  {
    // Etap 5 — Dystrybutor/Producent zaprasza NOWEGO partnera e-mailem
    // (`PartnershipsService.invitePartner`) — jedyny e-mail w tym module
    // wysyłany do kogoś, kto jeszcze nie ma konta w SmartRMA.
    code: 'partnership.invited.partner',
    channel: NotificationChannel.Email,
    subject: 'Zaproszenie do współpracy z {{distributorName}} w SmartRMA',
    bodyTemplate:
      'Dzień dobry,\n\n{{distributorName}} zaprasza firmę {{companyName}} do współpracy w SmartRMA jako partner B2B, w zakresie marek: {{brandNames}}.\n\nAby założyć konto i zaakceptować zaproszenie, przejdź pod adres:\n{{inviteUrl}}\n\nJeżeli nie spodziewał(a)eś się tej wiadomości, możesz ją zignorować.',
    variables: ['distributorName', 'companyName', 'brandNames', 'inviteUrl'],
  },
];

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
    PERMISSIONS.CASES_HANDOFF_SEND,
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
    PERMISSIONS.PARTNERSHIPS_VIEW,
    PERMISSIONS.PARTNERSHIPS_MANAGE,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.NOTIFICATIONS_VIEW,
    PERMISSIONS.REPORTS_VIEW,
    // Status Workflow Refactor — RBAC.md §3 "caseStatuses.view" ✅ dla WSZYSTKICH
    // ról (modal zmiany statusu w CaseDetailPage potrzebuje katalogu, nie tylko
    // administrator). "caseStatuses.manage" pozostaje wyłącznie Administratorowi
    // (przez ALL_PERMISSION_CODES powyżej).
    PERMISSIONS.CASE_STATUSES_VIEW,
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
    PERMISSIONS.CASES_HANDOFF_SEND,
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
    PERMISSIONS.CASE_STATUSES_VIEW,
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
    PERMISSIONS.CASE_STATUSES_VIEW,
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
    PERMISSIONS.CASE_STATUSES_VIEW,
    PERMISSIONS.PARTNERSHIPS_VIEW,
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

  console.log('Seed: domyślne szablony powiadomień (globalne)...');
  for (const template of DEFAULT_NOTIFICATION_TEMPLATES) {
    const existing = await prisma.notificationTemplate.findFirst({
      where: { companyId: null, code: template.code, channel: template.channel },
    });
    if (!existing) {
      await prisma.notificationTemplate.create({ data: { ...template, companyId: null } });
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
