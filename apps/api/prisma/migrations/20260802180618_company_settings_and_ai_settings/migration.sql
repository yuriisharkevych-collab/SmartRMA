-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "logoPath" TEXT,
ADD COLUMN     "regon" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "CompanySettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "caseNumberPrefix" TEXT NOT NULL DEFAULT 'RMA',
    "caseNumberPadding" INTEGER NOT NULL DEFAULT 5,
    "caseNumberResetYearly" BOOLEAN NOT NULL DEFAULT true,
    "passwordMinLength" INTEGER NOT NULL DEFAULT 8,
    "passwordRequireUppercase" BOOLEAN NOT NULL DEFAULT true,
    "passwordRequireNumber" BOOLEAN NOT NULL DEFAULT true,
    "passwordRequireSymbol" BOOLEAN NOT NULL DEFAULT false,
    "sessionTimeoutMinutes" INTEGER NOT NULL DEFAULT 15,
    "maxLoginAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockoutDurationMinutes" INTEGER NOT NULL DEFAULT 15,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "monitorCompleteness" BOOLEAN NOT NULL DEFAULT false,
    "trackDeadlines" BOOLEAN NOT NULL DEFAULT false,
    "draftCustomerReplies" BOOLEAN NOT NULL DEFAULT false,
    "draftManufacturerMessages" BOOLEAN NOT NULL DEFAULT false,
    "analyzeHistory" BOOLEAN NOT NULL DEFAULT false,
    "generateDailyPlan" BOOLEAN NOT NULL DEFAULT false,
    "analyzePhotos" BOOLEAN NOT NULL DEFAULT false,
    "findSimilarCases" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanySettings_companyId_key" ON "CompanySettings"("companyId");

-- CreateIndex
CREATE INDEX "CompanySettings_companyId_idx" ON "CompanySettings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AiSettings_companyId_key" ON "AiSettings"("companyId");

-- CreateIndex
CREATE INDEX "AiSettings_companyId_idx" ON "AiSettings"("companyId");

-- AddForeignKey
ALTER TABLE "CompanySettings" ADD CONSTRAINT "CompanySettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSettings" ADD CONSTRAINT "AiSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
