import { Injectable } from '@nestjs/common';
import { CaseConsent, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Insert-only (jak `AuditRepository`) — patrz komentarz przy modelu `CaseConsent`
 * w schemacie: KAŻDE złożenie formularza w Portalu tworzy nowy wiersz, żeby dało
 * się w przyszłości wykazać dokładnie, na jaką treść klauzuli/polityki klient się
 * zgodził w danym momencie.
 */
@Injectable()
export class CaseConsentRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    caseId: string;
    companyId: string;
    requiredConsent: boolean;
    marketingConsent: boolean;
    documentSharingConsent: boolean;
    clauseVersion: string;
    privacyPolicyUrl: string | null;
    privacyPolicyVersion: string | null;
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<CaseConsent> {
    return this.prisma.caseConsent.create({ data });
  }

  /** Najnowszy wpis dla sprawy — użyty do wystawienia `consentGiven` w widoku Portalu. */
  findLatestForCase(caseId: string): Promise<CaseConsent | null> {
    return this.prisma.caseConsent.findFirst({ where: { caseId }, orderBy: { createdAt: 'desc' } });
  }

  /** `cases.delete` (RBAC.md §5) — JEDYNY wyjątek od "insert-only" powyżej (celowo, na wyraźne żądanie właściciela, wyłącznie dla usuwania spraw testowych). */
  deleteAllForCase(
    caseId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Prisma.BatchPayload> {
    return client.caseConsent.deleteMany({ where: { caseId } });
  }
}
