-- AlterTable
ALTER TABLE "Manufacturer" ADD COLUMN     "complaintEmail" TEXT,
ADD COLUMN     "minPhotos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "requiresVideo" BOOLEAN NOT NULL DEFAULT false;
