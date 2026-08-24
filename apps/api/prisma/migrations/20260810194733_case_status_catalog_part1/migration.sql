-- CreateEnum
CREATE TYPE "PortalStage" AS ENUM ('Zgloszona', 'Przyjeta', 'WTrakcie', 'Decyzja', 'Zakonczona');

-- CreateEnum
CREATE TYPE "DecisionFulfillmentMethod" AS ENUM ('Kurier', 'OdbiorOsobisty', 'PrzelewBankowy', 'Inne');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "decisionContractorId" TEXT,
ADD COLUMN     "decisionFulfillmentMethod" "DecisionFulfillmentMethod",
ADD COLUMN     "decisionIsPositive" BOOLEAN,
ADD COLUMN     "decisionJustification" TEXT,
ADD COLUMN     "decisionManufacturerResponse" TEXT,
ADD COLUMN     "statusNew" TEXT;

-- CreateTable
CREATE TABLE "CaseStatusDefinition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "isDefaultForNew" BOOLEAN NOT NULL DEFAULT false,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "requiredCheck" TEXT,
    "portalStage" "PortalStage" NOT NULL,
    "defaultNextAction" TEXT,
    "notifyCustomerTemplateCode" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseStatusDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseStatusDefinition_companyId_idx" ON "CaseStatusDefinition"("companyId");

-- CreateIndex
CREATE INDEX "CaseStatusDefinition_companyId_active_idx" ON "CaseStatusDefinition"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CaseStatusDefinition_companyId_code_key" ON "CaseStatusDefinition"("companyId", "code");

-- AddForeignKey
ALTER TABLE "CaseStatusDefinition" ADD CONSTRAINT "CaseStatusDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_decisionContractorId_fkey" FOREIGN KEY ("decisionContractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
