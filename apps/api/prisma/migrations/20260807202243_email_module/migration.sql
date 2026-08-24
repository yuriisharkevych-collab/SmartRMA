-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('Smtp', 'Resend', 'Microsoft365', 'GoogleWorkspace');

-- CreateEnum
CREATE TYPE "SmtpEncryption" AS ENUM ('None', 'Tls', 'Ssl');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "EmailSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL DEFAULT 'Smtp',
    "senderName" TEXT,
    "senderEmail" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUsername" TEXT,
    "smtpPasswordEncrypted" TEXT,
    "smtpEncryption" "SmtpEncryption" NOT NULL DEFAULT 'Tls',
    "resendApiKeyEncrypted" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailSettings_companyId_key" ON "EmailSettings"("companyId");

-- CreateIndex
CREATE INDEX "EmailSettings_companyId_idx" ON "EmailSettings"("companyId");

-- AddForeignKey
ALTER TABLE "EmailSettings" ADD CONSTRAINT "EmailSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

