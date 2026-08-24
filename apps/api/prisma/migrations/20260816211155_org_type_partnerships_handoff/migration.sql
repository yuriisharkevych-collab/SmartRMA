-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('Shop', 'ManufacturerDistributor');

-- CreateEnum
CREATE TYPE "OrganizationKind" AS ENUM ('Producent', 'Dystrybutor');

-- CreateEnum
CREATE TYPE "CaseOriginType" AS ENUM ('DirectCustomer', 'PartnerB2B');

-- CreateEnum
CREATE TYPE "PartnershipStatus" AS ENUM ('Invited', 'Active', 'Inactive', 'Rejected');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "originType" "CaseOriginType" NOT NULL DEFAULT 'DirectCustomer';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "orgKind" "OrganizationKind",
ADD COLUMN     "type" "OrganizationType" NOT NULL DEFAULT 'Shop';

-- CreateTable
CREATE TABLE "Partnership" (
    "id" TEXT NOT NULL,
    "shopCompanyId" TEXT NOT NULL,
    "distributorCompanyId" TEXT NOT NULL,
    "status" "PartnershipStatus" NOT NULL DEFAULT 'Invited',
    "invitedByUserId" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "Partnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnershipBrand" (
    "id" TEXT NOT NULL,
    "partnershipId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,

    CONSTRAINT "PartnershipBrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseHandoff" (
    "id" TEXT NOT NULL,
    "originCaseId" TEXT NOT NULL,
    "originCompanyId" TEXT NOT NULL,
    "targetCaseId" TEXT NOT NULL,
    "targetCompanyId" TEXT NOT NULL,
    "partnershipId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Partnership_shopCompanyId_idx" ON "Partnership"("shopCompanyId");

-- CreateIndex
CREATE INDEX "Partnership_distributorCompanyId_idx" ON "Partnership"("distributorCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "Partnership_shopCompanyId_distributorCompanyId_key" ON "Partnership"("shopCompanyId", "distributorCompanyId");

-- CreateIndex
CREATE INDEX "PartnershipBrand_partnershipId_idx" ON "PartnershipBrand"("partnershipId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnershipBrand_partnershipId_brandId_key" ON "PartnershipBrand"("partnershipId", "brandId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseHandoff_originCaseId_key" ON "CaseHandoff"("originCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseHandoff_targetCaseId_key" ON "CaseHandoff"("targetCaseId");

-- CreateIndex
CREATE INDEX "CaseHandoff_originCompanyId_idx" ON "CaseHandoff"("originCompanyId");

-- CreateIndex
CREATE INDEX "CaseHandoff_targetCompanyId_idx" ON "CaseHandoff"("targetCompanyId");

-- CreateIndex
CREATE INDEX "CaseHandoff_partnershipId_idx" ON "CaseHandoff"("partnershipId");

-- AddForeignKey
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_shopCompanyId_fkey" FOREIGN KEY ("shopCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_distributorCompanyId_fkey" FOREIGN KEY ("distributorCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipBrand" ADD CONSTRAINT "PartnershipBrand_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipBrand" ADD CONSTRAINT "PartnershipBrand_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseHandoff" ADD CONSTRAINT "CaseHandoff_originCaseId_fkey" FOREIGN KEY ("originCaseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseHandoff" ADD CONSTRAINT "CaseHandoff_targetCaseId_fkey" FOREIGN KEY ("targetCaseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseHandoff" ADD CONSTRAINT "CaseHandoff_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseHandoff" ADD CONSTRAINT "CaseHandoff_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

