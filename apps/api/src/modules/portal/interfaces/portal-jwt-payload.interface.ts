/**
 * Payload tokenu sesji Portalu Klienta — CELOWO niesie wyłącznie `caseId`,
 * nigdy `userId`/e-mail/dane osobowe (RBAC.md §1.2 pkt 2: dostęp jest
 * "rekordowy", nie modułowy — klient nigdy nie ma tożsamości w systemie,
 * tylko chwilowy dostęp do jednej sprawy).
 */
export interface PortalJwtPayload {
  caseId: string;
  type: 'portal';
}
