-- Status Workflow Refactor, część 2/2 — do uruchomienia WYŁĄCZNIE po
-- pomyślnym wykonaniu `prisma/scripts/backfill-case-statuses.ts` (część 1
-- dodała kolumnę `statusNew`, zasiała `CaseStatusDefinition` per firma i
-- wypełniła `statusNew` dla każdej istniejącej sprawy).

-- DropIndex (stary indeks na kolumnie typu enum CaseStatus)
DROP INDEX "Case_status_idx";

-- AlterTable — usuń starą kolumnę `status` (enum CaseStatus)
ALTER TABLE "Case" DROP COLUMN "status";

-- AlterTable — przemianuj `statusNew` -> `status`, teraz jedyna kolumna statusu
ALTER TABLE "Case" RENAME COLUMN "statusNew" TO "status";

-- Backfill (część 1) gwarantuje 100% pokrycie — kolumna staje się wymagana
ALTER TABLE "Case" ALTER COLUMN "status" SET NOT NULL;

-- CreateIndex (odtworzony na nowej kolumnie tekstowej)
CREATE INDEX "Case_status_idx" ON "Case"("status");

-- DropEnum (stary, zamknięty katalog statusów — zastąpiony `CaseStatusDefinition`)
DROP TYPE "CaseStatus";
