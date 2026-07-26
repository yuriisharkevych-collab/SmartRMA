/**
 * Transkrypcja katalogu uprawnień z `docs/architecture/RBAC.md` §2.
 * Źródło prawdy pozostaje `RBAC.md` — ten plik to typowana kopia do użycia
 * w kodzie (dekoratory `@RequirePermissions(...)`, seed danych `Permission`).
 * Dodanie nowego uprawnienia: najpierw RBAC.md, potem tutaj.
 */
export const PERMISSIONS = {
  // --- Cases ---
  CASES_VIEW: 'cases.view',
  CASES_CREATE: 'cases.create',
  CASES_EDIT: 'cases.edit',
  CASES_STATUS_CHANGE: 'cases.status.change',
  CASES_DECISION_SET: 'cases.decision.set',
  CASES_DECISION_APPROVE: 'cases.decision.approve',
  CASES_CANCEL: 'cases.cancel',
  CASES_ARCHIVE: 'cases.archive',
  CASES_ASSIGN: 'cases.assign',
  CASES_DELETE: 'cases.delete',
  CASES_INFO_REQUEST_SEND: 'cases.infoRequest.send',
  CASES_PORTAL_MANAGE: 'cases.portal.manage',
  CASES_REPLACEMENT_MANAGE: 'cases.replacement.manage',

  // --- Documents / Notes / Messages ---
  DOCUMENTS_UPLOAD: 'documents.upload',
  DOCUMENTS_VIEW: 'documents.view',
  DOCUMENTS_MARK_INVALID: 'documents.markInvalid',
  NOTES_CREATE: 'notes.create',
  NOTES_VIEW: 'notes.view',
  MESSAGES_SEND: 'messages.send',
  MESSAGES_VIEW: 'messages.view',

  // --- Customers / Products / Orders ---
  CUSTOMERS_VIEW: 'customers.view',
  CUSTOMERS_CREATE: 'customers.create',
  CUSTOMERS_EDIT: 'customers.edit',
  PRODUCTS_VIEW: 'products.view',
  PRODUCTS_MANAGE: 'products.manage',
  ORDERS_VIEW: 'orders.view',
  ORDERS_MANAGE: 'orders.manage',

  // --- Manufacturers / Brands ---
  CONTRACTORS_VIEW: 'contractors.view',
  CONTRACTORS_MANAGE: 'contractors.manage',
  MANUFACTURERS_VIEW: 'manufacturers.view',
  MANUFACTURERS_MANAGE: 'manufacturers.manage',
  BRANDS_MANAGE: 'brands.manage',

  // --- Users / Roles ---
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_EDIT: 'users.edit',
  USERS_DEACTIVATE: 'users.deactivate',
  USERS_RESET_PASSWORD: 'users.resetPassword',
  USERS_ROLES_ASSIGN: 'users.roles.assign',
  ROLES_MANAGE: 'roles.manage',

  // --- Company / Shop ---
  COMPANY_MANAGE: 'company.manage',
  SHOPS_MANAGE: 'shops.manage',

  // --- Notifications / Settings / Reports / Audit ---
  NOTIFICATIONS_TEMPLATES_MANAGE: 'notifications.templates.manage',
  NOTIFICATIONS_VIEW: 'notifications.view',
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_MANAGE: 'settings.manage',
  REPORTS_VIEW: 'reports.view',
  AUDITLOG_VIEW: 'auditlog.view',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
