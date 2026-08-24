-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_uploadedById_fkey";

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "privacyPolicyUrl" TEXT,
ADD COLUMN     "privacyPolicyVersion" TEXT;

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "documentId" TEXT;

-- CreateTable
CREATE TABLE "CaseConsent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requiredConsent" BOOLEAN NOT NULL,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "clauseVersion" TEXT NOT NULL,
    "privacyPolicyUrl" TEXT,
    "privacyPolicyVersion" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseConsent_caseId_idx" ON "CaseConsent"("caseId");

-- CreateIndex
CREATE INDEX "CaseConsent_companyId_idx" ON "CaseConsent"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_documentId_key" ON "Message"("documentId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseConsent" ADD CONSTRAINT "CaseConsent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

