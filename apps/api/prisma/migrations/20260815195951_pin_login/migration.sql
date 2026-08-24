-- CreateEnum
CREATE TYPE "LoginMethod" AS ENUM ('Password', 'Pin');

-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "maxPinAttempts" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "pinLength" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "pinLockoutDurationMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "pinLoginEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "loginMethod" "LoginMethod" NOT NULL DEFAULT 'Password',
ADD COLUMN     "pinHash" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Częściowy unikalny indeks (ręcznie dopisany, Prisma Schema DSL nie wspiera
-- WHERE na @@unique) — email pozostaje unikalny WYŁĄCZNIE wśród kont
-- loginMethod=Password; konta loginMethod=Pin mogą świadomie dzielić ten sam
-- e-mail (patrz komentarz przy modelu User w schema.prisma). Ten sam wzorzec
-- "prawdziwa unikalność poza atrybutem Prisma", co ręczne ograniczenie dla
-- Role.code (companyId IS NULL).
CREATE UNIQUE INDEX "User_email_password_key" ON "User"("email") WHERE "loginMethod" = 'Password';
