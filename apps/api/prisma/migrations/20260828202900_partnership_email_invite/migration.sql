-- Etap 5 (Partnerzy B2B) — Dystrybutor zaprasza NOWEGO partnera e-mailem
-- (`shopCompany` jeszcze nie istnieje w chwili zaproszenia). Token jednorazowy,
-- hashowany jak `Case.clientAccessCodeHash` — jawna wartość nigdy nie trafia
-- do bazy, tylko do wysłanego e-maila.

-- AlterTable
ALTER TABLE "Partnership" ADD COLUMN     "inviteEmail" TEXT,
ADD COLUMN     "inviteTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "inviteTokenHash" TEXT;

-- CreateIndex
CREATE INDEX "Partnership_inviteTokenHash_idx" ON "Partnership"("inviteTokenHash");
