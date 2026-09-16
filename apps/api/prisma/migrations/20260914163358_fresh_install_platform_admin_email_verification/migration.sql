-- Fundament "Fresh Install" — Platform Admin + potwierdzenie e-mail + reset hasła.
-- Wyłącznie zmiany addytywne: nowe nullable kolumny, nowa niezależna tabela,
-- nowe indeksy. Zero DROP, zero zmiany typu istniejącej kolumny, zero utraty danych.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerificationTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "emailVerificationTokenHash" TEXT,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetTokenHash" TEXT;

-- Backfill: KAŻDE istniejące konto (założone przed tą migracją — bootstrap scripts,
-- panel admina, akceptacja zaproszenia partnera) jest traktowane jako już
-- zweryfikowane, żeby logowanie nikomu się nie zablokowało. Nowe konta z
-- publicznego /companies/signup dostają emailVerifiedAt=NULL jawnie w kodzie
-- (INSERT z pominiętym polem), więc ten UPDATE ich nie dotyczy — powstają PO
-- tej migracji.
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");

-- CreateIndex
CREATE INDEX "User_emailVerificationTokenHash_idx" ON "User"("emailVerificationTokenHash");

-- CreateIndex
CREATE INDEX "User_passwordResetTokenHash_idx" ON "User"("passwordResetTokenHash");
