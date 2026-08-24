-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "attentionNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "defaultCaseAgeStaleDays" INTEGER,
ADD COLUMN     "defaultStatusStaleDays" INTEGER;

-- AlterTable
ALTER TABLE "ManufacturerSLA" ADD COLUMN     "caseAgeStaleDaysOverride" INTEGER,
ADD COLUMN     "statusStaleDaysOverride" INTEGER;

-- Backfill: statusChangedAt = timestamp of the most recent status-changing
-- CaseHistory entry (StatusChanged/CaseClosed/CaseCancelled), falling back to
-- Case.createdAt for cases with no such entry (e.g. still in the status they
-- were created with). Without this, every pre-existing case would default to
-- "just changed status" (CURRENT_TIMESTAMP from the ALTER TABLE above) and
-- never trip the "days without status change" reminder until it actually
-- changes status again.
UPDATE "Case" c
SET "statusChangedAt" = COALESCE(
  (
    SELECT h."createdAt"
    FROM "CaseHistory" h
    WHERE h."caseId" = c.id
      AND h.action IN ('StatusChanged', 'CaseClosed', 'CaseCancelled')
    ORDER BY h."createdAt" DESC
    LIMIT 1
  ),
  c."createdAt"
);
