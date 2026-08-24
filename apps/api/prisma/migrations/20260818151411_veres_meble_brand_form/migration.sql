-- Formularz reklamacyjny per MARKA (np. Veres Meble pod firmą DAWIDAM) + kto
-- zgłosił sprawę (partner B2B) i preferowany kontakt — czysto addytywne,
-- wszystkie nowe kolumny nullable.

-- CreateEnum
CREATE TYPE "CaseContactPreference" AS ENUM ('Customer', 'Partner');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "contactPreference" "CaseContactPreference",
ADD COLUMN     "reportedByContractorId" TEXT;

-- AlterTable
ALTER TABLE "Manufacturer" ADD COLUMN     "publicFormDisplayName" TEXT,
ADD COLUMN     "publicFormLogoPath" TEXT,
ADD COLUMN     "publicFormSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_publicFormSlug_key" ON "Manufacturer"("publicFormSlug");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_reportedByContractorId_fkey" FOREIGN KEY ("reportedByContractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
