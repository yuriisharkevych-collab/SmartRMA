-- AlterTable
ALTER TABLE "CaseItem" ADD COLUMN     "frameNumber" TEXT,
ADD COLUMN     "purchaseDate" TIMESTAMP(3),
ADD COLUMN     "purchaseProofNumber" TEXT,
ADD COLUMN     "serialNumber" TEXT;
